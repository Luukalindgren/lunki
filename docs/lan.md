# LAN-peli: läppäri palvelimeksi

Moninpeli ilman nettiä ja pelikonetta: läppäri ajaa pelipalvelimen ja jakaa
samalla itse pelisivun lähiverkkoon. Kaverit avaavat selaimessa läppärin
osoitteen, esim. `http://192.168.1.23:2567`, ja peli toimii kuten
tavallinen moninpeli (huoneet, koodit ja kutsulinkit).

Tavallinen moninpeli (GitHub Pages + pelikoneen palvelin) toimii ennallaan.
LAN-peli on oma tapansa sen rinnalla.

## Käynnistys

Tarvitset läppärille [Node.js 22](https://nodejs.org/) (vähintään 22.13) ja
pnpm:n (`corepack enable`). Hae koodi ja riippuvuudet etukäteen, kun netti
vielä toimii:

```sh
git pull
pnpm install
```

Pelipaikalla:

```sh
pnpm lan          # tai Macilla: lunki lan
```

Komento rakentaa pelisivun ja käynnistää palvelimen portissa 2567. Se
tulostaa osoitteen ja QR-koodin, jonka kaverit voivat lukea puhelimella.
Ctrl+C lopettaa. Toisen portin saa `PORT=2568 pnpm lan`.

Kaikki koneet samaan wifiin. Läppäri itse pelaa osoitteessa
`http://localhost:2567`.

## Ensimmäisellä kerralla Macilla

macOS kysyy, saako `node` ottaa vastaan saapuvia yhteyksiä. Valitse
**Salli**. Jos painoit vahingossa Estä: Järjestelmäasetukset → Verkko →
Palomuuri → Valinnat → `node` → Salli saapuvat yhteydet.

## Miksi ei GitHub Pagesin kautta?

Pages-sivu on suojattu (https), eikä selain anna sen ottaa yhteyttä
lähiverkon suojaamattomaan palvelimeen (`ws://192.168…`). Siksi LAN-pelissä
pelisivu tulee läppäriltä samasta osoitteesta kuin palvelin. Sivu rakennetaan
tilassa `lan` (`packages/client/dist-lan`), jolloin peli ottaa yhteyden
samaan osoitteeseen, josta sivu ladattiin.

## Vianetsintä

| Oire                                            | Syy ja korjaus                                                                                                                    |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Kaverin selain ei saa sivua auki                | Onko kaveri samassa wifissä? Salliko palomuuri `node`n (yllä)? Kokeile listan muita osoitteita.                                   |
| Sivu aukeaa omalla koneella mutta ei kavereilla | Vierasverkko tai mökin reititin voi estää laitteita näkemästä toisiaan. Kokeile puhelimen yhteyspistettä, johon kaikki liittyvät. |
| "Portti 2567 on jo käytössä"                    | Palvelin on jo käynnissä toisessa ikkunassa, tai `pnpm dev:server` on päällä. Sulje se tai käytä toista porttia.                  |
| `node:sqlite`-virhe käynnistyksessä             | Node on liian vanha: päivitä vähintään versioon 22.13.                                                                            |

Ennätykset, palaute ja virheilmoitukset tallentuvat läppärin omaan
tietokantaan (`packages/server/data/lunki.sqlite`), eivät pelikoneelle.
