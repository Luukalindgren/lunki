# Julkaisu kavereille

Peli koostuu kahdesta osasta:

- **Asiakas** (selainpeli) on GitHub Pagesissa:
  <https://luukalindgren.github.io/lunki/>. Se päivittyy itsestään, kun
  main-haaraan yhdistetään PR (työnkulku _Julkaisu_).
- **Pelipalvelin** pyörii Luukan pelikoneella. Yksinpeli toimii ilman sitä;
  moninpeliin palvelimen pitää olla päällä.

GitHub Pages on HTTPS-sivu, joten selain hyväksyy vain suojatun
`wss://`-yhteyden palvelimeen. Siksi palvelin julkaistaan tunnelin kautta:
porttia ei tarvitse avata reitittimestä, ja tunneli hoitaa sertifikaatin.

## Kertaluonteiset asetukset

1. **GitHub Pages päälle:** repositorion _Settings → Pages → Build and
   deployment → Source: GitHub Actions_. Aja sitten _Actions → Julkaisu →
   Run workflow_ (tai yhdistä mikä tahansa PR).
2. **Node.js ja pnpm pelikoneelle:** asenna [Node.js 22](https://nodejs.org/) (vähintään 22.13)
   (LTS-asennin käy) ja aja PowerShellissä `corepack enable`.
3. **Koodi pelikoneelle:**
   ```powershell
   git clone https://github.com/Luukalindgren/lunki.git
   cd lunki
   pnpm install
   ```
4. **Tunneli (suositus: Tailscale Funnel, pysyvä osoite ilman omaa
   verkkotunnusta):**
   1. Asenna [Tailscale](https://tailscale.com/download) ja kirjaudu.
   2. Aja PowerShellissä `tailscale funnel --bg 2567`. Jos Funnel ei ole vielä
      sallittu, komento antaa linkin, josta sen saa päälle (HTTPS-varmenteet ja
      Funnel tailnetin asetuksista).
   3. Komento tulostaa osoitteen, esim. `https://pelikone.tailabc123.ts.net`.
      `--bg` pitää tunnelin päällä myös uudelleenkäynnistysten yli.
5. **Palvelimen osoite asiakkaalle:** repositorion _Settings → Secrets and
   variables → Actions → Variables → New repository variable_:
   - nimi `LUNKI_SERVER_URL`
   - arvo sama osoite `wss://`-alulla, esim. `wss://pelikone.tailabc123.ts.net`

   Aja _Julkaisu_ uudelleen, niin peli käyttää tätä palvelinta.

## Pelipäivänä

1. Pelikoneella repositorion kansiossa:
   ```powershell
   git pull
   pnpm install
   pnpm server
   ```
   Palvelin kertoo kuuntelevansa porttia 2567. Ikkuna pidetään auki pelin ajan.
   Ennätyslista tallentuu tiedostoon `packages/server/data/lunki.sqlite`
   (muutettavissa ympäristömuuttujalla `LUNKI_DB`), joten se säilyy
   uudelleenkäynnistysten yli. Varmuuskopioksi riittää tiedoston kopio.
2. Avaa <https://luukalindgren.github.io/lunki/> → **Moninpeli**. Rivi
   "Palvelin päällä" kertoo, että yhteys toimii.
3. **Luo uusi huone** ja lähetä kavereille kutsulinkki (_Kopioi kutsulinkki_)
   tai koodi (esim. `LUNKI-4F7K`). Kaverit avaavat linkin, kirjoittavat
   nimimerkin ja painavat **Valmis!**. Valitse asetukset ja **Aloita kisa**.

## Vaihtoehto: Cloudflaren pikatunneli

Jos Tailscale ei sovi, [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)
antaa tilapäisen osoitteen ilman tiliä:

```powershell
cloudflared tunnel --url http://localhost:2567
```

Osoite (esim. `https://satunnainen-nimi.trycloudflare.com`) vaihtuu joka
käynnistyksellä, joten sitä ei kannata laittaa `LUNKI_SERVER_URL`-muuttujaan.
Anna se sen sijaan pelin osoitteessa:
`https://luukalindgren.github.io/lunki/?palvelin=wss://satunnainen-nimi.trycloudflare.com`.
Kutsulinkki kuljettaa `palvelin`-parametrin mukanaan kavereille.

Pysyvä Cloudflare-osoite onnistuu nimetyllä tunnelilla, mutta se vaatii
Cloudflare-tilin ja oman verkkotunnuksen.

## Vaihtoehto: pilvipalvelin

Jos peli kasvaa kaveripiiriä isommaksi tai pelikone ei voi olla päällä,
palvelimen voi ajaa kontissa. Repositorion juuressa on `Dockerfile`, joka
käynnistää pelipalvelimen portissa 2567 ja tallentaa tietokannan hakemistoon
`/data`. Liitä `/data` pysyvään levyyn, muuten ennätykset katoavat.

**Fly.io** (pieni kone riittää, Tukholman alue on lähin):

```sh
fly launch --no-deploy --name lunki-palvelin --region arn
fly volumes create lunki_data --region arn --size 1
```

Lisää syntyneeseen `fly.toml`-tiedostoon levy ja estä koneen
automaattinen pysäytys, koska se katkaisisi käynnissä olevat kisat:

```toml
[mounts]
  source = "lunki_data"
  destination = "/data"

[http_service]
  internal_port = 2567
  force_https = true
  auto_stop_machines = "off"
  min_machines_running = 1
```

Aja sitten `fly deploy` ja aseta `LUNKI_SERVER_URL`-muuttujaksi
`wss://lunki-palvelin.fly.dev`.

**Oma virtuaalikone** (esim. Hetzner): asenna Docker ja aja

```sh
docker build -t lunki-server .
docker run -d --restart unless-stopped -p 2567:2567 -v lunki_data:/data lunki-server
```

Selain vaatii `wss://`-yhteyden, joten eteen tarvitaan TLS, esimerkiksi
[Caddy](https://caddyserver.com/) omalla verkkotunnuksella
(`reverse_proxy localhost:2567`). Palautteet näkee kontista komennolla
`docker exec <kontti> pnpm report`.

## Palaute ja virheet

Testaajat voivat lähettää palautetta alkuvalikon **Palaute**-napista. Julkaistu
versio lähettää lisäksi selaimessa sattuneet käsittelemättömät virheet
palvelimelle (enintään 5 sivun latausta kohden, sama virhe kerran). Molemmat
tallentuvat samaan tietokantaan kuin ennätykset. Pelikoneella ne näkee
komennolla:

```powershell
pnpm report
```

Tulosteessa näkyy palautteen kirjoittaja, teksti sekä selain ja pelin versio
(commitin alku). Virheistä näkyy, montako kertaa sama virhe on toistunut.

## Vianetsintä

| Oire                            | Syy ja korjaus                                                                                       |
| ------------------------------- | ---------------------------------------------------------------------------------------------------- |
| "Palvelimeen ei saada yhteyttä" | Onko `pnpm server` käynnissä ja tunneli päällä? Kokeile selaimella `https://<osoite>/__healthcheck`. |
| Toimii kotona, ei kavereilla    | `LUNKI_SERVER_URL` puuttuu tai Julkaisua ei ajettu muuttujan lisäämisen jälkeen.                     |
| "Huonetta ei löytynyt…"         | Koodi väärin, huone täynnä tai kisa jo alkanut. Huone katoaa, kun kaikki poistuvat.                  |
| Pelaaja putosi kesken kisan     | Sivun uudelleenlataus palauttaa samaan renkaaseen 60 sekunnin sisällä.                               |
