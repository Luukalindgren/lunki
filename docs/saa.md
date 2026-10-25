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

Ukkosella ja myrskyllä jyrisee lisäksi 8–22 s välein.

## Salamat

Ukkosella salama iskee keskimäärin 11 s välein, myrskyllä 6 s välein
(`planLightning` kansiossa `packages/shared/src/weather/lightning.ts`).
Iskuhetket lasketaan kisan siemenestä, kuten säätila.

- **Kenen kohdalle salama osuu?** Vain kalastajaan, jonka vapa on ylhäällä
  eli viehe on heitossa tai vedessä tai kala on kiinni. Vapa alhaalla (viehe
  kelalla) on aina turvassa.
- **Osumariski:** yksi salama osuu vapa ylhäällä olevaan noin 8 %
  todennäköisyydellä selällä. Rannan tuntumassa (alle 25 m) riski on
  neljännes tästä, ja se kasvaa tasaisesti 200 metriin asti. Myrskyssä
  jatkuvasti kalastava saa siis osuman noin minuutissa.
- **Moninpeli:** palvelin ratkaisee osumat ja lähettää iskut kaikille
  (`ServerMsg.lightning`).
- **Muut iskut:** jos salama ei osu kehenkään, se iskee satunnaiseen
  kohtaan järvellä, mieluiten selälle.

Osuma polttaa siiman aina poikki: viehe palaa kelalle ja kiinni ollut kala
karkaa. Lisäksi seuraa valittu rangaistus:

| Rangaistus      | Mitä tapahtuu                                                 |
| --------------- | ------------------------------------------------------------- |
| Ei rangaistusta | Vain siima palaa poikki.                                      |
| Jäähy (60 s)    | Heittää ei voi minuuttiin. Palvelin hylkää heitot ja saaliit. |
| Menetä saalis   | Kaikki tähän asti punnitut kalat menetetään.                  |
| Putoat kisasta  | Saalis menetetään, eikä loppukisan aikana voi enää kalastaa.  |

Rangaistus valitaan yksinpelin asetuksista tai moninpelin aulasta.
Oletuksena on jäähy.

Salama näkyy siksak-viivana taivaalta veteen, ja koko ruutu välähtää.
Isku kuuluu viiveellä etäisyyden mukaan (343 m/s): lähellä terävänä
räsähdyksenä ja jyrinänä, kaukana hiljaisempana jyrinänä. Ukkosella ja
myrskyllä HUD:n säärivillä lukee "salamavaara!", ja jäähyn jäljellä oleva
aika näkyy vasemmassa alakulmassa.

## Näkyminen pelissä

- Ajastimen alla näkyy säätila ja tuuli, esim. "Sade · lounaistuuli 6 m/s".
  Tuuli nimetään suunnasta, josta se tulee.
- Sade näkyy viiruina, jotka tuuli kallistaa. POV:ssa sadetta on
  kalastajan ympärillä, ylhäältä katsottuna koko näkyvällä alueella.
- POV:ssa taivas ja sumu harmaantuvat palettisävyinä portaittain, ja valo
  himmenee hieman. Valoa ei himmennetä enempää, koska paletissa tummat
  vesisävyt kääntyisivät vihreiksi.

## Tuuli

Tuuli vaikuttaa peliin kolmella tavalla:

- **Rengas ajelehtii** myötätuuleen. Työntövoima kasvaa tuulen nopeuden
  neliönä (`TUBE_PHYSICS.windPush`): 5 m/s tuulessa ajelehdit noin 0,1 m/s,
  16 m/s myrskyssä noin 0,6 m/s. Potkimalla pääsee yhä vastatuuleen.
  Palvelin laskee ajelehtimisen samalla tavalla, ja ennustus toistaa
  kunkin syötteen tuulen, joten oma rengas ei nyi.
- **Heitto kaartuu**: vieheen ilmanvastus lasketaan suhteessa ilmaan, joten
  myötätuuli pidentää ja vastatuuli lyhentää heittoa, ja sivutuuli siirtää
  sitä sivulle. Heiton ennuste ottaa tuulen huomioon.
- **Aallot**: merkitsevä aallonkorkeus lasketaan JONSWAP-kaavalla
  Hs = 0,0016 · U · √(F / g), jossa F on pyyhkäisymatka eli matka
  vastatuuleen rantaan tai saareen. Selällä aallot ovat siis isompia kuin
  suojaisessa poukamassa. Järvi jaetaan 20 m ruutuihin, ja pyyhkäisymatkat
  lasketaan uudelleen vain tuulen kääntyessä.

Aallot näkyvät vedessä myötätuuleen kulkevina harjoina, jotka levenevät
aallonkorkeuden kasvaessa. Isoissa aalloissa harjat vaahtoavat. POV-kamera
keinuu aaltojen mukana, ja HUD näyttää aallonkorkeuden, kun se on yli
5 cm. Isot aallot voivat kaataa renkaan, ks. alla.

## Isot aallot ja kaatuminen

Tuulella (vähintään 6 m/s) tulee välillä iso aalto: myrskyllä keskimäärin
20 s välein, ukkosella 35 s, tuulisella 50 s ja sateella 60 s välein
(`planBigWaves` kansiossa `packages/shared/src/weather/bigWaves.ts`).
Iskuhetket lasketaan kisan siemenestä.

- **Korkeus:** iso aalto on 2,2 kertaa merkitsevä aallonkorkeus renkaan
  kohdalla. Selällä myrskyssä se on noin 0,5 m, suojaisessa poukamassa
  vain muutama sentti.
- **Kaatuminen:** yli 0,35 m aalto kaataa renkaan, jos aalto tulee sivulta
  tai takaa. Aaltoa kohti katsova (poikkeama alle noin 55°) pysyy pystyssä.
  Aallot tulevat sieltä, mistä tuulee.
- **Varoitus:** 4 s ennen aaltoa HUD varoittaa, jos aalto on omalla
  kohdalla vaarallinen, esim. "Iso aalto lounaasta! Käänny aaltoa kohti".
  Vaalea harja kulkee vastatuulesta kohti kalastajaa ja osuu aallon
  hetkellä.

Kaatunut rengas pyörähtää ympäri ja on kumossa 6 s. Sinä aikana rengas ei
liiku omin voimin eikä kalastaa voi. Viehe palaa kelalle, ja kiinni ollut
kala karkaa. Lisäksi seuraa kaatumisen rangaistus samoista vaihtoehdoista
kuin salamalla. Oletuksena rangaistusta ei ole, koska kaatuminen on jo
itsessään menetys.

Moninpelissä palvelin ratkaisee kaatumiset (`ServerMsg.bigWave`) ja jättää
kumossa olevan renkaan potkut huomiotta.

## Trombi

Trombi on harvinainen, liikkuva pyörre
(`planWaterspouts` kansiossa `packages/shared/src/weather/waterspout.ts`).

- **Milloin:** trombi voi syntyä ukkos- tai myrskyjakson aikana. Todennäköisyys
  jaksoa kohden on säätasolla "Vähän sääilmiöitä" 25 %, "Paljon
  sääilmiöitä" 50 % ja "Täysi kaaos" 80 %. Tasoilla "Aina tyyni" ja
  "Realistinen" trombeja ei ole.
- **Liike:** trombi syntyy selälle, kulkee tuulen mukana 0,6 m/s ja
  mutkittelee sivuttain. Se kestää 70–110 s tai häviää, kun se osuu rantaan.
- **Imu:** 70 m säteellä trombi vaikuttaa renkaaseen kuin kova tuuli, joka
  imee keskustaa kohti ja pyörittää vastapäivään. Paikallaan oleva
  ajautuu spiraalina keskelle, mutta pikapotkuilla (Shift) pääsee karkuun.
  Heittoon trombi ei vaikuta.
- **Nappaus:** alle 6 m päässä keskustasta trombi kaataa renkaan ja sinkoaa
  sen ulospäin. Rengas on kumossa 6 s, ja kaatumisen rangaistus seuraa.
  Kumossa ja 3 s sen jälkeen trombi ei vaikuta renkaaseen, joten siitä ehtii
  potkia pois.
- **Näkyvyys:** trombi näkyy kaukaa harmaana, pyörivänä suppilona. Ylhäältä
  se näkyy spiraalina. Säärivillä lukee lähimmän trombin etäisyys ja suunta,
  esim. "trombi 320 m lounaassa". Imualueella HUD muistuttaa pakenemaan.

Moninpelissä palvelin laskee imun samoin kuin tuulen ja ratkaisee
nappaukset (`ServerMsg.spout`).

Säätaso valitaan yksinpelin asetuksista tai moninpelin aulasta. Kehitystä varten
osoitteeseen voi lisätä `?difficulty=easy&weather=chaos`. `?bench=1` käyttää
aina tyyntä säätä, jotta mittaukset ovat vertailukelpoisia.
