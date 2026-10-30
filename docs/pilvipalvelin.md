# Pelipalvelin pilvessä (Hetzner)

Tämä on valmius siirtää pelipalvelin Hetznerin pilvikoneelle (#412), jotta
moninpeli toimii myös pelikoneen ollessa kiinni. Siirron viimeiset vaiheet
(tili, kone ja tunnelin vaihto) tekee Luuka. Pelikone toimii edelleen
palvelimena ([windows-palvelin.md](windows-palvelin.md)), eikä mikään sen
ohjeista muutu.

## Mitä maksaa

Hetzner laskuttaa tunneittain, ja kuukausihinta on katto. **Sammutettu kone
maksaa saman kuin päällä oleva**: maksu loppuu vasta, kun kone poistetaan.
Siksi koneen voi pitää kuvana silloin, kun moninpeliä ei pelata:

| Käyttö                                       | Noin (ilman ALV:tä)      |
| -------------------------------------------- | ------------------------ |
| Kone aina päällä (CAX11, 2 ARM-ydintä, 4 Gt) | 6–6,5 €/kk (IPv4 mukana) |
| Kone pois (`lunki pilvi pois`), vain kuva    | noin 0,05 €/kk (4–5 Gt)  |
| Kaksi neljän tunnin peli-iltaa kuukaudessa   | noin 0,15 €/kk           |
| Kone päällä viikon, muuten pois              | noin 1,5 €/kk            |

Tuntihinta on noin 0,01 € (kuukausikatto jaettuna noin 720 tunnilla), ja
kuva (snapshot) maksaa noin 0,011–0,012 € gigatavulta kuukaudessa. ALV
(25,5 %) tulee päälle. Hinnat tarkistetaan ennen tilausta Hetznerin
sivuilta: <https://www.hetzner.com/cloud> ja
<https://docs.hetzner.com/cloud/billing/faq/>. Jos ARM-konetta (CAX) ei ole
saatavilla, x86-kone CX23 toimii samoin (`LUNKI_PILVI_TYYPPI=cx23`).

`lunki pilvi paalle` luo koneen kuvasta parissa minuutissa. Koneen osoite
vaihtuu, mutta sillä ei ole väliä: tunneli otetaan koneelta ulospäin, ja
skriptit hakevat uuden osoitteen Hetzneriltä.

## Rakenne

```
pelaaja ─wss─▶ Cloudflare ─▶ tunneli "lunki-pilvi" ─▶ cloudflared (pilvikone)
                                                        │
                                       127.0.0.1:2567 ◀─┘
                              Docker-kontti: node dist/index.mjs
                              /srv/lunki/data/lunki.sqlite + palauteavain.txt
```

- **Kontti** (`Dockerfile`, `scripts/pilvi/compose.yaml`): palvelin kootaan
  yhdeksi tiedostoksi (`packages/server/bundle.mjs`) ja ajetaan suoraan
  nodella. Muistia kuluu noin 40–110 Mt, kun `pnpm start` (pnpm + tsx) vie
  noin 330 Mt. Kontti on koneen verkossa ja kuuntelee vain osoitetta
  `127.0.0.1`, joten portti 2567 ei näy internetiin, ja IP-rajoitus
  (`ipLimit.ts`) luottaa tunnelin `X-Forwarded-For`-otsakkeeseen kuten
  pelikoneella. Kontti ajetaan `node`-käyttäjänä, muisti on rajattu 512
  Mt:hen, ja Docker käynnistää sen uudelleen, jos se kaatuu tai kone
  käynnistyy.
- **Päivitys itsestään** (`scripts/pilvi/paivita.sh`, ajastus
  `lunki-paivitys.timer` 5 minuutin välein ja minuutti käynnistyksen
  jälkeen): kone hakee mainin. Jos palvelinkoodi (`packages/server`,
  `packages/shared`, riippuvuudet tai kontti) muuttui eikä kenelläkään ole
  yhteyttä auki, kontti kootaan ja käynnistetään uudelleen. Kesken kisan
  päivitys odottaa, kunnes huone on tyhjä. `lunki uudelleen` -komentoa ei
  pilvessä tarvita, eikä GitHubiin tarvita SSH-avainta koneelle.
- **Varmuuskopio** (`scripts/pilvi/varmuuskopio.sh`, joka yö klo 4):
  `sqlite3 .backup` kansioon `/srv/lunki/varmuuskopiot`, 14 viimeisintä.
  `lunki pilvi pois` -kuva on samalla koko koneen varmuuskopio.
- **Tietoturvapäivitykset** asentuvat itsestään (`unattended-upgrades`).

## Käyttöönotto (Luuka, kerran)

1. **Tili ja avaimet.** Luo tili ja projekti `lunki` osoitteessa
   <https://console.hetzner.com/>. Macilla:

   ```sh
   ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519_lunki_pilvi -C "macbook-lunki-pilvi"
   brew install hcloud
   hcloud context create lunki   # API-avain: Console → Security → API tokens (Read & Write)
   hcloud ssh-key create --name lunki --public-key-from-file ~/.ssh/id_ed25519_lunki_pilvi.pub
   ```

2. **Palomuuri ja kone** (Helsinki, Ubuntu 24.04). Palomuuri päästää sisään
   vain SSH:n; tunneli ei tarvitse avoimia portteja.

   ```sh
   hcloud firewall create --name lunki
   hcloud firewall add-rule lunki --direction in --protocol tcp --port 22 \
     --source-ips 0.0.0.0/0 --source-ips ::/0
   hcloud server create --name lunki --type cax11 --location hel1 \
     --image ubuntu-24.04 --ssh-key lunki --firewall lunki --label app=lunki
   ```

   Saman voi tehdä Hetznerin sivulla (_Add Server_): nimi `lunki`, tunniste
   `app=lunki`, SSH-avain `lunki` ja palomuuri `lunki`.

3. **Uusi tunneli.** Cloudflare → _Zero Trust → Networks → Tunnels → Create
   tunnel_, nimi `lunki-pilvi`. Asennussivun komennossa on pitkä token
   (`eyJ…`), kopioi se. Lisää tunneliin _Public hostname_ ensin
   testiosoitteella: `pilvi.lunkinjarvi.com` → `http://localhost:2567`.
   Nykyiseen tunneliin ei lisätä toista liitintä, koska huoneet jakautuisivat
   kahdelle palvelimelle.

4. **SSH-oikotie** `~/.ssh/config`-tiedoston loppuun (IP-osoite:
   `hcloud server ip lunki`). `HostKeyAlias` pitää koneen avaimen samana,
   vaikka osoite vaihtuu kuvasta luodessa:

   ```
   Host lunki-pilvi
     HostName 203.0.113.10
     User root
     IdentityFile ~/.ssh/id_ed25519_lunki_pilvi
     IdentitiesOnly yes
     HostKeyAlias lunki-pilvi
   ```

5. **Asennus koneelle** (Docker, cloudflared, palvelin, ajastukset):

   ```sh
   ssh lunki-pilvi
   curl -fsSL https://raw.githubusercontent.com/Luukalindgren/lunki/main/scripts/pilvi/asenna.sh -o asenna.sh
   bash asenna.sh 'eyJ…tunnelin token…'
   ```

6. **Kokeilu.** <https://pilvi.lunkinjarvi.com/__healthcheck> vastaa `OK`.
   Moninpeli pilvipalvelimella:
   <https://lunkinjarvi.com/?palvelin=wss://pilvi.lunkinjarvi.com>.

7. **Ennätykset ja palautteet pelikoneelta** (kerran, Macilta). Palauteavain
   tulee mukana, joten GitHubin `LUNKI_FEEDBACK_TOKEN` toimii sellaisenaan:

   ```sh
   lunki pysayta
   scp 'lunki:Projektit/lunki/packages/server/data/lunki.sqlite' \
       'lunki:Projektit/lunki/packages/server/data/palauteavain.txt' /tmp/
   ssh lunki-pilvi 'docker compose -f /srv/lunki/repo/scripts/pilvi/compose.yaml stop'
   scp /tmp/lunki.sqlite /tmp/palauteavain.txt lunki-pilvi:/srv/lunki/data/
   ssh lunki-pilvi 'chown 1000:1000 /srv/lunki/data/* && docker compose -f /srv/lunki/repo/scripts/pilvi/compose.yaml start'
   ```

8. **Vaihto.** Cloudflaressa poista `peli.lunkinjarvi.com` vanhan tunnelin
   _Public hostname_ -listasta ja lisää se tunneliin `lunki-pilvi`
   (`http://localhost:2567`). `LUNKI_SERVER_URL` ei muutu, joten julkaisua ei
   tarvita. Testiosoitteen `pilvi.` voi poistaa.

9. Jos konetta ei pidetä aina päällä: `lunki pilvi pois` (ensimmäinen kuva
   syntyy tästä) ja peli-iltana `lunki pilvi paalle`.

## Komennot Macilta

`lunki pilvi …` (`scripts/pilvi/pilvi.sh`, alias kuten
[windows-palvelin.md](windows-palvelin.md):n kohdassa 6):

| Komento                 | Mitä tekee                                                           |
| ----------------------- | -------------------------------------------------------------------- |
| `lunki pilvi`           | Kontin, tunnelin ja ajastusten tila                                  |
| `lunki pilvi uudelleen` | Hakee uuden koodin ja käynnistää palvelimen heti (pelaajat putoavat) |
| `lunki pilvi loki`      | Lokin loppu; `lunki pilvi loki seuraa` jatkaa (Ctrl+C lopettaa)      |
| `lunki pilvi ssh`       | SSH-istunto koneelle                                                 |
| `lunki pilvi paalle`    | Luo koneen viimeisimmästä kuvasta ja odottaa, että palvelin vastaa   |
| `lunki pilvi pois`      | Pysäyttää palvelimen, ottaa kuvan ja poistaa koneen                  |

Palautteet ja virheet: `ssh lunki-pilvi 'docker compose -f
/srv/lunki/repo/scripts/pilvi/compose.yaml exec palvelin node dist/report.mjs'`.

## Pelikone varapalvelimena

Vanha tunneli ja pelikoneen Windows-tehtävä jäävät ennalleen. Takaisin
pelikoneelle siirrytään samalla tavalla toiseen suuntaan: tietokanta
pilvestä pelikoneelle (kohta 7 toisin päin) ja `peli.lunkinjarvi.com`
takaisin vanhaan tunneliin. Pidä vain toinen kerrallaan osoitteen takana,
muuten ennätykset tallentuvat kahteen eri tietokantaan.

Kun pilvikone on pois (`lunki pilvi pois`), moninpeli on kiinni samoin kuin
pelikoneen ollessa kiinni. Yksinpeli toimii, ja saaliit ja palautteet
odottavat selaimessa jonossa ([julkaisu.md](julkaisu.md), _Kun
pelipalvelin on kiinni_).

## Tietoturva

- Kone hakee ja ajaa mainin itse. Mainiin tulee koodia vain yhdistetyistä
  PR:istä; GitHubin suojaukset (#150) kannattaa laittaa päälle ennen
  vaihtoa.
- Ainoa avoin portti on SSH, ja siihen pääsee vain avaimella (Hetznerin
  Ubuntu-kuva ei salli salasanakirjautumista, kun SSH-avain on annettu).
