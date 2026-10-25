<#
.SYNOPSIS
  Lunki-pelipalvelin Windows-pelikoneella: käynnistys, pysäytys ja tila myös SSH:n yli.

.DESCRIPTION
  Palvelin ajetaan Windowsin tehtävänä (Task Scheduler), jotta se jää päälle,
  vaikka SSH-yhteys tai PowerShell-ikkuna suljetaan. Ohje: docs/windows-palvelin.md.

  .\scripts\windows\lunki.ps1 asenna          Luo tehtävän (kerran, järjestelmänvalvojana)
  .\scripts\windows\lunki.ps1 kaynnista       Päivittää koodin ja käynnistää palvelimen
  .\scripts\windows\lunki.ps1 pysayta         Pysäyttää palvelimen
  .\scripts\windows\lunki.ps1 tila            Kertoo, onko palvelin ja tunneli päällä
  .\scripts\windows\lunki.ps1 loki [-Seuraa]  Näyttää palvelimen lokin lopun
  .\scripts\windows\lunki.ps1 poista          Poistaa tehtävän
#>
param(
  [Parameter(Position = 0)]
  [ValidateSet('asenna', 'kaynnista', 'pysayta', 'tila', 'loki', 'poista', 'aja')]
  [string]$Komento = 'tila',
  # asenna: käynnistä palvelin myös aina, kun kone käynnistyy.
  [switch]$Kaynnistyksessa,
  # loki: jatka lokin seuraamista (Ctrl+C lopettaa).
  [switch]$Seuraa
)

$ErrorActionPreference = 'Stop'
# SSH:n yli Windows PowerShell tulostaa muuten vanhalla koodisivulla, ja ääkköset
# sotkeutuvat Macin terminaalissa.
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false } catch { }
$TaskName = 'Lunki-palvelin'
$Port = 2567
$Repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$LogDir = Join-Path $Repo 'logs'
$Log = Join-Path $LogDir 'palvelin.log'

function Get-ServerTask {
  Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
}

function Get-ListenerPid {
  $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($conn) { $conn.OwningProcess } else { $null }
}

function Test-Health {
  try {
    $res = Invoke-WebRequest "http://localhost:$Port/__healthcheck" -UseBasicParsing -TimeoutSec 3
    return $res.StatusCode -eq 200
  } catch {
    return $false
  }
}

function Write-Log([string]$text) {
  Add-Content -Path $Log -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $text" -Encoding UTF8
}

function Assert-Node {
  # node:sqlite tarvitsee vähintään Node 22.13.
  $version = (cmd.exe /d /c 'node -v 2>nul' | Out-String).Trim().TrimStart('v')
  if (-not $version) { throw 'Node.js puuttuu. Asenna: winget install -e --id OpenJS.NodeJS.LTS' }
  if ([version]$version -lt [version]'22.13.0') {
    throw "Node.js $version on liian vanha (tarvitaan 22.13 tai uudempi). Päivitä: winget install -e --id OpenJS.NodeJS.LTS"
  }
}

function Assert-Task {
  if (-not (Get-ServerTask)) {
    throw "Tehtävää '$TaskName' ei ole. Aja ensin järjestelmänvalvojana: .\scripts\windows\lunki.ps1 asenna"
  }
}

switch ($Komento) {
  'asenna' {
    $admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
      [Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $admin) { throw 'Aja asennus järjestelmänvalvojana (tai SSH:n yli, joka on jo järjestelmänvalvoja).' }

    $ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $action = New-ScheduledTaskAction -Execute $ps -WorkingDirectory $Repo `
      -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" aja"
    # S4U: ajetaan omana käyttäjänä myös silloin, kun kukaan ei ole kirjautuneena,
    # eikä salasanaa tarvitse tallentaa.
    $principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType S4U
    $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) `
      -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -StartWhenAvailable
    $triggers = @()
    if ($Kaynnistyksessa) { $triggers += New-ScheduledTaskTrigger -AtStartup }

    $task = New-ScheduledTask -Action $action -Principal $principal -Settings $settings `
      -Description 'Lunki-pelipalvelin (scripts/windows/lunki.ps1)'
    if ($triggers.Count -gt 0) { $task.Triggers = $triggers }
    Register-ScheduledTask -TaskName $TaskName -InputObject $task -Force | Out-Null

    Write-Host "Tehtävä '$TaskName' luotu (kansio $Repo)."
    if ($Kaynnistyksessa) { Write-Host 'Palvelin käynnistyy myös aina koneen käynnistyessä.' }
    Write-Host 'Käynnistä palvelin: .\scripts\windows\lunki.ps1 kaynnista'
  }

  'aja' {
    # Tehtävän varsinainen työ: päivitys ja palvelin. Kaikki tuloste menee lokiin.
    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
    if ((Test-Path $Log) -and (Get-Item $Log).Length -gt 5MB) {
      Move-Item $Log (Join-Path $LogDir 'palvelin.edellinen.log') -Force
    }
    Set-Location $Repo
    Write-Log 'Päivitetään koodi (git pull)'
    cmd.exe /d /c "git pull --ff-only >> `"$Log`" 2>&1"
    if ($LASTEXITCODE -ne 0) { Write-Log 'git pull epäonnistui, jatketaan nykyisellä koodilla' }
    Write-Log 'Asennetaan riippuvuudet (pnpm install)'
    cmd.exe /d /c "pnpm install --frozen-lockfile >> `"$Log`" 2>&1"
    if ($LASTEXITCODE -ne 0) {
      Write-Log 'pnpm install epäonnistui, palvelinta ei käynnistetty'
      exit 1
    }
    Write-Log 'Käynnistetään palvelin (pnpm run server)'
    # Pelkkä "pnpm server" on pnpm:n oma komento, joka ei aja skriptiä.
    cmd.exe /d /c "pnpm run server >> `"$Log`" 2>&1"
    Write-Log "Palvelin pysähtyi (koodi $LASTEXITCODE)"
    exit $LASTEXITCODE
  }

  'kaynnista' {
    Assert-Task
    Assert-Node
    if (Get-ListenerPid) {
      Write-Host "Palvelin on jo päällä (portti $Port)."
      return
    }
    Start-ScheduledTask -TaskName $TaskName
    Write-Host 'Käynnistetään: päivitetään koodi ja riippuvuudet, sitten palvelin...'
    $deadline = (Get-Date).AddMinutes(3)
    while ((Get-Date) -lt $deadline) {
      Start-Sleep -Seconds 2
      if (Test-Health) {
        Write-Host "Palvelin on päällä (portti $Port)."
        return
      }
      if ((Get-ServerTask).State -ne 'Running') { break }
    }
    Write-Host 'Palvelin ei vastannut. Lokin loppu:'
    if (Test-Path $Log) { Get-Content $Log -Tail 30 -Encoding UTF8 }
    exit 1
  }

  'pysayta' {
    Assert-Task
    Stop-ScheduledTask -TaskName $TaskName
    $listener = Get-ListenerPid
    if ($listener) { taskkill.exe /PID $listener /T /F | Out-Null }
    Write-Host 'Palvelin pysäytetty.'
  }

  'tila' {
    $task = Get-ServerTask
    if ($task) { Write-Host "Tehtävä:    $($task.State)" } else { Write-Host 'Tehtävä:    ei asennettu (lunki.ps1 asenna)' }
    if (Test-Health) { Write-Host "Palvelin:   päällä (portti $Port)" } else { Write-Host 'Palvelin:   ei vastaa' }
    if (Get-Command tailscale -ErrorAction SilentlyContinue) {
      $funnel = (tailscale funnel status 2>&1 | Out-String).Trim()
      Write-Host "Tunneli:`n$funnel"
    } else {
      Write-Host 'Tunneli:    tailscale-komentoa ei löytynyt'
    }
  }

  'loki' {
    if (-not (Test-Path $Log)) {
      Write-Host "Lokia ei vielä ole ($Log)."
      return
    }
    if ($Seuraa) { Get-Content $Log -Tail 40 -Wait -Encoding UTF8 } else { Get-Content $Log -Tail 40 -Encoding UTF8 }
  }

  'poista' {
    Assert-Task
    Stop-ScheduledTask -TaskName $TaskName
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Tehtävä '$TaskName' poistettu."
  }
}
