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

Muut komennot:

| Komento           | Mitä tekee                                     |
| ----------------- | ---------------------------------------------- |
| `pnpm dev`        | Asiakkaan kehityspalvelin (Vite)               |
| `pnpm dev:server` | Pelipalvelin kehitystilassa                    |
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
