# lunki

Moninpeli, jossa kalastetaan kelluntarenkaalta Tammelan Lunkinjärvellä.
Selainpeli, retrografiikka, ajastettu kilpailu ja yllättävät säät.

Kehitys etenee GitHub Issueiden kautta: jokainen muutos omassa haarassaan ja
PR:ssä, ja main päivittyy vain yhdistettyjen PR:ien kautta.

## Ajaminen paikallisesti

Tarvitset [Node.js 22](https://nodejs.org/) tai uudemman ja pnpm:n
(`corepack enable` asentaa oikean version automaattisesti).

```sh
pnpm install
pnpm dev          # avaa pelin selaimessa (http://localhost:5173)
```

Moninpeli paikallisesti: käynnistä lisäksi pelipalvelin toisessa
terminaalissa (`pnpm dev:server`, portti 2567). Peli ottaa yhteyden samaan
koneeseen porttiin 2567; toisen palvelimen voi antaa osoitteella
`?palvelin=wss://…` tai koontiaikana muuttujalla `VITE_LUNKI_SERVER`.
Valikosta "Moninpeli" luodaan huone, ja kaverit liittyvät koodilla
(esim. `LUNKI-4F7K`) tai kutsulinkillä.

Peli kavereille: asiakas on GitHub Pagesissa ja palvelin pyörii omalla
koneella tunnelin kautta. Ohje: [docs/julkaisu.md](docs/julkaisu.md).
Verkkokoodin rakenne: [docs/moninpeli.md](docs/moninpeli.md).
Kalalajit, vieheet ja varusteet: [docs/kalalajit.md](docs/kalalajit.md).
Järven pohja ja erikoismuodot: [docs/pohja.md](docs/pohja.md).
Sää ja säätasot: [docs/saa.md](docs/saa.md).

Muut komennot:

| Komento           | Mitä tekee                                     |
| ----------------- | ---------------------------------------------- |
| `pnpm dev`        | Asiakkaan kehityspalvelin (Vite)               |
| `pnpm dev:server` | Pelipalvelin kehitystilassa                    |
| `pnpm server`     | Pelipalvelin pelikäyttöön (portti 2567)        |
| `pnpm test`       | Kaikkien pakettien testit (Vitest)             |
| `pnpm lint`       | ESLint                                         |
| `pnpm typecheck`  | TypeScript-tarkistus kaikille paketeille       |
| `pnpm format`     | Muotoilee koodin Prettierillä                  |
| `pnpm check`      | Lint, muotoilu, tyypitys ja testit kerralla    |
| `pnpm build`      | Tuotantobuild (asiakas `packages/client/dist`) |

## Rakenne

```
packages/
  client/        Selainpeli (Vite + Three.js)
  server/        Pelipalvelin (Colyseus, vaihe 2)
  shared/        Jaettu koodi: fysiikka, pelisäännöt, tyypit
  map-pipeline/  Lunkinjärven kartta avoimesta aineistosta pelin muotoon
```

Pelin fysiikka ja säännöt ovat `shared`-paketissa, jotta asiakas ja palvelin
laskevat ne samalla koodilla.

## Kartta-aineisto

- Rantaviiva ja ympäristö (metsät, pellot, tiet, rakennukset):
  © [OpenStreetMapin tekijät](https://www.openstreetmap.org/copyright), ODbL 1.0.
- Maaston korkeus: Copernicus DEM GLO-30, © DLR e.V. 2010–2014 ja © Airbus Defence and
  Space GmbH 2014–2018, Copernicus-ohjelma (EU, ESA).
- Järven perustiedot (pinta-ala, korkeustaso): Suomen ympäristökeskus (Syke), järvirekisteri
  [Järvi-meriwikin](https://www.jarviwiki.fi/) kautta, CC BY 4.0. Pohja on laskettu, ks.
  [docs/pohja.md](docs/pohja.md).

Pelin _Tekijät ja lähteet_ -näkymä listaa samat maininnat sekä kirjastot (three.js, Colyseus
ja Zod, kaikki MIT) ja VT323-fontin (SIL Open Font License 1.1). Aineistot haetaan
`Karttadata`-työnkulussa (GitHub Actions → Run workflow) tai paikallisesti:

```sh
pnpm --filter @lunki/map-pipeline fetch-osm   # OSM → packages/map-pipeline/data
pnpm --filter @lunki/map-pipeline build-map   # → packages/shared/src/map/lunkinjarvi.json
```
