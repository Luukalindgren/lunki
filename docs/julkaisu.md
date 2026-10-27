# Julkaisu kavereille

Peli koostuu kahdesta osasta:

- **Asiakas** (selainpeli) on GitHub Pagesissa omalla verkkotunnuksella:
  <https://lunkinjarvi.com/>. Se päivittyy itsestään, kun main-haaraan
  yhdistetään PR (työnkulku _Julkaisu_). Vanha osoite
  `luukalindgren.github.io/lunki/` ohjautuu sinne.
- **Pelipalvelin** pyörii Luukan pelikoneella. Yksinpeli toimii ilman sitä;
  moninpeliin palvelimen pitää olla päällä.

GitHub Pages on HTTPS-sivu, joten selain hyväksyy vain suojatun
`wss://`-yhteyden palvelimeen. Siksi palvelin julkaistaan tunnelin kautta:
porttia ei tarvitse avata reitittimestä, ja tunneli hoitaa sertifikaatin.
Nykyinen osoite on `wss://peli.lunkinjarvi.com` (Cloudflare Tunnel).

Cloudflare katkaisee WebSocket-yhteyden 100 sekunnin hiljaisuuden jälkeen.
Palvelin pingaa kaikkia yhteyksiä 3 sekunnin välein (`PING_INTERVAL_MS`,
`packages/server/src/server.ts`), joten aulassa odottelu ei katkaise
yhteyttä. Cloudflaren omat huoltokatkot voivat silti pudottaa yhteyden; peli
yhdistää silloin uudelleen samaan kisaan.

## Kertaluonteiset asetukset

Windows-pelikoneen tarkat komennot, palvelin taustatehtäväksi ja etäkäynnistys
läppäriltä SSH:n yli: [windows-palvelin.md](windows-palvelin.md).

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
4. **Tunneli (suositus: Cloudflare Tunnel omalla verkkotunnuksella):**
   1. Asenna `cloudflared`: `winget install Cloudflare.cloudflared`.
   2. Cloudflaren dashboard → _Zero Trust → Networks → Tunnels → Create
      tunnel_. Kopioi sieltä palvelun asennuskomento (sisältää tokenin) ja aja
      se järjestelmänvalvojan PowerShellissä. Tunneli käynnistyy sen jälkeen
      Windows-palveluna koneen mukana.
   3. Lisää tunneliin _Public hostname_: `peli.lunkinjarvi.com` →
      `http://localhost:2567`. Cloudflare luo DNS-tietueen itse.
   4. Pidä _Bot Fight Mode_ pois päältä (tai rajaa se pois `peli.`-osoitteesta):
      se estää WebSocket-kättelyn ja palautteiden haun GitHub Actionsista.
   5. Kokeile selaimella <https://peli.lunkinjarvi.com/__healthcheck>, vastaus
      on `OK`.
5. **Palvelimen osoite asiakkaalle:** repositorion _Settings → Secrets and
   variables → Actions → Variables → New repository variable_:
   - nimi `LUNKI_SERVER_URL`
   - arvo sama osoite `wss://`-alulla: `wss://peli.lunkinjarvi.com`

   Aja _Julkaisu_ uudelleen, niin peli käyttää tätä palvelinta.

6. **Oma verkkotunnus:** _Settings → Pages → Custom domain_ on
   `lunkinjarvi.com`, ja _Enforce HTTPS_ on päällä. Cloudflaren DNS:ssä
   juuriosoite osoittaa GitHub Pagesiin.

## Hakukoneet

Sivulla on valmiina hakukoneita ja linkkien esikatselua varten otsikko,
kuvaus, kanoninen osoite, Open Graph -tiedot, esikatselukuva
(`packages/client/public/esikatselu.png`, 1200×630), JSON-LD-kuvaus,
`robots.txt` ja `sitemap.xml`. Hakutuloksen sivustonimi tulee
JSON-LD:n `WebSite`-kuvauksesta ja kuvake 48 px:n monikertana olevista
faviconeista (`icons/favicon-96.png`, `icons/icon-192.png`). Kanoninen osoite on aina
`https://lunkinjarvi.com/`, joten kutsulinkit (`?huone=…`) eivät näy
hakutuloksissa omina sivuinaan.

Google Search Consolen käyttöönotto (kerran):

1. <https://search.google.com/search-console> → _Lisää omaisuus →
   Verkkotunnus_: `lunkinjarvi.com`. Vahvista lisäämällä Googlen antama
   TXT-tietue Cloudflaren DNS-asetuksiin.
2. _Sivukartat_ → lähetä `https://lunkinjarvi.com/sitemap.xml`.
3. _URL-tarkistus_ → `https://lunkinjarvi.com/` → _Pyydä indeksointia_.
   Tee tämä aina, kun otsikko, kuvaus tai kuvake muuttuu: muuten Google
   päivittää hakutuloksen vasta seuraavalla omalla käynnillään. Kuvaus
   päivittyy yleensä muutamassa päivässä, kuvake ja sivustonimi voivat
   viedä viikkoja.
4. Vapaaehtoinen: lisää osoite GitHub-repositorion _About → Website_
   -kenttään. Jo yksi linkki nopeuttaa löytymistä.

Haku "lunkinjarvi" löytää pelin yleensä muutamassa päivässä tai viikossa
indeksoinnin jälkeen. Esikatselukuvan voi vaihtaa korvaamalla tiedoston
samankokoisella kuvalla; WhatsApp ja Discord pitävät vanhaa kuvaa
välimuistissa jonkin aikaa.

## Pelipäivänä

1. Pelikoneella repositorion kansiossa:
   ```powershell
   git pull
   pnpm install
   pnpm run server
   ```
   Palvelin kertoo kuuntelevansa porttia 2567. Ikkuna pidetään auki pelin ajan.
   Ennätyslista tallentuu tiedostoon `packages/server/data/lunki.sqlite`
   (muutettavissa ympäristömuuttujalla `LUNKI_DB`), joten se säilyy
   uudelleenkäynnistysten yli. Varmuuskopioksi riittää tiedoston kopio.
2. Avaa <https://lunkinjarvi.com/> → **Moninpeli**. Rivi
   "Palvelin päällä" kertoo, että yhteys toimii.
3. **Luo uusi huone** ja lähetä kavereille kutsulinkki (_Kopioi kutsulinkki_)
   tai koodi (esim. `LUNKI-4F7K`). Kaverit avaavat linkin, kirjoittavat
   nimimerkin ja painavat **Valmis!**. Valitse asetukset ja **Aloita kisa**.

## Vaihtoehto: Tailscale Funnel

Ilman omaa verkkotunnusta pysyvän osoitteen saa Tailscale Funnelilla.
Asenna [Tailscale](https://tailscale.com/download), kirjaudu ja aja
`tailscale funnel --bg 2567`. Jos Funnel ei ole vielä sallittu, komento antaa
linkin, josta sen saa päälle. Osoite on muotoa
`https://pelikone.tailabc123.ts.net` (`LUNKI_SERVER_URL`iin `wss://`-alulla).
Funnel on beta-vaiheessa, sen kaistarajoja ei kerrota, eikä omaa
verkkotunnusta tueta. `tailscale funnel reset` sulkee sen.

## Vaihtoehto: Cloudflaren pikatunneli

Ilman Cloudflare-tiliä [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)
antaa tilapäisen osoitteen:

```powershell
cloudflared tunnel --url http://localhost:2567
```

Osoite (esim. `https://satunnainen-nimi.trycloudflare.com`) vaihtuu joka
käynnistyksellä, joten sitä ei kannata laittaa `LUNKI_SERVER_URL`-muuttujaan.
Anna se sen sijaan pelin osoitteessa:
`https://lunkinjarvi.com/?palvelin=wss://satunnainen-nimi.trycloudflare.com`.
Kutsulinkki kuljettaa `palvelin`-parametrin mukanaan kavereille.

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

| Oire                            | Syy ja korjaus                                                                                           |
| ------------------------------- | -------------------------------------------------------------------------------------------------------- |
| "Palvelimeen ei saada yhteyttä" | Onko `pnpm run server` käynnissä ja tunneli päällä? Kokeile selaimella `https://<osoite>/__healthcheck`. |
| Toimii kotona, ei kavereilla    | `LUNKI_SERVER_URL` puuttuu tai Julkaisua ei ajettu muuttujan lisäämisen jälkeen.                         |
| "Huonetta ei löytynyt…"         | Koodi väärin tai huone täynnä. Huone katoaa, kun kaikki poistuvat.                                       |
| Pelaaja putosi kesken kisan     | Päävalikon "Palaa kisaan" tai sama huonekoodi palauttaa samaan renkaaseen ja saaliisiin.                 |
| Yhteysvirhe, healthcheck 403    | Cloudflaren Bot Fight Mode estää: ota se pois päältä tai rajaa `peli.lunkinjarvi.com` pois.              |
| Healthcheck 502                 | Tunneli on päällä, mutta palvelin ei: `lunki kaynnista`.                                                 |
| Healthcheck 530 (virhe 1033)    | Tunneli ei ole päällä: `lunki` näyttää `cloudflared`-palvelun tilan (`Start-Service cloudflared`).       |
