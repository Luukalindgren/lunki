# Suorituskyky

Tavoite: tasainen 60 fps, minimi 30 fps millä tahansa koneella (issue #11).

## Miten mitataan

Avaa peli osoitteella `…/?bench=1`. Peli ajaa 30 sekunnin käsikirjoitetun
kierroksen (potkiminen, kääntyminen, heitot, kelaus, kalojen tekoäly) ja näyttää
lopuksi tuloksen. Sama JSON tulostuu konsoliin rivillä `LUNKI_BENCH`.

| Kenttä             | Merkitys                                           |
| ------------------ | -------------------------------------------------- |
| `avgFps`           | Keskimääräinen ruudunpäivitys                      |
| `p95ms`, `p99ms`   | 95. ja 99. persentiilin ruutuaika (ms)             |
| `below30fps`       | Ruudut, jotka kestivät yli 33 ms                   |
| `updateMsPerStep`  | Pelilogiikan (fysiikka, kalat) CPU-aika askeleelle |
| `renderMsPerFrame` | Piirron CPU-aika ruudulle                          |
| `drawCalls`        | WebGL-piirtokutsut ruudulla                        |
| `gpu`              | Selaimen ilmoittama näytönohjain                   |

## Mittaukset

### Pilviympäristö, ohjelmistorenderöinti (2026-10-25)

Headless Chromium + SwiftShader (ei näytönohjainta, kaikki piirto CPU:lla).
Tämä on selvästi heikompi kuin mikään oikea integroitu näytönohjain, joten se
on hyvä pahimman tapauksen mittari.

| Ikkuna    | CPU-hidastus       | avg fps | p95 ms | update ms | render ms |
| --------- | ------------------ | ------- | ------ | --------- | --------- |
| 1280×720  | 1×                 | 59      | 16,8   | 0,38      | 0,63      |
| 1920×1080 | 1×                 | 40      | 50     | 0,39      | 0,70      |
| 1366×768  | 4× (vanha läppäri) | 45      | 50     | 1,96      | 2,14      |
| 2560×1440 | 1×                 | 30      | 67     | 0,37      | 1,00      |

Pelilogiikka ja piirtokutsut vievät alle 1 ms (4× hidastettunakin n. 4 ms) eli
alle 7 % 60 fps:n ruutuajasta. Isommilla ikkunoilla hidastus tulee
SwiftShaderin ohjelmallisesta kuvan skaalauksesta, jonka oikea näytönohjain
tekee käytännössä ilmaiseksi.

### Oikeat koneet

Mittaamatta: tarvitaan mittaus integroidulla näytönohjaimella ja vanhalla
läppärillä (`?bench=1`, tulos issueen #11).

## Raskaimmat kohdat ja korjaukset

1. **Täyden resoluution skaalausvaihe (korjattu).** Alun perin pieni kuva
   skaalattiin ruudulle omalla shader-vaiheella, joka piirsi jokaisen näytön
   pikselin. Nyt canvasin piirtopuskuri on sisäisen resoluution kokoinen
   (n. 480×270) ja selain skaalaa sen CSS:llä (`image-rendering: pixelated`).
   GPU:n työ ei enää riipu näytön koosta. SwiftShaderilla 1280×720:
   46 → 59 fps, p95 50 → 16,8 ms.
2. **Kalojen tekoäly.** 1800 kalaa maksaisi joka askel, joten yli 60 m päässä
   vieheestä olevat kalat päivitetään vain joka 20. askel. Koko populaatio
   parvineen ≈ 0,3 ms/askel.
3. **Paletti-shader** tekee 32 värin haun, mutta vain sisäisessä
   resoluutiossa (n. 130 000 pikseliä), joten se on kevyt.
4. **HUD** on DOM-elementtejä; tekstit päivitetään vain kun ne muuttuvat, ettei
   selain laske asettelua turhaan joka ruutu.
5. **Maailman rakentaminen (korjattu, #327 / PR #333).** Järvi, ranta ja maasto
   rakennetaan kerran (`world/staticWorld.ts`), ja sama maailma siirretään
   valikosta kisaan. Maankäytön haku käyttää valmista ruudukkoa
   (`RingIndex`), ja shaderit käännetään etukäteen (`Game.precompile`).
   Valikko on valmis 2,0 → 1,5 s, kisan alun nykäys 1,65 → 0,7 s.
   `?bench=1` kertoo nämä kentissä `raceBuildMs` ja `raceCompileMs`.
6. **Toinen avaus (#328 / PR #334).** Service worker pitää pelin tiedostot
   laitteella, joten peli aukeaa toisella kerralla heti ja yksinpeli toimii
   ilman nettiä, ks. [julkaisu.md](julkaisu.md).
