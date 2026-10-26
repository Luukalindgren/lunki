# Kalalajit

Lajien parametrit ovat tiedostossa `packages/shared/src/fishing/fish.ts` (`SPECIES`).
Oletuksena järvessä ovat Lunkinjärven oikeat lajit: ahven, hauki ja särki. Kuhan ja
taimenen voi lisätä asetuksista (yksinpelin asetusnäkymä, moninpelissä isännän aula).

| Laji   | Oma laji | Parvi | Elinalue (pohjan syvyys)   | Paino, mediaani | Iso yksilö             | Käytös                                                  |
| ------ | -------- | ----- | -------------------------- | --------------- | ---------------------- | ------------------------------------------------------- |
| Ahven  | kyllä    | 12    | 1–4,5 m, rantojen tuntuma  | 140 g           | 1 %, ~0,7 kg           | Runsain, kiinnostuu reippaasta vieheestä                |
| Hauki  | kyllä    | yksin | 0,6–2,2 m, kaislikon reuna | 1,3 kg          | 3 %, ~5 kg (max 12 kg) | Vaanii paikallaan, iskee kauas ja nopeasti              |
| Särki  | kyllä    | 24    | 0,5–3 m, kaislikon reuna   | 110 g           | 1 %, ~0,45 kg          | Ei petokala: tarttuu harvoin, vain hitaaseen vieheeseen |
| Kuha   | ei       | 5     | yli 4 m, syvänteet         | 1 kg            | 3 %, ~4 kg             | Pohjan tuntumassa, hidas viehe                          |
| Taimen | ei       | 3     | yli 2 m, avovesi           | 0,9 kg          | 3 %, ~3 kg             | Partioi laajasti, vahvin taistelija                     |

Runsaus jaetaan valittujen lajien kesken suhteessa (ahven 6, särki 4, kuha 0,8, hauki 0,6,
taimen 0,5). Saatu kala korvautuu uudella saman lajin kalalla lajitoverin lähellä.

Moninpelissä palvelin hylkää saaliin, jonka lajia ei ole huoneen lajistossa.

Osa hauista (35 %) ja särkiparvista (20 %) asettuu kaislikoiden ja lumpeikoiden reunoille
(`lunkinjarvi-reeds.json`). Kaislikossa viehe voi tarttua varsiin missä syvyydessä tahansa,
ja rengas kulkee siellä hitaasti.

## Suurkalat ja jättikalat (#231)

Jokaisella lajilla on viisi kokoluokkaa omin painorajoin (`sizes`). Luotaimet näyttävät
kaiun luokan mukaan:

| Luokka    | Kaiku              | Ahven    | Hauki  | Särki     | Kuha   | Taimen |
| --------- | ------------------ | -------- | ------ | --------- | ------ | ------ |
| pieni     | keltainen 1 px     | < 0,2 kg | < 1 kg | < 0,15 kg | < 1 kg | < 1 kg |
| iso       | oranssi 2 px       | 0,2      | 1      | 0,15      | 1      | 1      |
| tosi iso  | punainen 3 px      | 0,4      | 2,5    | 0,3       | 2      | 2      |
| suurkala  | violetti 4 px      | 0,8      | 5      | 0,5       | 4      | 3      |
| jättikala | musta, 5 px, leveä | 1,2      | 8      | 0,7       | 6      | 4,5    |

Järvessä on aina jokaista lajia vähintään yksi jättikala (hauella kaksi) ja kaksi suurkalaa.
Paikat valitaan kalakannan siemenestä omalla arpojallaan, joten palvelin laskee saman kannan,
ja saadun jättikalan tilalle syntyy taas jättikala.

Iso kala on vanha ja kokenut: se kiinnostuu vieheestä yhtä herkästi kuin pienempi, mutta
iskee harvemmin (iskuherkkyys luokittain 1; 0,9; 0,7; 0,4; 0,25). Hämärässä, tuulella ja
ennen ukkosta suurkalat innostuvat selvemmin kuin pienet. Ne pitävät isosta ja hitaasta
vieheestä (vaappu ja lusikka), jigi ja lippa kiinnostavat vähemmän. Kun suurkala seuraa
viehettä alle 6 m:n päähän kalastajasta, se kääntyy pois ja säikähtää (painuu syvemmälle
eikä kiinnostu 30–60 s): kalastaja näkee tumman varjon vieheen perässä ja ilmoituksen
"Iso varjo seurasi viehettä!". Pohjaan tarttunut viehe säikäyttää sen samoin.

## Käytös

Lajien käytös (`behavior` lajin parametreissa) jäljittelee oikeita kaloja:

- **Parvet uivat yhdessä.** Ahven-, särki-, kuha- ja taimenparvella on yhteinen
  keskipiste ja suunta, ja jokainen kala pysyy omalla paikallaan parvessa. Parvi kiertelee
  kotipaikkansa ympärillä ja hakeutuu valon mukaiseen syvyyteen. Pimeällä parvi hajoaa
  väljemmäksi, pakeneva parvi tiivistyy palloksi.
- **Hauki väijyy.** Se seisoo yksin kaislikon, kaatuneen puun tai kivikon reunassa ja vaihtaa
  paikkaa harvoin. Vieheen perään se lähtee vain lyhyeksi matkaa ja päättää muutamassa
  sekunnissa, iskeekö, mutta isku on herkempi kuin muilla.
- **Ahvenparvi kilpailee ruoasta.** Kun yksi ahven lähtee seuraamaan viehettä, koko parvi
  innostuu noin 20 sekunniksi: muut huomaavat vieheen kauempaa, kiinnostuvat herkemmin ja
  parvi kääntyy vieheen suuntaan. Samasta paikasta saa siksi usein monta ahventa.
- **Särkiparvi pakenee haukea.** Kun hauki on parven lähellä, parvi pakenee muutaman sekunnin
  poispäin hauesta. Tuulella särkiparvet kulkevat aaltojen mukana tuulen alle.

| Laji   | Yö  | Hämärä | Päivä | Pilvi | Tuuli | Syvyys päivällä → hämärässä          |
| ------ | --- | ------ | ----- | ----- | ----- | ------------------------------------ |
| Ahven  | 0,2 | 1,35   | 1     | –     | +15 % | 2–5 m → matalikoille 0,8–3 m         |
| Hauki  | 0,3 | 1,4    | 0,9   | +35 % | +25 % | kaislikon reuna                      |
| Särki  | 0,5 | 1,3    | 1     | –     | –     | välivesi 1,5–4 m → matalikot 0,4–1,5 |
| Kuha   | 1,5 | 1,6    | 0,45  | +50 % | +30 % | syvänne → nousee 1,5–4 m:iin         |
| Taimen | 0,4 | 1,4    | 0,8   | +50 % | +20 % | pintakerros, kirkkaalla syvemmällä   |

Luvut ovat syöntiaktiivisuuden kertoimia (1 = tavallinen päivä): ne kertovat, kuinka herkästi
kala kiinnostuu vieheestä ja kuinka vilkkaasti se liikkuu. Ahven, hauki ja taimen saalistavat
näön varassa, joten pimeällä ne huomaavat vieheen vain noin puolet lähempää. Kuha näkee
hämärässä hyvin.

Sää vaikuttaa kaikkiin lajeihin:

- **Ennen ukkosta** (n. 4 min ennen rintamaa) syönti kiihtyy 40 %.
- **Ukkosella ja myrskyllä** kalat painuvat pohjaan ja syönti lähes loppuu.
- **Tuulen puoleisella rannalla** (rannalla, jota kohti tuuli puhaltaa) ahven, hauki ja kuha
  ovat aktiivisempia, koska aallot tuovat sinne ravintoa; vastarannalla hiljaisempaa.

Vuorokaudenaika annetaan kaloille valona ja hämäryytenä (`fishConditions`). Kalojen
liike ei vaikuta saaliin painoon tai lajiin: ne tulevat edelleen kalakannan siemenestä, ja
parvet pysyvät kotipaikkansa lähellä, joten palvelimen tarkistus saaliin paikasta pätee.

## Vieheet ja varusteet

Varusteet valitaan moninpelin aulassa ennen kisaa, ja niitä voi vaihtaa taukovalikosta
(Esc) tai vieheen pikanäppäimellä R. Vaihto tapahtuu, kun viehe on kelalla. Valinnat
muistetaan selaimessa. Moninpelissä kaikkien varusteet näkyvät aulan pelaajalistassa ja
tuloksissa. "Aloittelijan varusteet" palauttaa oletukset: perusvapa, lusikka ja 0,25 mm
siima ilman perukkaa. Parametrit: `packages/shared/src/fishing/gear.ts`.

| Vapa       | Heitto   | Siiman kestävyys | Kalan väsytys |
| ---------- | -------- | ---------------- | ------------- |
| Kevyt vapa | +5 %     | +15 % (joustaa)  | −20 %         |
| Perusvapa  | normaali | normaali         | normaali      |
| Järeä vapa | −6 %     | −10 %            | +30 %         |

| Viehe   | Uppoaminen                                          | Heitto   | Parhaat lajit        |
| ------- | --------------------------------------------------- | -------- | -------------------- |
| Lusikka | uppoaa, nousee kelatessa                            | pitkä    | hauki, taimen, ahven |
| Vaappu  | kelluu, sukeltaa kelatessa n. 2,5 m:iin             | lyhyt    | hauki, kuha, taimen  |
| Jigi    | painuu nopeasti pohjaan, kiinnostaa myös paikallaan | pisin    | kuha, ahven          |
| Lippa   | uppoaa hitaasti                                     | lyhyehkö | ahven, taimen, särki |

| Siima   | Kestävyys | Heitto   | Kalat                  |
| ------- | --------- | -------- | ---------------------- |
| 0,20 mm | 3,5 kg    | +7 %     | kiinnostuvat herkemmin |
| 0,25 mm | 5 kg      | normaali | normaali               |
| 0,30 mm | 7 kg      | −8 %     | arkailevat             |

Teräsperukka estää hauen hampaita katkaisemasta siimaa väsytyksessä (normaalilla ja
realistisella noin 3 % sekunnissa), mutta muut lajit tarttuvat siihen hieman harvemmin.

## Perhokalastus (#234)

Kalastajalla on mukana sekä virveli- että perhovälineet. Kalastustapa valitaan aulassa tai
taukovalikossa (Kalastustapa: Virveli / Perho), ja sitä voi vaihtaa kesken kisan, kun viehe on
kelalla. Vavat valitaan ennen kisaa, perho kisan aikana (R vaihtaa perhoa). Parametrit:
`FLY_RODS`, `FLY_LINES`, `FLY_LEADERS` ja `FLIES` tiedostossa `gear.ts`, uitto `FLY` tiedostossa
`fishing.ts`.

| Perhovapa | Heitto | Peruke kestää | Väsytys | Kääntää perhon |
| --------- | ------ | ------------- | ------- | -------------- |
| #6        | +5 %   | +25 %         | −25 %   | enintään 10 cm |
| #8        | perus  | +10 %         | perus   | enintään 20 cm |
| #10       | −5 %   | perus         | +30 %   | enintään 30 cm |

Liian iso perho kevyelle vavalle lyhentää heittoa 20 %. Perhoheitto on renkaasta 12–24 m, eli
aina virveliheittoa lyhyempi (palvelimen heittotarkistus pätee sellaisenaan).

| Perhosiima   | Vajoaminen | Syvin perho                    |
| ------------ | ---------- | ------------------------------ |
| Kelluva      | –          | perukkeen mitta 1,2 m          |
| Intermediate | 5 cm/s     | pohjaan asti                   |
| Uppoava      | 12 cm/s    | pohjaan asti, myös vedettäessä |

| Peruke      | Kestävyys | Hauen hampaat     | Muut lajit       |
| ----------- | --------- | ----------------- | ---------------- |
| Tavallinen  | 7 kg      | katkeaa           | normaali         |
| Fluorohiili | 9 kg      | katkeaa harvemmin | +8 % (näkymätön) |
| Teräs       | 11 kg     | kestää            | arkailevat −15 % |

| Perho           | Koko   | Uinti                                 | Parhaat lajit                     |
| --------------- | ------ | ------------------------------------- | --------------------------------- |
| Hauki-streameri | 20 cm  | leijuu, vajoaa hitaasti               | hauki, jättikalat (iskut tauolla) |
| Pintapopperi    | 8 cm   | pysyy pinnassa, pulpahtaa vedettäessä | hauki, ahven                      |
| Ahven-streameri | 6 cm   | vajoaa hitaasti                       | ahven, taimen, kuha               |
| Nymfi           | 1,5 cm | vajoaa pohjan tuntumaan               | särki, taimen                     |

Aloittelijan perhovälineet: #8, kelluva siima, teräsperuke ja hauki-streameri.

**Uitto.** Perhoa ei kelata, vaan siimaa vedetään siimakädellä. Hiiren vasen pohjassa pitää
siimaa, ja hiiren veto alas vetää siimaa liikkeen verran (koko ruudun liike noin 2 m, enintään
2 m/s). Välilyönti ja kosketusnäytön KELAA vetävät tasaisesti 0,6 m/s. Vedetty siima jää
löysäksi renkaan eteen veteen ja näkyy POV:ssa kiekuroina. Vetojen välillä perho pysähtyy ja
leijuu, vajoaa tai nousee pintaan perhon ja siiman mukaan. Hauki ja suurkalat iskevät
herkimmin 0,2–4 s tauolla vedon jälkeen.

**Vastaisku ja väsytys.** Vastaisku tehdään siimakäden vedolla heti tärpin jälkeen. Vavan
nosto (nopea hiiren liike ylös) pistää realistisella ja normaalilla haukeen huonommin (kova
suu). Väsytyksessä puristettu siima ei anna periksi, joten iso kala voi katkaista perukkeen.
Kun hiiren päästää, kala vie siimaa sormien läpi (0,5 kg kitka), ensin löysästä. F kelaa
löysät kelalle, minkä jälkeen väsytys toimii kelan jarrulla kuten virvelillä.

**Heitto.** Heitto käyttää toistaiseksi virvelin voimamittaria (perhoheiton oma mekaniikka
tulee #235:ssä). Heitto ampuu löysän siiman. Heiton pituuden yli jäävä löysä jää renkaan
eteen, ja yli 5 m ylimääräinen löysä voi sotkeutua (ei helpolla), jolloin heitto jää lyhyeksi.

Ennätyksiin ja yksinpelin ennätyslistaan tallentuu kalastustapa ja perhovälineet.
