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
npm install -g pnpm@10.28.0
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned -Force
git clone https://github.com/Luukalindgren/lunki.git
cd lunki
pnpm install
```

Node.js:n pitää olla vähintään 22.13 (`node -v`); vanhempi päivittyy samalla
`winget`-komennolla. pnpm asennetaan samana versiona kuin `package.json`in
`packageManager`, koska muuten pnpm yrittää vaihtaa versiota itse ja kaatuu
Windowsilla.

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

| Komento                                    | Mitä tekee                                                 |
| ------------------------------------------ | ---------------------------------------------------------- |
| `.\scripts\windows\lunki.ps1 kaynnista`    | `git pull`, `pnpm install` ja palvelin päälle              |
| `.\scripts\windows\lunki.ps1 tila`         | Onko palvelin ja tunneli päällä                            |
| `.\scripts\windows\lunki.ps1 loki`         | Palvelimen lokin loppu (`-Seuraa` jatkaa, Ctrl+C lopettaa) |
| `.\scripts\windows\lunki.ps1 pysayta`      | Pysäyttää palvelimen                                       |
| `.\scripts\windows\lunki.ps1 poista`       | Poistaa tehtävän                                           |
| `.\scripts\windows\lunki.ps1 palauteavain` | Avain palautteiden hakuun issueiksi (kohta 7)              |

Loki on tiedostossa `logs\palvelin.log`. Ennätykset tallentuvat kuten ennenkin
tiedostoon `packages\server\data\lunki.sqlite`.

Tehtävä käynnistää palvelimen kuuntelemaan vain osoitetta `127.0.0.1`
(`LUNKI_HOST`): pelaajat tulevat Funnelin kautta, joten porttia 2567 ei näy
kotiverkkoon. Palvelin rajoittaa huoneiden luontia ja palautteita
IP-osoitetta kohden Funnelin kertoman pelaajan osoitteen mukaan; rajat ovat
väljiä, joten samassa verkossa pelaavat kaverit eivät huomaa niitä.

## 4. SSH-palvelin (kerran, järjestelmänvalvojana)

```powershell
Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
Set-Service sshd -StartupType Automatic
Start-Service sshd
New-ItemProperty -Path HKLM:\SOFTWARE\OpenSSH -Name DefaultShell `
  -Value C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe -PropertyType String -Force
if (Get-NetFirewallRule -Name OpenSSH-Server-In-TCP -ErrorAction SilentlyContinue) {
  Set-NetFirewallRule -Name OpenSSH-Server-In-TCP -RemoteAddress 100.64.0.0/10
} else {
  New-NetFirewallRule -Name OpenSSH-Server-In-TCP -DisplayName 'OpenSSH Server (sshd)' `
    -Direction Inbound -Protocol TCP -LocalPort 22 -Action Allow -RemoteAddress 100.64.0.0/10
}
```

Palomuurisääntö sallii SSH-yhteydet vain Tailscale-verkosta (osoitteet
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
3. Avainkirjautuminen, jotta salasanaa ei tarvita. Oma nimetty avain pitää
   sen erillään muista avaimista:
   ```sh
   ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519_lunki -C "macbook-pelikone"
   ```
4. Oikotie `~/.ssh/config`-tiedoston loppuun. `IdentitiesOnly yes` estää
   SSH:ta kokeilemasta muita avaimia tähän koneeseen:
   ```
   Host lunki
     HostName pelikone
     User "Käyttäjä Nimi"
     IdentityFile ~/.ssh/id_ed25519_lunki
     IdentitiesOnly yes
     AddKeysToAgent yes
     UseKeychain yes
   ```
   Kaksi viimeistä riviä tallentavat avaimen salasanan macOS:n Avainnippuun.
   Jos nimi `pelikone` ei ratkea, käytä `HostName`-rivillä koneen
   Tailscale-osoitetta (`100.x.y.z`, näkyy komennolla `tailscale status`).
5. Järjestelmänvalvojakäyttäjän avaimet Windows lukee tiedostosta
   `C:\ProgramData\ssh\administrators_authorized_keys`, ei kotikansiosta.
   Lisää julkinen avain sinne Macilta (kysyy kerran salasanan):
   ```sh
   ssh lunki "Add-Content -Path C:\ProgramData\ssh\administrators_authorized_keys -Value '$(cat ~/.ssh/id_ed25519_lunki.pub)'; icacls.exe C:\ProgramData\ssh\administrators_authorized_keys /inheritance:r /grant '*S-1-5-32-544:F' /grant '*S-1-5-18:F'"
   ```
   Tämän jälkeen palvelin käynnistyy läppäriltä ilman salasanaa:
   ```sh
   ssh lunki 'cd ~\Projektit\lunki; .\scripts\windows\lunki.ps1 kaynnista'
   ```

## 6. Lyhyet komennot Macilta

`scripts/mac/lunki.sh` kirjoittaa SSH-komennon puolestasi. Ota se käyttöön
aliaksena (korvaa polku repositorion kansiolla Macilla):

```sh
echo "alias lunki='$HOME/Projects/lunki/scripts/mac/lunki.sh'" >> ~/.zshrc
source ~/.zshrc
```

| Komento              | Mitä tekee                                           |
| -------------------- | ---------------------------------------------------- |
| `lunki`              | Palvelimen ja tunnelin tila                          |
| `lunki kaynnista`    | Päivittää koodin ja käynnistää palvelimen            |
| `lunki pysayta`      | Pysäyttää palvelimen                                 |
| `lunki uudelleen`    | Pysäyttää ja käynnistää (hakee samalla uuden koodin) |
| `lunki loki`         | Lokin loppu; `lunki seuraa` jatkaa (Ctrl+C lopettaa) |
| `lunki ssh`          | Tavallinen SSH-istunto pelikoneelle                  |
| `lunki lan`          | LAN-peli tältä Macilta ([docs/lan.md](lan.md))       |
| `lunki palauteavain` | Avain palautteiden hakuun issueiksi (kohta 7)        |

Oletuksena käytetään `~/.ssh/config`-oikotietä `lunki` ja pelikoneen kansiota
`~\Projektit\lunki`. Toisen voi antaa ympäristömuuttujilla `LUNKI_SSH_HOST`
ja `LUNKI_PC_DIR`.

## 7. Palautteet GitHub-issueiksi (kerran)

Pelaajien palautteet tallentuvat pelikoneen tietokantaan (`pnpm report`
näyttää ne). Työnkulku _Palautteet_ (GitHub Actions) hakee ne kolmen tunnin
välein Funnelin kautta ja tekee jokaisesta issuen tunnisteella `palaute`.
Niitä ei aloiteta automaattisesti: Luuka käy ne läpi ja vaihtaa tunnisteen
(esim. `ehdotus` tai bugi) tai sulkee issuen. Haettu palaute merkitään
tietokantaan viedyksi, joten samasta palautteesta ei tule toista issueta.

Palvelin luo hakuavaimen ensimmäisellä käynnistyksellä tiedostoon
`packages\server\data\palauteavain.txt`. Avain viedään kerran
repositorion salaisuudeksi `LUNKI_FEEDBACK_TOKEN`. Macilta, kun
[GitHub CLI](https://cli.github.com/) on kirjautuneena (`brew install gh`,
`gh auth login`):

```sh
lunki uudelleen
lunki palauteavain | gh secret set LUNKI_FEEDBACK_TOKEN -R Luukalindgren/lunki
```

Ilman `gh`:ta: aja `lunki palauteavain`, kopioi tuloste ja lisää se
GitHubissa: _Settings → Secrets and variables → Actions → New repository
secret_, nimi `LUNKI_FEEDBACK_TOKEN`. Kokeile: _Actions → Palautteet → Run
workflow_.

Avain vaihtuu poistamalla tiedosto, käynnistämällä palvelin uudelleen ja
viemällä uusi avain salaisuudeksi. Kun pelikone on kiinni, ajo päättyy
siististi ja palautteet haetaan seuraavalla kerralla. Palautelomake kertoo
pelaajille, että palaute julkaistaan pelin GitHubissa.

## Vianetsintä

| Oire                              | Syy ja korjaus                                                                                                                                                                |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ssh` jää odottamaan eikä yhdistä | Onko pelikone hereillä ja Tailscale päällä molemmissa? `tailscale ping pelikone`.                                                                                             |
| `Permission denied` salasanalla   | Microsoft-tilillä salasana on tilin salasana. Jos tili on salasanaton, käytä avainta (avain lisätään silloin pelikoneella suoraan tiedostoon).                                |
| Avain ei kelpaa                   | Avain on väärässä tiedostossa tai tiedoston oikeudet ovat väärin: aja läppärin kohdan 5 `icacls`-osa uudelleen pelikoneella järjestelmänvalvojana.                            |
| `lunki.ps1 cannot be loaded`      | Suoritus estetty: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned -Force`.                                                                                               |
| Palautteet-ajo: "hylkäsi avaimen" | Salaisuus `LUNKI_FEEDBACK_TOKEN` ei vastaa pelikoneen avainta: vie `lunki palauteavain` uudelleen salaisuudeksi.                                                              |
| `kaynnista` sanoo "ei vastannut"  | Komento näyttää lokin lopun. Yleisimmät: `pnpm`-komentoa ei löydy (asenna `npm install -g pnpm@10.28.0`), Node on liian vanha tai portti 2567 on jo toisen ohjelman käytössä. |
