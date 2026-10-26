# Puheäänet

Käsimerkkeihin (#228) kuuluu kalastajan ääni (#229): vilkutus tervehtii, keskisormi ja
nyrkki kiroilevat suomeksi. Halutessaan oma kalastaja sadattelee myös tapahtumissa.

## Repliikit

Käsikirjoitus on tiedostossa `scripts/puhe/repliikit.json`: tunniste ja sen repliikit.
Jokaisesta repliikistä on tiedosto `packages/client/public/audio/puhe/<tunniste>-<n>.mp3`,
jossa `n` alkaa ykkösestä. Määrät on kirjattu myös koodiin (`VOICE_LINES` tiedostossa
`packages/client/src/audio/voice.ts`); testi tarkistaa, että ne täsmäävät ja tiedostot
ovat olemassa.

| Tunniste       | Milloin                                    |
| -------------- | ------------------------------------------ |
| `wave`         | Vilkutus                                   |
| `thumbsUp`     | Peukku                                     |
| `middleFinger` | Keskisormi                                 |
| `fist`         | Nyrkin heristys                            |
| `comeHere`     | Tänne-viittoilu                            |
| `bigFish`      | Näin iso                                   |
| `lineBroken`   | Siima katkesi                              |
| `escaped`      | Kala irtosi                                |
| `capsized`     | Rengas kaatui                              |
| `snagged`      | Viehe tarttui pohjaan                      |
| `lureLost`     | Viehe jäi pohjaan                          |
| `stuck`        | Viehe lensi maalle                         |
| `bitOff`       | Hauki puri siiman poikki                   |
| `missed`       | Tärppi meni ohi                            |
| `bigCatch`     | Iso tai jättikala saatiin (kokoluokka ≥ 3) |
| `fouled`       | Vieheeseen tarttui rikkaa                  |
| `tangled`      | Siima sotkeutui toisen pelaajan siimaan    |
| `lightning`    | Salama iski alle 150 metrin päähän         |

Repliikki arvotaan, eikä sama tule kahdesti peräkkäin. Saman puhujan uusi repliikki
katkaisee edellisen.

## Kuuluminen

- Oma ääni kuuluu aina täysillä keskeltä.
- Muiden pelaajien käsimerkit kuuluvat sijainnin mukaan: täysillä 10 metriin asti,
  50 metrissä enää kolmasosa ja 80 metrin päähän ei lainkaan. Suunta tulee kameran
  mukaan vasemmalta tai oikealta.
- Tapahtumien kiroilu on vain omalle kalastajalle, ja se on oletuksena pois päältä
  (Äänet → Kiroilu tapahtumissa).
- Äänet → Puheäänet säätää tason tai mykistää puheen kokonaan.
- Tiedostot ladataan vasta, kun käsimerkkivalikko avataan tai ääni soitetaan
  ensimmäisen kerran, joten ne eivät hidasta pelin käynnistystä.

## Äänten teko ja vaihtaminen

Nykyiset äänet on tehty työnkululla `.github/workflows/puhe.yml`: Piper-puhesynteesi
suomenkielisellä äänellä `fi_FI-harri-medium` ja jälkikäsittely ffmpegillä (sävel
alas, särö, nopea tremolo ja kompressointi), jotta ääni kuulostaa vanhahkolta,
käheältä ja äreältä. Skripti on `scripts/puhe/tee.py`.

Omat äänitykset korvaavat tekoälyäänet suoraan: tallenna mp3-tiedosto samalla
nimellä hakemistoon `packages/client/public/audio/puhe/`. Repliikkien määrää voi
muuttaa päivittämällä sekä `repliikit.json`:n että `VOICE_LINES`-taulukon.
