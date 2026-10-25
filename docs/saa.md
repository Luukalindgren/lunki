# Sää

Sää lasketaan koko kisan ajaksi etukäteen kisan siemenestä
(`planWeather` kansiossa `packages/shared/src/weather`). Palvelin ja kaikki
pelaajat laskevat saman suunnitelman, joten säätä ei lähetetä verkossa.
Palvelin pitää tilassa vain nykyisen säätilan (`sky`) kellonsa mukaan.

## Säätilat

| Tila     | Tuuli (m/s) | Sade  | Taivas       |
| -------- | ----------- | ----- | ------------ |
| Tyyni    | 0–2         | –     | kirkas       |
| Tuulinen | 4–8         | –     | vähän pilveä |
| Sade     | 3–7         | 60 %  | pilvinen     |
| Ukkonen  | 5–10        | 80 %  | tumma        |
| Myrsky   | 10–16       | 100 % | hyvin tumma  |

Tila vaihtuu satunnaisesti, ja kesto on keskimäärin säätason mukainen.
Lyhin mahdollinen kesto on 40 s. Tuulen suunta kääntyy tilan vaihtuessa
keskimäärin noin 25°. Tuuli puuskittelee ±15 %.

## Säätasot

| Taso               | Kuvaus                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------- |
| Aina tyyni         | Ei sääilmiöitä.                                                                                               |
| Realistinen        | Suomen kesäpäivä: enimmäkseen tyyntä tai tuulista, joskus sadekuuro, ukkonen harvoin. Tilat kestävät 5–8 min. |
| Vähän sääilmiöitä  | Sadetta usein ja ukkosta silloin tällöin.                                                                     |
| Paljon sääilmiöitä | Ukkosta ja myrskyä noin puolet ajasta, ja tilat vaihtuvat 2–3 min välein.                                     |
| Täysi kaaos        | Ukkosta ja myrskyä suurin osa ajasta, ja sää vaihtuu noin minuutin välein.                                    |

Testi `weather.test.ts` tarkistaa 200 siemenellä, että ukkosen ja myrskyn
osuus kasvaa selvästi tasolta toiselle.

## Ennakkovaroitukset

Siirtymä alkaa 45 s ennen muutosta:

- tuuli, sade ja taivaan tummuus liukuvat kohti uutta tilaa
- HUD varoittaa tekstillä:
  - **Taivas tummuu…**, kun on tulossa selvästi synkempää
  - **Kaukaa kuuluu ukkosen jyrinää**, kun on tulossa ukkonen tai myrsky; samalla kuuluu jyrinä
  - **Tuuli yltyy**, kun tuuli voimistuu yli 3 m/s.

Ukkosella ja myrskyllä jyrisee lisäksi 8–22 s välein. Salamat tulevat
omana ominaisuutenaan (#28).

## Näkyminen pelissä

- Ajastimen alla näkyy säätila ja tuuli, esim. "Sade · lounaistuuli 6 m/s".
  Tuuli nimetään suunnasta, josta se tulee.
- Sade näkyy viiruina, jotka tuuli kallistaa. POV:ssa sadetta on
  kalastajan ympärillä, ylhäältä katsottuna koko näkyvällä alueella.
- POV:ssa taivas ja sumu harmaantuvat palettisävyinä portaittain, ja valo
  himmenee hieman. Valoa ei himmennetä enempää, koska paletissa tummat
  vesisävyt kääntyisivät vihreiksi.

Säätaso valitaan alkuvalikosta tai moninpelin aulasta. Kehitystä varten
osoitteeseen voi lisätä `?difficulty=easy&weather=chaos`. `?bench=1` käyttää
aina tyyntä säätä, jotta mittaukset ovat vertailukelpoisia.
