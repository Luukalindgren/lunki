# Palvelin Windows-pelikoneella ja etäkäynnistys SSH:lla

Tämä ohje täydentää [julkaisu.md](julkaisu.md):ää. Palvelin ajetaan
pelikoneella Windowsin tehtävänä (Task Scheduler), joten sen voi käynnistää
läppäriltä SSH:n yli ja se jää päälle, vaikka yhteys katkeaa.

Kaikki komennot ajetaan PowerShellissä. Järjestelmänvalvojana: Käynnistä →
kirjoita "PowerShell" → hiiren oikea → _Suorita järjestelmänvalvojana_.

## 1. Työkalut pelikoneelle (kerran, järjestelmänvalvojana)

```powershell
winget install -e --id Git.Git
winget install -e --id OpenJS.NodeJS.LTS
winget install -e --id tailscale.tailscale
```

Sulje ja avaa PowerShell uudelleen, jotta uudet komennot löytyvät:

```powershell
npm install -g pnpm@10
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned -Force
git clone https://github.com/Luukalindgren/lunki.git
cd lunki
pnpm install
```

Node.js:n pitää olla vähintään 22.13 (`node -v`).

## 2. Tunneli (kerran)

Kirjaudu Tailscaleen tehtäväpalkin kuvakkeesta ja aja:

```powershell
tailscale funnel --bg 2567
```

Jos komento antaa linkin, avaa se ja salli Funnel. Osoite (esim.
`https://pelikone.tailabc123.ts.net`) asetetaan repositorion muuttujaksi
`LUNKI_SERVER_URL` `wss://`-alulla, ks. [julkaisu.md](julkaisu.md).
`--bg` pitää tunnelin päällä myös uudelleenkäynnistysten yli.

## 3. Palvelin tehtäväksi (kerran, järjestelmänvalvojana)

Repositorion kansiossa:

```powershell
.\scripts\windows\lunki.ps1 asenna
```

Lisää `-Kaynnistyksessa`, jos palvelimen halutaan käynnistyvän aina koneen
käynnistyessä. Tehtävä ajetaan omalla tunnuksellasi myös silloin, kun kukaan
ei ole kirjautuneena, eikä salasanaa tallenneta.

Käyttö (myös SSH:n yli):

| Komento                                 | Mitä tekee                                                 |
| --------------------------------------- | ---------------------------------------------------------- |
| `.\scripts\windows\lunki.ps1 kaynnista` | `git pull`, `pnpm install` ja palvelin päälle              |
| `.\scripts\windows\lunki.ps1 tila`      | Onko palvelin ja tunneli päällä                            |
| `.\scripts\windows\lunki.ps1 loki`      | Palvelimen lokin loppu (`-Seuraa` jatkaa, Ctrl+C lopettaa) |
| `.\scripts\windows\lunki.ps1 pysayta`   | Pysäyttää palvelimen                                       |
| `.\scripts\windows\lunki.ps1 poista`    | Poistaa tehtävän                                           |

Loki on tiedostossa `logs\palvelin.log`. Ennätykset tallentuvat kuten ennenkin
tiedostoon `packages\server\data\lunki.sqlite`.

## 4. SSH-palvelin (kerran, järjestelmänvalvojana)

```powershell
Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
Set-Service sshd -StartupType Automatic
Start-Service sshd
New-ItemProperty -Path HKLM:\SOFTWARE\OpenSSH -Name DefaultShell `
  -Value C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe -PropertyType String -Force
Set-NetFirewallRule -Name OpenSSH-Server-In-TCP -RemoteAddress 100.64.0.0/10
```

Viimeinen rivi sallii SSH-yhteydet vain Tailscale-verkosta (osoitteet
`100.64.0.0/10`), joten kone ei näy SSH:lla edes kotiverkkoon. Komento
`whoami` kertoo käyttäjänimen; SSH:ssa käytetään osaa kenoviivan jälkeen.

Pelikone ei saa mennä lepotilaan, kun sitä halutaan käyttää etänä:
_Asetukset → Järjestelmä → Virta → Näyttö ja lepotila → Lepotila: Ei koskaan_
(verkkovirralla), tai `powercfg /change standby-timeout-ac 0`.

## 5. Läppäri (Mac)

1. Asenna Tailscale ja kirjaudu samalla tilillä. `tailscale status` näyttää
   pelikoneen nimen.
2. Kokeile salasanalla (Windows-tilin salasana, Microsoft-tilillä sen
   salasana, ei PIN). Käyttäjänimi lainausmerkeissä, jos siinä on välilyönti:
   ```sh
   ssh "Käyttäjä Nimi"@pelikone
   ```
3. Avainkirjautuminen, jotta salasanaa ei tarvita. Luo avain, jos sitä ei ole
   (`ls ~/.ssh/id_ed25519.pub`):
   ```sh
   ssh-keygen -t ed25519
   ```
   Järjestelmänvalvojakäyttäjän avaimet Windows lukee tiedostosta
   `C:\ProgramData\ssh\administrators_authorized_keys`, ei kotikansiosta.
   Lisää avain sinne Macilta yhdellä komennolla:
   ```sh
   ssh "Käyttäjä Nimi"@pelikone "Add-Content -Path C:\ProgramData\ssh\administrators_authorized_keys -Value '$(cat ~/.ssh/id_ed25519.pub)'; icacls.exe C:\ProgramData\ssh\administrators_authorized_keys /inheritance:r /grant '*S-1-5-32-544:F' /grant '*S-1-5-18:F'"
   ```
4. Oikotie `~/.ssh/config`-tiedostoon:
   ```
   Host lunki
     HostName pelikone
     User "Käyttäjä Nimi"
   ```
   Tämän jälkeen palvelin käynnistyy läppäriltä:
   ```sh
   ssh lunki 'cd ~\Projektit\lunki; .\scripts\windows\lunki.ps1 kaynnista'
   ```

## Vianetsintä

| Oire                              | Syy ja korjaus                                                                                                                                      |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ssh` jää odottamaan eikä yhdistä | Onko pelikone hereillä ja Tailscale päällä molemmissa? `tailscale ping pelikone`.                                                                   |
| `Permission denied` salasanalla   | Microsoft-tilillä salasana on tilin salasana. Jos tili on salasanaton, käytä avainta (avain lisätään silloin pelikoneella suoraan tiedostoon).      |
| Avain ei kelpaa                   | Avain on väärässä tiedostossa tai tiedoston oikeudet ovat väärin: aja kohdan 5 `icacls`-osa uudelleen pelikoneella järjestelmänvalvojana.           |
| `lunki.ps1 cannot be loaded`      | Suoritus estetty: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned -Force`.                                                                     |
| `kaynnista` sanoo "ei vastannut"  | Komento näyttää lokin lopun. Yleisimmät: `pnpm`-komentoa ei löydy (asenna `npm install -g pnpm@10`) tai portti 2567 on jo toisen ohjelman käytössä. |
