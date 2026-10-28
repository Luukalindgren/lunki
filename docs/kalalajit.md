# Kalalajit

Lajien parametrit ovat tiedostossa `packages/shared/src/fishing/fish.ts` (`SPECIES`).
Oletuksena järvessä ovat Lunkinjärven omat lajit: ahven, hauki, särki, lahna, kiiski
(harvinaisena) ja made. Kuhan, taimenen, säyneen, kirjolohen ja karpin voi lisätä
asetuksista (yksinpelin asetusnäkymä, moninpelissä isännän aula). Ennen #225:tä
tallennettuihin asetuksiin lisätään uudet omat lajit automaattisesti kerran.

| Laji      | Oma laji | Parvi | Elinalue (pohjan syvyys)         | Paino, mediaani | Iso yksilö              | Käytös                                                            |
| --------- | -------- | ----- | -------------------------------- | --------------- | ----------------------- | ----------------------------------------------------------------- |
| Ahven     | kyllä    | 12    | 1–4,5 m, rantojen tuntuma        | 140 g           | 1 %, ~0,7 kg            | Runsain, kiinnostuu reippaasta vieheestä                          |
| Hauki     | kyllä    | yksin | 0,6–2,2 m, kaislikon reuna       | 1,3 kg          | 3 %, ~5 kg (max 12 kg)  | Vaanii paikallaan, iskee kauas ja nopeasti                        |
| Särki     | kyllä    | 24    | 0,5–3 m, kaislikon reuna         | 110 g           | 1 %, ~0,45 kg           | Ei petokala: tarttuu harvoin, vain hitaaseen vieheeseen           |
| Lahna     | kyllä    | 16    | 2–6 m, lahdet ja syvänteen reuna | 0,8 kg          | 3 %, ~2,5 kg (max 6 kg) | Pohjasta ruokaileva: vain hidas, pohjaa laahaava jigi             |
| Kiiski    | kyllä    | 12    | 2–8 m, pohja                     | 40 g            | 2 %, ~120 g (max 250 g) | Harvinainen, tarttuu herkästi jigiin ja lippaan pohjassa          |
| Made      | kyllä    | yksin | yli 4 m, syvänne ja jyrkänne     | 0,6 kg          | 3 %, ~1,5 kg (max 4 kg) | Lähes vain yöllä, paikallaan tai hitaasti nytkytetty jigi         |
| Kuha      | ei       | 5     | yli 4 m, syvänteet               | 1 kg            | 3 %, ~4 kg              | Pohjan tuntumassa, hidas viehe, varovainen napsu                  |
| Taimen    | ei       | 3     | yli 2 m, avovesi                 | 0,9 kg          | 3 %, ~3 kg              | Partioi laajasti, seuraa viehettä pitkään, hyppii                 |
| Säyne     | ei       | 8     | 1,5–5 m, välivesi ja pinta       | 0,7 kg          | 3 %, ~1,8 kg (max 4 kg) | Iltaisin pinnassa, lippa ja pieni lusikka, hyppii                 |
| Kirjolohi | ei       | 4     | yli 2 m, avovesi                 | 1,2 kg          | 3 %, ~3 kg (max 7 kg)   | Istutettu, ahne ja nopea, hyppii väsytyksessä                     |
| Karppi    | ei       | 4     | 0,8–3 m, kasvillisuuden reuna    | 3 kg            | 4 %, ~8 kg (max 18 kg)  | Istutettu, hyvin varovainen pohjakala, pitkät ja voimakkaat pakot |

Runsaus jaetaan valittujen lajien kesken suhteessa (ahven 6, särki 4, lahna 1,6, kuha 0,8,
säyne 0,7, hauki 0,6, kirjolohi 0,6, kiiski 0,5, taimen 0,5, made 0,35, karppi 0,3). Saatu
kala korvautuu uudella saman lajin kalalla lajitoverin lähellä.

Uudet lajit lisättiin listan loppuun, joten vanhoilla lajivalinnoilla (esim. vain ahven,
hauki ja särki) kalakanta arvotaan täsmälleen kuten ennen; testi vertaa sormenjälkeä.
Oletuslajisto muuttui, joten asiakas ja palvelin päivitetään samassa julkaisussa.

Moninpelissä palvelin hylkää saaliin, jonka lajia ei ole huoneen lajistossa.

Osa hauista (35 %) ja särkiparvista (20 %) asettuu kaislikoiden ja lumpeikoiden reunoille
(`lunkinjarvi-reeds.json`). Kaislikossa viehe voi tarttua varsiin missä syvyydessä tahansa,
ja rengas kulkee siellä hitaasti.

## Suurkalat ja jättikalat (#231)

Jokaisella lajilla on viisi kokoluokkaa omin painorajoin (`sizes`). Luotaimet näyttävät
kaiun luokan mukaan:

| Luokka    | Kaiku              | Ahven    | Hauki  | Särki     | Kuha   | Taimen | Lahna | Kiiski | Made  | Säyne | Kirjolohi | Karppi |
| --------- | ------------------ | -------- | ------ | --------- | ------ | ------ | ----- | ------ | ----- | ----- | --------- | ------ |
| pieni     | keltainen 1 px     | < 0,2 kg | < 1 kg | < 0,15 kg | < 1 kg | < 1 kg | < 1   | < 0,06 | < 0,8 | < 0,8 | < 1,5     | < 4    |
| iso       | oranssi 2 px       | 0,2      | 1      | 0,15      | 1      | 1      | 1     | 0,06   | 0,8   | 0,8   | 1,5       | 4      |
| tosi iso  | punainen 3 px      | 0,4      | 2,5    | 0,3       | 2      | 2      | 2     | 0,1    | 1,5   | 1,5   | 2,5       | 7      |
| suurkala  | violetti 4 px      | 0,8      | 5      | 0,5       | 4      | 3      | 3,5   | 0,15   | 2,5   | 2,5   | 4         | 10     |
| jättikala | musta, 5 px, leveä | 1,2      | 8      | 0,7       | 6      | 4,5    | 5     | 0,2    | 3,2   | 3,2   | 5,5       | 14     |

Järvessä on aina jokaista lajia vähintään yksi jättikala (hauella kaksi) ja kaksi suurkalaa
(kiiskellä yksi).
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

| Laji   | Yö  | Hämärä | Päivä | Pilvi | Tuuli | Syvyys päivällä → hämärässä               |
| ------ | --- | ------ | ----- | ----- | ----- | ----------------------------------------- |
| Ahven  | 0,2 | 1,35   | 1     | –     | +15 % | 2–5 m → matalikoille 0,8–3 m              |
| Hauki  | 0,3 | 1,4    | 0,9   | +35 % | +25 % | kaislikon reuna                           |
| Särki  | 0,5 | 1,3    | 1     | –     | –     | välivesi 1,5–4 m → matalikot 0,4–1,5      |
| Kuha   | 1,5 | 1,6    | 0,45  | +50 % | +30 % | syvänne → nousee 1,5–4 m:iin              |
| Taimen | 0,4 | 1,4    | 0,8   | +50 % | +20 % | pintakerros, kirkkaalla syvemmällä        |
| Lahna  | 0,9 | 1,3    | 0,6   | +20 % | –     | 2,5–6 m → matalikoille 1–3 m              |
| Kiiski | 1,2 | 1,3    | 0,8   | +10 % | –     | yli 3 m → 2–6 m                           |
| Made   | 1,8 | 0,9    | 0,08  | +20 % | –     | syvänne, yöllä 2 m:stä alkaen             |
| Säyne  | 0,4 | 1,6    | 0,8   | +20 % | +10 % | välivesi → iltaisin pinnassa              |
| Kirjo  | 0,4 | 1,3    | 0,9   | +30 % | +20 % | kirkkaalla syvemmällä, hämärässä pinnassa |
| Karppi | 1,3 | 1,4    | 0,6   | +10 % | –     | 1–3 m → 0,6–2 m                           |

Luvut ovat syöntiaktiivisuuden kertoimia (1 = tavallinen päivä): ne kertovat, kuinka herkästi
kala kiinnostuu vieheestä ja kuinka vilkkaasti se liikkuu. Ahven, hauki ja taimen saalistavat
näön varassa, joten pimeällä ne huomaavat vieheen vain noin puolet lähempää. Kuha näkee
hämärässä hyvin.

Sää vaikuttaa kaikkiin lajeihin:

- **Ennen ukkosta** (n. 4 min ennen rintamaa) syönti kiihtyy 40 %.
- **Ukkosella ja myrskyllä** kalat painuvat pohjaan ja syönti lähes loppuu.
- **Tuulen puoleisella rannalla** (rannalla, jota kohti tuuli puhaltaa) ahven, hauki ja kuha
  ovat aktiivisempia, koska aallot tuovat sinne ravintoa; vastarannalla hiljaisempaa.

Lajien erityispiirteet (`behavior`):

- **Kuhan napsu**: kuha pitää viehettä suussaan vain hetken, joten vastaiskun ikkuna on 60 %
  tavallisesta (`strikeWindow`).
- **Taimen seuraa pitkään**: se seuraa viehettä 1,8 kertaa pidempään ennen kuin luovuttaa,
  ja iskee sitä harvemmin sekunnissa (`follows`).
- **Hyppivät kalat**: kirjolohi (0,6 hyppyä/s paossa), säyne (0,25) ja taimen (0,3) hyppäävät
  väsytyksessä (`jumps`). Jos siima on hypyn hetkellä löysällä, kala irtoaa
  (ei helpolla, jossa löysä siima ei muutenkaan päästä kalaa).
- **Karpin pakoretket** ovat kaksi kertaa tavallista pidempiä (`runs`): jarru on säädettävä
  ja 0,30 mm siima on tarpeen.
- **Lahna, karppi ja made** ovat pohjakaloja: viehe kiinnostaa vain pohjan tuntumassa ja
  hitaana, joten jigi on niille ylivoimaisesti paras.

Vuorokaudenaika annetaan kaloille valona ja hämäryytenä (`fishConditions`). Kalojen
liike ei vaikuta saaliin painoon tai lajiin: ne tulevat edelleen kalakannan siemenestä, ja
parvet pysyvät kotipaikkansa lähellä, joten palvelimen tarkistus saaliin paikasta pätee.

## Vieheet ja varusteet

Varusteet valitaan yksinpelin asetuksissa tai moninpelin aulassa ennen kisaa (rivi Omat
varusteet), ja niitä voi vaihtaa taukovalikon (Esc) Varusteet-näkymästä tai vieheen
pikanäppäimellä R. Vaihto tapahtuu, kun viehe on kelalla. Valinnat
muistetaan selaimessa. Moninpelissä kaikkien varusteet näkyvät aulan pelaajalistassa ja
tuloksissa. "Aloittelijan varusteet" palauttaa oletukset: perusvapa, lusikka ja 0,25 mm
siima ilman perukkaa. Parametrit: `packages/shared/src/fishing/gear.ts`.

| Vapa       | Heitto   | Siiman kestävyys | Kalan väsytys | Heittopaino |
| ---------- | -------- | ---------------- | ------------- | ----------- |
| Kevyt vapa | +5 %     | +15 % (joustaa)  | −20 %         | 3–15 g      |
| Perusvapa  | normaali | normaali         | normaali      | 7–25 g      |
| Järeä vapa | −6 %     | −10 %            | +30 %         | 15–60 g     |

Heittopainon ulkopuolinen viehe heittyy 20 % lyhyemmälle (`CAST_WEIGHT_PENALTY`), ja Varusteet-näkymä
varoittaa siitä. Vieheiden painot: lusikka 15 g, lippa 7 g, jigi ja vaappu säädön mukaan (alla).

| Viehe        | Uppoaminen                                          | Heitto   | Parhaat lajit                     |
| ------------ | --------------------------------------------------- | -------- | --------------------------------- |
| Lusikka      | uppoaa, nousee kelatessa                            | pitkä    | hauki, kirjolohi, taimen, säyne   |
| Vaappu       | kelluu, sukeltaa kelatessa n. 2,5 m:iin             | lyhyt    | hauki, kuha, taimen               |
| Jigi         | painuu nopeasti pohjaan, kiinnostaa myös paikallaan | pisin    | made, kuha, kiiski, lahna, karppi |
| Lippa        | uppoaa hitaasti                                     | lyhyehkö | säyne, ahven, kirjolohi, kiiski   |
| Ruoholusikka | uppoaa hitaasti, nousee kelatessa pinnan tuntumaan  | normaali | hauki, säyne                      |

| Siima   | Kestävyys | Heitto   | Kalat                  |
| ------- | --------- | -------- | ---------------------- |
| 0,20 mm | 3,5 kg    | +7 %     | kiinnostuvat herkemmin |
| 0,25 mm | 5 kg      | normaali | normaali               |
| 0,30 mm | 7 kg      | −8 %     | arkailevat             |

### Jigin paino ja vaapun uintisyvyys (#363)

Säätö on vieheen parametri (`Tackle.jigWeight`, `Tackle.crankDepth`, taulut `JIG_WEIGHTS` ja
`CRANK_DEPTHS`), ei uusi viehe: R kiertää vieheet kuten ennen. Ennen kisaa Varusteet-näkymässä
valitaan molemmat, kisan aikana käytössä olevan vieheen säätö. Nimi näkyy säätöineen ("Jigi 20 g",
"Vaappu syvä") HUD:ssa, ilmoituksissa, aulassa, tuloksissa ja ennätyksissä (`lure_variant`).
Oletussäädöt (10 g, keski) ovat entinen jigi ja vaappu.

| Jigi | Uppoaminen | Heitto | Tartunta | Kalat                                        |
| ---- | ---------- | ------ | -------- | -------------------------------------------- |
| 5 g  | 0,45 m/s   | 1,0    | 1,1      | ahven ja kiiski, vajoaa hitaasti välivedessä |
| 10 g | 0,8 m/s    | 1,15   | 1,4      | entinen jigi                                 |
| 20 g | 1,2 m/s    | 1,25   | 1,7      | kuha, made ja suurkalat syvänteessä          |

| Vaappu | Syvin uinti | Heitto | Vastus | Käyttö                                  |
| ------ | ----------- | ------ | ------ | --------------------------------------- |
| matala | 0,8 m       | 0,9    | 0,8    | kasvustojen päältä, tarttuu harvoin     |
| keski  | 2,5 m       | 0,85   | 1      | entinen vaappu                          |
| syvä   | 4,5 m       | 0,8    | 1,5    | syvänteen reunat ja kuha, raskas kelata |

**Nykäisy** (hiiren oikea tai J, kosketuksella NYKÄISE): viehe pomppaa ylös ja 0,5 m kohti
kalastajaa ja vajoaa taas (`TWITCH` tiedostossa `fishing.ts`). Kevyt jigi nousee enemmän kuin
raskas. Nykäisyn jälkeen vajoava viehe kiinnostaa kaloja 2,5 s tavallista enemmän, ja iskun
aikana nykäisy on vastaisku.

**Ruohosuojattu viehe ja perho (#364).** Ruoholusikan ja ruohostreamerin koukun kärkeä suojaa
lanka (`weedGuard` 0,85). Kasvustossa, kaislikossa, risukossa ja kaatuneessa puussa ne tarttuvat
ja keräävät rikkaa selvästi harvemmin, kivikossa suoja auttaa puoliksi (`SNAG.guardHelp`). Lanka
työntää myös kalan suuta pois koukusta, joten isku tarttuu harvemmin (`SNAG.hookLoss`: noin 25 %
vähemmän). Sopii kaislikon ja lumpeikon reunalla väijyvälle hauelle.

Teräsperukka estää hauen hampaita katkaisemasta siimaa väsytyksessä (normaalilla ja
realistisella noin 3 % sekunnissa), mutta muut lajit tarttuvat siihen hieman harvemmin.

## Perhokalastus (#234)

Kalastajalla on mukana sekä virveli- että perhovälineet. Kalastustapa valitaan varusteista ennen kisaa tai
taukovalikon Varusteet-näkymässä (Kalastustapa: Virveli / Perho), ja sitä voi vaihtaa kesken kisan, kun viehe on
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
| Nymfi           | 1,5 cm | vajoaa pohjan tuntumaan               | särki, kirjolohi, karppi, lahna   |
| Ruohostreameri  | 18 cm  | leijuu, vajoaa hitaasti               | hauki kaislikon reunassa          |

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

**Heitto (#235).** Perho heitetään heiluttamalla vapaa edestakaisin. Parametrit: `FLY_CAST`
tiedostossa `flyCast.ts`, vaikeustasojen avut `flyCast` tiedostossa `difficulty.ts`.

- Hiiren vasen aloittaa heiton, ja osoitin lukitaan pelikuvaan. Hiiri itseä kohti =
  takaheitto, poispäin = eteenheitto (400 px = koko liikerata, noin 120°). Vasen pohjassa =
  siimakäsi puristaa siimaa, oikea = siimakäden veto (haul, siima +25 % nopeammin). X keskeyttää.
- Jokainen liike päättyy pysäytykseen, joka lähettää silmukan. Siiman nopeus = vavan
  huippunopeus × 4 m/s (enintään 32 m/s) × varusteiden kerroin. Silmukka aukeaa ajassa siima /
  nopeus; kun siima on suorassa, kuuluu naksahdus ja mittari muuttuu vihreäksi ("NYT!" helpolla ja
  normaalilla). Silloin vaihdetaan suuntaa.
- Ihannekaari kasvaa siiman mukana: 5 m siimalla noin 30°, 18 m siimalla noin 80°.
- Siimaa pidennetään avaamalla siimakäsi silmukan auetessa: siimaa luistaa 35 % siiman
  nopeudesta (helpolla itsestään). Viimeisessä eteenheitossa avoin käsi ampuu siimaa 80 %
  nopeudesta. Ilmassa enintään 22 m, eli heitto renkaasta noin 25 m. Luistava siima tulee ensin
  renkaan edestä löysästä.
- Vedestä heittoon nostetaan enintään 10 m siimaa (hiiren oikea uiton aikana). Siima vedessä ja
  eteenpäin liike = rullaheitto, enintään 12 m.
- Välilyönnillä rytmiheitto: jokainen painallus tekee taka- tai eteenheiton ihannekaarella, ja
  siimakäsi pidentää siimaa itsestään 16 metriin. Heitto laskeutuu, kun painaminen loppuu.
- Kosketusnäytöllä (#236) pyyhkäisy järvellä alas = takaheitto, ylös = eteenheitto (60 %
  ruudun korkeudesta = koko liikerata), ja sormen pysähtyminen on pysäytys. Siimakäsi toimii
  kuten rytmiheitossa, kunnes pelaaja painaa SIIMA-nappia: sen jälkeen SIIMA pohjassa =
  puristus. VETO on uitossa siiman veto ja heitossa siimakäden veto. Perhon ollessa vedessä
  SIIMA-nappi on NOSTA, joka nostaa siiman uuteen heittoon.

| Virhe                                     | Seuraus                                                         |
| ----------------------------------------- | --------------------------------------------------------------- |
| Suunnan vaihto ennen kuin silmukka aukesi | Läimäys, vapa ei lataudu; realistisella perho voi katketa       |
| Liian myöhään                             | Takaheitto putoaa veteen, eteenheitto laskeutuu                 |
| Liian lyhyt liike pitkälle siimalle       | Siima ei jaksa: luhistuu tai putoaa                             |
| Liian laaja liike tai laimea pysäytys     | Leveä silmukka: −20 % ja tuuli siirtää perhoa kaksinkertaisesti |
| Siimakäsi auki liikkeen aikana            | Vapa ei lataudu (−65 %)                                         |
| Kiihdytys äkkiä liikkeen lopussa          | Häntäsilmukka: −15 %; realistisella tuulisolmu (siima −40 %)    |
| Takaheitto rantaan tai kaislikkoon        | Perho tarttuu taakse, irrotus 4 s                               |
| Kova sivutuuli oikealta (realistinen)     | Perho voi osua hattuun, irrotus 4 s                             |

| Vaikeustaso | Läimäys ennen | Putoaa (suoristumisesta) | NYT!-merkki | Siima luistaa itse | Virheet         |
| ----------- | ------------- | ------------------------ | ----------- | ------------------ | --------------- |
| Helppo      | 35 %          | 150 %, väh. 0,8 s        | kyllä       | kyllä              | ei              |
| Normaali    | 65 %          | 60 %, väh. 0,35 s        | kyllä       | ei                 | heikentävät     |
| Realistinen | 80 %          | 35 %, väh. 0,2 s         | ei          | ei                 | kaikki käytössä |

**Näkymät ja äänet (#236).** Siiman muoto ilmassa lasketaan sivukuvana (`game/flyLine.ts`):
silmukan alempi osa kulkee vavan kärjestä liikkeen suuntaan ja ylempi palaa sen yläpuolella,
kunnes siima on suorassa; myöhästynyt siima putoaa. Samaa muotoa käyttävät:

- Sivukuvapaneeli (`ui/flyCastPanel.ts`) luotainten vieressä heiton ajan; P (heiton aikana myös
  L) piilottaa. Suorassa siimassa perho välkkyy vihreänä ja teksti on "NYT!", jos merkki on
  vaikeustasolla käytössä. Kosketuksella paneeli on alareunassa.
- Ylhäältä siima näkyy viivana, ja silmukka on kallellaan oikealle, jotta se erottuu kapeana
  lenkkinä. POV:ssa sama siima kulkee 3D:nä oikean olan yli.
- POV:ssa perhovapa on ohut ja vihreä, kela on tyvessä, ja vapa taipuu liikkeen aikana (kahva
  johtaa). Perho laskeutuu pienellä roiskeella, popperi isommalla.
- Muut pelaajat: lentovaihe välittää perhon paikan ilmassa. Vastaanottaja päättelee silmukan
  suunnan perhon liikkeestä ja siiman pituuden suurimmasta etäisyydestä, joten palvelinta ei
  tarvinnut muuttaa.
- Äänet: suhina silmukan auetessa (voimakkuus ja sävy nopeuden mukaan), läimäys, vaimea nykäys
  suoristuessa, perhon laskeutuminen, popperin pulpahdus ja siiman sihinä, kun siimaa luistaa tai
  kala vie sitä sormien läpi.

Kun löysää on renkaan edessä enemmän kuin heitto vie (voimamittariheitto), yli 5 m ylimääräinen
löysä voi sotkeutua (ei helpolla), jolloin heitto jää lyhyeksi.

Ennätyksiin ja yksinpelin ennätyslistaan tallentuu kalastustapa ja perhovälineet.
