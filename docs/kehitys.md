# Kehitysperiaatteet

Tämä ohje koskee jokaista muutosta, teki sen ihminen tai Claude. Pelin osat
on koottu lokakuussa 2026 yhtenäisiksi järjestelmiksi (PR:t #339–#344).
Uusi ominaisuus käyttää niitä eikä tee niiden rinnalle omaa versiota.

## Työtapa

- **Issuet ovat tehtävälista.** Jokainen muutos tehdään omassa haarassaan ja
  PR:ssä, joka viittaa issueen (`Closes #N`). main päivittyy vain
  yhdistettyjen PR:ien kautta; Claude saa yhdistää omat PR:nsä, kun CI on
  vihreä.
- **Ennen/jälkeen-kuvat.** Kun muutos näkyy käyttöliittymässä, PR:ään tai
  keskusteluun liitetään kuvakaappaukset ennen ja jälkeen: vähintään työpöytä
  (1280×720) sekä puhelin pystyssä ja vaakatasossa.
- **Tarkistukset.** `pnpm check` (lint, muotoilu, tyypit, testit) ennen
  PR:ää. Selaintestit (`pnpm build && pnpm e2e`) ajetaan CI:ssä Chromiumilla,
  Firefoxilla, WebKitillä, iPhonella ja Androidilla.
- **Palvelinkoodi.** Jos muutos koskee `packages/server`- tai
  `packages/shared`-koodia, pelikoneen palvelin käynnistetään uudelleen
  (`lunki uudelleen`), ks. [windows-palvelin.md](windows-palvelin.md).
  Pilvikone ([pilvipalvelin.md](pilvipalvelin.md)) päivittyy itse noin
  viiden minuutin kuluessa, kun kukaan ei pelaa.

### Issueiden tunnisteet

| Tunniste            | Merkitys                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------ |
| `ehdotus`           | Kehitysidea. Toteutetaan vasta, kun Luuka hyväksyy.                                                          |
| `hyväksytty`        | Luuka hyväksyi; öinen ajastettu tehtävä toteuttaa hyväksytyt vanhimmasta alkaen.                             |
| `työn alla`         | Toteutus käynnissä.                                                                                          |
| `toteutettu`        | Ehdotus on toteutettu ja yhdistetty.                                                                         |
| `palaute`           | Pelaajan palaute pelin Palaute-napista (työnkulku _Palautteet_). Ei työn alle ennen Luukan validointia.      |
| `Tutki lisää`       | Selvitetään ennen päätöstä: issueen kommentti löydöksistä ja suosituksesta, ei koodia. Sitten tunniste pois. |
| `tietoturva`        | Tietoturvalöydös.                                                                                            |
| `vaihe 1`–`vaihe 5` | Alkuperäisen tiekartan vaiheet (prototyyppi, moninpeli, oikea järvi, sää ja fysiikka, viimeistely).          |

Bugit saa korjata heti (issue + PR). Uudet ominaisuudet kirjataan
`ehdotus`-issueiksi, eikä niitä toteuteta ilman Luukan hyväksyntää.

## Yhtenäiset järjestelmät

Ennen kuin lisäät jotain, katso, kattaako jokin näistä sen jo. Kun muutos
korvaa vanhan tavan, poista vanha samassa PR:ssä.

### HUD ja ilmoitukset (PR #340)

Koodi: `packages/client/src/ui/hud.ts`, tyylit `style.css`.

- **Ilmoitukset vain `Hud.showMessage(text, seconds, level)`-kutsulla.**
  Tasot: `alert` (sää, trombi, iso aalto, sotku, salama), `event`
  (oletus, pelin tapahtumat) ja `info` (näkymän ja vieheen vaihdot,
  vinkit). Vähemmän tärkeä ilmoitus odottaa jonossa eikä peitä tärkeämpää.
  Kuva tekstin eteen `{ icon }`-valinnalla (esim. vieheen kuva
  `lureImage`, `ui/lureArt.ts`). Älä lisää omaa ilmoituslaatikkoa.
- **Tilanneohje `Hud.setSituation(text | null)`:** pysyvä ohje siihen, mitä
  pelaajan pitää nyt tehdä (sotku, viehe maalla, perhoheitto, ukkonen).
  Sama tieto ei saa toistua ilmoituksena, ohjeessa ja tilarivillä.
  Edistyminen osittain näkyy palkkeina samassa ohjeessa
  (`setSituation(text, bars)`, täyttökisan ponttoonit #482), ei omana
  laatikkona.
  Alimpana tasona on opastus ensimmäiseen kalaan (`game/guide.ts`, #370):
  uusi opastettava asia on uusi askel sen tilakoneeseen, ei oma ohjeruutu.
- **Ohjelaatikko on kisan alussa lyhyt** (#638): liike, heitto ja kelaus.
  {help} kiertää lyhyt → kaikki napit → piilossa, ja valinta jää laitteelle
  (`lunki.help`). Kosketuksella ohje on aluksi piilossa, ja ?-nappi avaa
  ja sulkee kaikkien nappien ohjeen ilmoitusten päälle. Uusi ohjerivi menee kaikkien nappien ohjeeseen (`HELP`);
  lyhyeen (`SHORT_HELP`) vain se, mitä ensimmäiseen kalaan tarvitaan.
- **Rangaistukset `Hud.setPenalties(rows, note)`** ajastimen alle (jäähy,
  kaatuminen, salama, maalle heitto), ei erillistä korttia.
- **Asettelu kiinteissä vyöhykkeissä.** Ylhäällä keskellä olevat osat ovat
  ruudun keskilinjalla, vasemman reunan laatikot alkavat `--edge-l`:stä ja
  oikean reunan laatikot päättyvät `--edge-r`:ään (kosketuksella toinen
  sarake `--col2`). Ilmoitusalue on symmetrinen (`--ns`). Mitat tulevat
  HUD-yksiköistä `--m`/`--u` ja mitatuista korkeuksista (`--top-h`,
  `--timer-h`); **ei uusia kovakoodattuja pikselisiirtymiä**. HUD-koon
  liukusäädin skaalaa kaiken, ks. `ui/hudScale.ts`.
- **Puhelimella HUD ei saa viedä järveä** (#671). Pystypuhelimella
  yläreunan rivi on kello, kompassi, luotain ja täydellä ohjauksella
  kireysmittari; sää rivittyy niiden alle. Tulostaulu ja saalislista ovat
  kosketuksella taukovalikossa (`pauseScoreboard`), ja vieheluotain on
  alareunassa tatin ja ison napin välissä (`Hud.placeLureSonar`). Ilmoitusten
  paikka ei saa riippua sään rivimäärästä. Kun lisäät tai siirrät HUDin osan,
  mittaa peitto ennen ja jälkeen 320–430 px leveillä ruuduilla: paneelien ja
  nappien peittämä osuus ruudusta ja suurin vapaa suorakulmio (lähtötaso
  marraskuussa 2026: yksinkertainen noin 30 % peitossa ja 50 % vapaana, täysi
  noin 45–55 % ja 13–30 %).

### Ohjaus (PR #343)

Koodi: `packages/client/src/game/controls.ts`.

- **Kaikki ohjaus `CONTROLS`-toimintokartan kautta.** Jokaisella
  toiminnolla on näppäimet, kosketusnappi tai ele, peliohjaimen napit (`pad`)
  ja nimi ohjeisiin. Peli kysyy toimintoja
  (`controls.wasPressed('castForward')`), ei näppäimiä.
- **Peliohjain** (Xbox, PlayStation, `engine/gamepad.ts`): syöte lukee
  ohjaimen joka askeleella koodeiksi (`Pad0` = A/✕, `PadLsUp` = vasen tatti
  ylös), ja kartan `pad`-kentät kytkevät ne toimintoihin. Ohjeet vaihtuvat
  ohjaimen napeiksi (`setControlMode('pad')`, Xbox- tai PS-merkinnät), kun
  pelaaja käyttää ohjainta. Valikoissa ohjain kulkee `MenuNav.pad`-kutsulla
  ja oikea tatti vierittää näkymää (`Screens.padScroll`). Pelissä
  oikea tatti tähtää heiton ylhäältä (`castControl.ts`), kääntää kalastajaa
  POV:ssa (`lookLeft`/`lookRight`), on perhoheitossa vapa (`backCast`/
  `forwardCast`, `flyCastControl.ts`) ja osoittaa pikavalikon lohkon
  (`HeldMenu`). Virvelin viehe vedessä tatin nopea nykäisy taakse on
  vavan nykäisy (`game/stickFlick.ts`, #595). Uusi toiminto saa `pad`-napin, jos sellainen on vapaana;
  muuten yhdistelmän `padWith`-kentällä (zoom on LT/L2 + ristiohjain, ohje piiloon LT/L2 + oikean tatin painallus), jolloin
  saman napin tavallinen toiminto väistää yhdistelmän ajaksi.
- **Näkymiä on kolme** (`ViewMode`, `game/chaseCamera.ts`, #691): kalastajan
  silmin, takaa ja ylhäältä, ja {view} kiertää ne tässä järjestyksessä
  (`nextView`; katsojalla vain silmin ja ylhäältä). Silmin ja takaa ovat
  järven tasolla (`lakeLevel`): sama perspektiivikamera (`PovCamera`),
  maisema, usva ja merkkien koot. Koodi, joka kysyy "perspektiivi vai
  kartta", käyttää `lakeLevel`-kutsua; `viewMode === 'pov'` tarkoittaa vain
  omin silmin piirrettäviä osia (oma vapa ja rengas edessä).
  - Takaa-näkymässä kamera kiertää kalastajaa yhtä kaarta (`ChaseOrbit`,
    `CHASE`): sivulle se kiertää pystyakselin ympäri, ylös se nousee ja
    loittonee. Kamera vain katsoo: liike ja heitto kulkevat kalastajan
    suuntaan, eikä palvelin tiedä kamerasta. Potkiessa sivukierto palaa selän
    taakse, korkeus jää.
  - Kameraa ohjataan nuolilla (`camLeft`…`camDown`), peliohjaimella LT/L2 +
    oikealla tatilla ja kosketuksella sormen vedolla järvellä
    (`Controls.cameraInput`). `setOrbitCamera` kertoo toimintokartalle, että
    takaa-näkymä on päällä: silloin nuolet eivät liikuta kalastajaa, sormi
    järvellä ei kelaa eikä heitä perhoa (napit toimivat), ja ohjetekstit
    jättävät nämä pois. Uusi sormen ele järvellä tai nuolinäppäimen käyttö
    tarkistaa saman tilan toimintokartasta eikä näkymästä.
  - Oikean tatin lukijat (heiton suunta, perhovapa, pikavalikko, nykäisy)
    käyttävät `Controls.aimStick`ia, joka on nolla, kun tatti kääntää kameraa.
- Peliohjaimen asetukset (#594, `engine/padSettings.ts`): kääntymisen
  herkkyys (`TurnPulse` jättää osan askelista väliin, koska käännös kulkee
  palvelimelle arvoina -1, 0 ja 1), perhoheiton tatti käänteisenä
  (`setFlyStickInverted` vaihtaa toimintojen napit ja ohjeet) ja kelaus
  kytkimenä (`ReelLatch`). Ohjeiden ohjainkuva (`ui/padDiagram.ts`) täytetään
  kartasta. Ohjaimen kytkeminen ja irtoaminen ilmoitetaan `info`-tasolla
  (`Input.onPadPresence`), ja yksinpeli menee tauolle ohjaimen irrotessa.
- Kosketusnapit painavat toimintoja (`controls.set` / `controls.tap`), eivät
  matki näppäimiä. Ei raakoja `KeyX`-tarkistuksia pelikoodissa eikä
  keksittyjä näppäinnimiä.
- Ohjetekstien `{toiminto}`-kohdat täytetään kartasta (`controlText`,
  `withKey`), joten näppäimen vaihto päivittää ohjeet, napit ja valikot
  kerralla. `{a|b}` on "a tai b" niistä, jotka ohjaustavalla on.
- Tilannenapit (iso nappi HEITÄ/KELAA/VETO, perhon SIIMA/NOSTA/KELALLE,
  KATKO/PERU) ratkaisee `contextActions`.
- Kisan ympyrävalikot (käsimerkit G, viehepakki R pohjassa, kalastustapa M)
  ovat yksi `ui/ringMenu.ts`. Uusi pikavalikko käyttää sitä ja pidon
  `game/heldMenu.ts`: valikko on auki napin ollessa pohjassa, ja irrotus
  valitsee osoitetun lohkon.

### Valo, sää ja välähdykset (PR #341, #409)

Koodi: `packages/client/src/game/skyView.ts`, `engine/retroRenderer.ts`.

- **Koko kuvan kirkkaus yhdestä sävytyksestä** (`SkyView.grade`):
  vuoden- ja vuorokaudenaika, pilvisyyden synkkyys ja salaman välähdys lasketaan
  samaan paletin jälkeiseen sävytykseen. Välähdyksen voimakkuus riippuu
  salaman etäisyydestä jatkuvana käyränä (`flashStrength`), ja aivan
  vieressä kuva kääntyy hetkeksi negatiiviksi (`grade.invert`). Salama
  itse on valonlähde kuten taivas (alfa 0): se ohittaa paletin, sävytyksen
  ja sumun.
- Älä lisää omia välähdyskerroksia (DOM-verhoja, valon kertoimia,
  pistevaloja) tai erillisiä tummennuksia. Valaistuksen himmennys rikkoo
  paletin: tummat vesisävyt kääntyvät vihreiksi.
- Pelaajan värit (rengas, räpylät, paita ja hattu) varjostetaan kolmella
  saman sävyn palettivärillä (`SHADE_RAMPS` `engine/palette.ts`:ssä,
  materiaali `game/playerColor.ts`). Uusi pelaajan valittava väri saa
  rampin, ja paletin uusi sävy tarkistetaan aamun, päivän, illan ja yön
  kuvista, ettei maisema pyöristy siihen (tumma turkoosi vei yöjärven).
- Usva ja kaukosumu ovat yksi kerros samalla värillä (`grade.mist`):
  usva kirjoittaa tiheytensä alfakanavaan (`game/mistView.ts`, ylhäältä vain
  veden päällä), ja kaukosumu lasketaan jälkikäsittelyssä syvyydestä
  (`grade.fog`). Three.js:n `scene.fog`ia ei käytetä.
- Taivasta tummentava säämuutos tulee ukkosrintamana tuulen yläpuolelta
  (`game/stormFront.ts`, #414): rintama on taivaankuvun pilvikerroksen osa
  (`uFront`), ja sen alla on jo seuraavan sään taivas. Sade ja synkkyys
  alkavat, kun reuna on kohdalla (`WeatherView.darkness`/`rain`). Ylhäältä
  ei piirretä pilvenvarjoja; koko kuva tummuu sävytyksestä. Rintama on vain
  näkymää: kalat ja palvelin käyttävät `weatherAt`-arvoja. Kaukaiset
  salamat rintaman alla ovat vain kuvaa ja ääntä (`strike(pos, true)`).
  Realistisella tekstivaroituksia ei näytetä.

### Ilme (#674, #650)

Koodi: `packages/client/src/engine/look.ts`, `engine/retroRenderer.ts`,
modernin ilmeen osat `engine/modernHost.ts` ja `src/modern/`.

- Asetusten Näyttö-osion valinta **Ilme: Retro / Terävä / Moderni** on laitteen
  asetus (`lunki.look`). Oletus on Terävä jokaisella laitteella, jolla ilmettä
  ei ole valittu (`defaultLook`); Retro jää valittavaksi. Terävä piirtää saman
  kohtauksen näytön tarkkuudella ilman palettia ja reunat pehmennettyinä;
  sisältö, säännöt ja HUD ovat samat. Uusi ilme on uusi arvo samaan valintaan.
- **Moderni (#650) on tietokoneen ilme:** maailma on tyyliä "Maalattu"
  (pehmeät muotoillut pinnat, varjot, sinivihreä vesi) ja käyttöliittymä
  "eräkartta" (paperi, muste ja korkeuskäyrät). Kosketuslaitteella sitä ei tarjota, eikä laatua karsita
  puhelimen takia. Säännöt, HUDin rakenne ja ohjaus ovat samat kuin muissa
  ilmeissä.
- **Modernin koodi, tyylit ja fontit ladataan vasta valittaessa**
  (`ModernHost`, `import('../modern/modernLook')`): kaikki, mitä vain Moderni
  tarvitsee (mallien rakentajat, varjot, teema), kuuluu kansioon `src/modern/`
  eikä pääkoodiin. Kerros liittyy pelin kohtaukseen `LookLayer`-rajapinnalla
  (`engine/lookLayer.ts`) eikä tiedä säännöistä. Lataus epäonnistuu
  aikarajaan, jolloin entinen ilme jää voimaan ja siitä kerrotaan; tallennettu
  Moderni aukeaa Retrona ja vaihtuu, kun lataus on valmis. Build vie tiedostot
  kansioon `modern/`, jota service worker ei tallenna asennuksessa
  (`optionalList`, [julkaisu.md](julkaisu.md)).
- **Laatu: Matala / Keskitaso / Korkea** (`lunki.look.quality`, taulukko
  `QUALITY`) näkyy vain Modernissa ja päättää piirron tarkkuuden
  (`lookDetail`: Korkea piirtää näyttöä tarkemmin ja selain pienentää kuvan)
  sekä varjokartan koon ja pehmeyden ja sen, kuinka kauas maiseman tarkat
  mallit piirretään (`detailRange`). Uusi laadusta riippuva asia on uusi
  kenttä taulukkoon, ei oma asetus. Monen näytteen puskuria (MSAA) ei käytetä:
  kohtauksen alfakanava on usvan tiheys, ja se sekoittuisi reunoilla.
- **Varjot** (`modern/shadows.ts`) tulevat pelin omasta auringon tai kuun
  valosta (`WeatherController`), ja varjokartta kulkee kameran mukana. Uusi
  valaistu osa saa varjot itsestään; veden päälle piirretty merkki tai
  tehoste lisätään `NO_CAST`-listaan nimellään. Kirkkaus tulee edelleen
  yhdestä sävytyksestä (`SkyView.grade`).
- **Modernin maisema** (`modern/scenery.ts`) rakennetaan samasta aineistosta
  kuin Retron (`StaticWorld`: kartta, ympäristö, `Ground`, `planVegetation`),
  joten puut, mökit, kaislat ja laiturit ovat samoilla paikoilla, eikä
  Modernille tehdä omaa karttaa. Se piirtää maan ja rantapenkan
  (`modern/land.ts`), puut (`trees.ts`), kaislat, rantaheinän ja kivet
  (`shoreDetail.ts`), mökit ja laiturit (`cottages.ts`) sekä pohjan kivet ja
  kasvit (`lakeBed.ts`), ja piilottaa Retron vastaavat osat. Maisema näkyy
  myös ylhäältä. Se rakennetaan kerran karttaa ja kautta kohden
  `StaticWorld.always`-ryhmään ja vapautetaan, kun ilme vaihtuu pois
  (`LookLayer.release`).
  - Muodot tehdään `modern/shapes.ts`:n osista (`blob`, `box`, `paint`,
    `mergeParts`, `scatter`) kärkiväreillä ja yhdellä pinnalla
    (`paintedMaterial`), ei tekstuureilla. Värit ovat kausittain taulukossa
    `SCENERY_COLORS` (`modern/sceneryColors.ts`).
  - Maan korkeus on `Land.heightAt`, ja peli lukee sen `Ground.surfaceAt`illa
    (`Ground.overlay`), jotta rannalla seisova kalastaja ja puiden tyvet ovat
    maan pinnalla. Rannan etäisyys kysytään `ShoreField`iltä.
  - Paljon toistuva osa piirretään lohkoittain (`scatter`) ja saa kevyemmät
    mallit kauemmas (`DetailLevels`, matkat `QUALITY.detailRange`ista). Uusi
    maiseman osa tekee samoin eikä piirrä koko järven tarkkoja malleja
    kerralla.
- **Kalastaja, kulkupelit ja varusteet ovat Modernissa pelin omia malleja
  pehmennettyinä** (`modern/soften.ts`, `modern/gear.ts`), eikä niille tehdä
  rinnakkaisia malleja: liike, värit ja säännöt ovat pelin.
  - `Softener` vaihtaa jokaisen valaistun perusmuodon (laatikko, pallo, lieriö,
    rengas) pyöristettyyn versioon samassa paikassa. Uusi samalla tavalla
    tehty osa pehmenee itsestään. Neli- ja kolmikulmainen lieriö, kuvallinen
    pinta ja kärki kerrallaan muokattu muoto jäävät ennalleen.
  - Osa, johon pyöristys ei riitä, saa pelissä nimen `userData.shape`, ja
    Modernin malli sille on taulukossa `SHAPES` (räpylä, `gearShapes.ts`).
  - Jos peli muokkaa osan kärkiä itse (täyttökisan lässähtävä ponttooni,
    `shoreView.ts`), se antaa lepomuodon `geometry.userData.rest`issä ja
    sovittaa vaihdetun muodon `userData.reshape`-kutsussa. Jos peli kallistaa
    normaaleja paletin takia (vene, `liftNormals`), oikeat normaalit ovat
    `geometry.userData.normals`issa ja Moderni valaisee niillä.
  - `Gear` lisää nimettyihin osiin sen, mitä muissa ilmeissä ei ole:
    ponttoonien tummat päälliset (`tube`, `pov-pontoon`), selkänojan (`seat`),
    kalastajan silmin vapaa pitävän käden ja kahvan (`pov-reel`) ja
    verkkotason kudoksen (`pov-net`). Kalastajan silmin tasaväriset osat (veden
    alla näkyvät sääret ja räpylät `pov-wet`, kela) se vaihtaa valaistuiksi.
    Uusi lisäosa on uusi sovitus `Gear`iin ja muoto `gearShapes.ts`:ään, ja
    kaikki palautetaan, kun ilme vaihtuu.
  - Pelaajan värit (`playerColorMaterial`) varjostuvat Modernissa liukuvasti
    (`uLookModern`), eivät kolmella palettisävyllä.
- **Eläimet ja veden pinnan merkit ovat Modernissa malleja pelin kuvien
  paikalla.** Peli piirtää ne edelleen itse (pikselikuva tai rengas) ja kertoo
  kuvan `userData`ssa, mitä se esittää; Moderni piirtää tilalle mallin samaan
  paikkaan ja kokoon joka ruudulla, joten liike, koko ja säännöt ovat pelin.
  - Linnut (`modern/birds.ts`, ryhmä `birds`): kuva kertoo asennon
    (`userData.bird`, `userData.grow`). Mallit ovat `modern/birdShapes.ts`:n
    taulukossa `BIRDS` (mitat ja värit lajeittain, uiva ja lentävä muoto,
    siivet lyövät asennon `flap`-vaiheen mukaan). Uusi laji on rivi siihen.
  - Nostettava kala ja haavi (`modern/landing.ts`, ryhmä `landing`): kuva
    kertoo lajin ja asennon (`userData.fish`). Kalan malli (`fishShape`)
    lasketaan samoista lajin tiedoista kuin pikselikuva (`fishLook`,
    `fishOutline`, `ui/fishArt.ts`), joten uusi laji tai muutettu muoto näkyy
    molemmissa. Haavi (`landing-net`) saa kehän, pussin ja varren.
  - Roiskerenkaat (`splash-rings`, `userData.shape = 'ripple'`) ovat väreitä,
    jotka haalistuvat renkaan iän (`userData.life`) mukana, ja vieheen merkki
    (`lure-marker`) on hiottu timantti tilan värissä (`modern/marks.ts`).
    Läpikuultava merkki ei kirjoita alfakanavaan (usvan tiheys). Tasaväriset
    renkaat ja ympyrät (tähtäin, oman paikan merkki) pyöristää `Softener`.
- **Sääilmiöt ovat Modernissa pelin omia osia pehmeinä**
  (`modern/weatherLook.ts`). Peli piirtää sateen, salaman, trombin ja ison
  aallon edelleen itse ja nimeää osansa; Moderni piilottaa pelin pinnan
  (`material.visible`, jolloin pelin oma näkyvyys kertoo yhä välkkeen ja
  sateen määrän) ja piirtää tilalle omansa samaan paikkaan. Paikka, ajoitus,
  välke ja säännöt ovat pelin. Uusi sääilmiö nimeää osansa ja saa oman
  luokkansa `WeatherLook`iin.
  - Sade (`rain`, `modern/rain.ts`): pisarat ovat alaspäin kirkastuvia juovia,
    ja pintaan pudonnut pisara jättää veteen pienen renkaan.
  - Salama (`lightning`: `bolt`, `bolt-halo`, `bolt-glow`, `bolt-ring`,
    `modern/bolts.ts`): ohut valkoinen ydin, sen ympärillä sinertävä hehku,
    iskukohdassa pehmeä valopallo ja shokkiaaltona kaksi ohutta rengasta, jotka
    haalistuvat renkaan iän (`userData.life`) mukana. Kaukainen salama
    (`userData.far`) hehkuu heikommin. Koko kuvan välähdys tulee edelleen
    sävytyksestä.
  - Trombi (`spouts`: `spout-funnel`, `spout-spray`, `spout-streaks`,
    `modern/spouts.ts`): sileä, kiertyvä pilvipatsas ja juurella roiskekumpu;
    ylhäältä himmeä pyörre, joka ei peitä järveä. Mitat ovat pelin
    (`SPOUT_FUNNEL`).
  - Iso aalto (`bigWave-crest`, `modern/swells.ts`): vaahtopätkien tilalla
    vyöryy maininki, jonka laella on katkonainen vaahto (`BIG_WAVE_CREST`).
    Pinta on valaisematon kuten järvi. Vaahtopäät ja lähiveden harjan vaahto
    ovat vesivarjostimen Modernin haara (`world/lakeMesh.ts`): pehmeitä
    laikkuja viivojen tilalla.
  - **Läpikuultava pinta käyttää `modern/veil.ts`:n sekoituksia**, koska
    kohtauksen alfakanava on viesti jälkikäsittelylle (0 = valonlähde, muuten
    usvan tiheys) ja kaukosumu lasketaan syvyydestä: `VEIL` (läpikuultava) ja
    `GLOW` (hehku) eivät kirjoita alfaan eivätkä syvyyteen, `LIGHT` on
    valonlähde kuten taivas (alfa 0). Taivasta vasten näkyvän läpikuultavan
    muodon tiheä osa leimataan `STAMP`illa (alfa täyteen ja syvyys), muuten se
    jää sävyttämättä ja saa taivaan etäisyyden sumun. Älä käytä three.js:n
    tavallista läpinäkyvyyttä (`transparent: true` yksinään) Modernin osissa.
  - Usva, kaukosumu, vuodenajat, yö, kuu ja revontulet tulevat Moderniin
    pelin omista järjestelmistä (`MistView`, `SkyView.grade`, `SEASON_LOOKS`,
    `SCENERY_COLORS`) ilman omaa versiota. Hämärällä osassa mökkien ikkunoista
    palaa valo (`WindowLights` `modern/cottages.ts`:ssä, raja ja osuus
    `WINDOW_LIGHTS`): peli kertoo päivänvalon määrän `scene.userData.daylight`issa,
    ja valaistu lasi on valonlähde (alfa 0), joka ei valaise ympäristöään.
- **Modernin teema** (`modern/theme.css`) vaihtaa käyttöliittymän värit
  `style.css`:n `--c-`-muuttujilla ja kirjasimet luokan `.look-modern` alla.
  Uusi valikon tai HUDin osa käyttää näitä muuttujia eikä kirjoita värejä
  itse, jolloin se saa teeman ilman omaa sääntöä. Teema asettaa myös pelin
  fontin (`--font`) tekstifontikseen, ja ympyrävalikot ovat paperilohkoja
  musteen värisessä kehässä.
- **Sisäinen tarkkuus on kummassakin ilmeessä sama** (`RetroRenderer.resolution`):
  kamerat, zoomitasot, merkkien koot ja HUDin mitta lasketaan siitä, joten
  näkyvä alue ei riipu ilmeestä. Terävä piirtää jokaisen sisäisen pikselin
  `scale` × `scale` kuvapisteenä (`renderSize`). Älä laske mitään näkymän
  osaa piirron tarkkuudesta.
- Ilmeestä riippuva varjostin lukee `LOOK_UNIFORMS`-arvot (`uLookSharp`,
  `uLookDetail`, `uLookModern`) eikä tee omaa kopiota materiaalista:
  esimerkkeinä pohjan syvyyssävyt (`world/depthShade.ts`, Terävällä omat
  sävyt, koska paletti ei pyöristä vihertävää siniseksi) ja kimalluksen rivit
  (`gl_FragCoord` jaetaan `uLookDetail`illa). `uLookSharp` on 1 myös
  Modernissa; `smoothLook(look)` kertoo saman koodille. Modernin vesi on
  saman vesivarjostimen haara (`world/lakeMesh.ts`): tasainen sinivihreä pinta
  ilman viivakuviota, väreet kulkevat vain tuulen mukana (`uDrift`), syvyyden
  sävy liukuu portaitta ja ylhäältä näkyvät syvyyskäyrät (`MODERN_DEPTH`).
  Sama väri on ylhäältä ja kalastajan silmin.
- Sävytys, usva ja kaukosumu tulevat Terävälläkin samasta sävytyksestä
  (`SkyView.grade`); reunanpehmennys tehdään valmiille kuvalle sen jälkeen.
  Viivat (siima, vapa, tähtäin, sade) piirretään Terävällä sisäisen pikselin
  levyisiksi (`thickenLines`), joten uusi viiva ei tarvitse omaa paksunnosta.
- **Pikselikuvista on Terävälle sileät versiot samasta piirroksesta**
  (`engine/smoothPixels.ts`): kuva piirretään kerran pikseleinä, ja Terävä
  tekee siitä nelinkertaisen tarkkuuden version, jossa portaat ovat sileitä
  eikä värejä sekoiteta. Järven kuvat (`pixelTexture`: linnut, vieheen
  merkki, nostettava kala) ja käyttöliittymän kuvat (`ui/lookArt.ts`:
  `paintPixels`, `lookArt`; kalat, vieheet, käsimerkit, palkinnot ja
  kulkupelin esikatselu) vaihtuvat ilmeen mukana itsestään
  (`activeLook`, `onLookChange`). Uusi pikselikuva käyttää näitä eikä piirrä
  omaa kangasta tai tekstuuria, eikä Terävälle tehdä rinnakkaista taidetta.
  Laskemalla piirretty kuva (vieheen timantti, `diamondPixels`) voi antaa
  `pixelTexture`lle saman muodon suoraan tarkempana. Maiseman tekstuurit
  (puiden lehvästö) ovat kummassakin ilmeessä samat.
- **Modernissa laskemalla piirretty käyttöliittymän kuva piirretään suoraan
  tarkkana.** Vieheiden ja kalojen kuvat (`lurePixels`, `fishPixels`) ovat
  muotofunktioita, joten ne antavat `paintPixels(canvas, px, fine)`-kutsulle
  saman kuvan nelinkertaisella tarkkuudella (`detail`): muoto, kuviot ja
  värit ovat samat, mutta reunat ovat sileitä ja ääriviiva ohuempi
  (`fineOutline`, `outlinePixels`). Käsin pikseleinä piirretyt kuvat
  (käsimerkit, palkinnot) jäävät sileiksi versioiksi kuten Terävällä. Uusi
  laskettu kuva antaa tarkan version samasta funktiosta, ei toista piirrosta.
- **Fontti vaihtuu ilmeen mukana** CSS-muuttujalla `--font`: Retrossa VT323,
  Terävällä Lunki Silea, joka on sama fontti portaat sileiksi pehmennettynä
  (`scripts/fontti/sileafontti.py`, `src/assets/lunki-silea.woff2`). Merkkien
  leveydet ovat samat, joten asettelu ei muutu. Uusi tyyli käyttää
  `font-family: var(--font)` ja kankaalle piirrettävä teksti `uiFont(px)`
  (`ui/lookArt.ts`), ei fontin nimeä. Modernissa kumpikin on teeman
  tekstifontti (`MODERN_FONT`), joka on leveämpi: kankaan teksti piirretään
  siksi hieman pienempänä, ja uusi tekstirivi mitoitetaan niin, että se
  mahtuu myös sillä.
- **HUDin pienet näytöt** (kaikuluotain, vieheluotain, perhoheiton sivukuva)
  ottavat piirtopintansa `panelContext`illa (`ui/sonarArt.ts`): mitat ovat
  aina sisäisiä pikseleitä, ja Terävällä kankaassa on neljä kuvapistettä
  pikseliä kohden. Terävän kuva piirretään muotoina samoista tiedoista
  (pohja kaarena, kasvit varsina, kivet kumpuina, kalat kaarina); uusi
  rakenne tai näyttö käyttää näitä eikä omaa kangaskokoa. Värit kysytään
  `sonarColors()`-kutsulla: Modernissa vesi on järven sinivihreää, kaiut ja
  pohjan lajit ovat samat. Punnituskortti ja
  järvikartta tekevät Terävälle sileän version samasta piirroksesta
  (`smoothPixels`).
- Modernissa `LookGuard` keventää ensin laatua taso kerrallaan
  (`lowerQuality`) ja palaa Retroon vasta matalalta.
- Terävä on raskas: jos kisan ruutunopeus jää alle 30 (`LookGuard`), ilme
  palaa Retroon, valinta tallennetaan ja siitä kerrotaan `info`-ilmoituksella.
  Selaintestit ajetaan Retrolla: automaation ohjaama selain
  (`navigator.webdriver`) saa oletukseksi Retron, ja `e2e/ilme.spec.ts`
  vaihtaa ilmeen ja aloittaa kisan.

### Vuodenaika (#427)

Koodi: `packages/shared/src/weather/season.ts`, asiakkaalla
`game/skyView.ts` (`SEASON_LOOKS`) ja `world/seasonColors.ts`.

- Kisan kausi on asetus `season` (Kevät 5.5., Kesä 1.7., Syksy 1.10.;
  Talvi näkyy valikossa pois käytöstä pilkkikauteen #140 asti). `SEASONS`
  päättää kisapäivän auringon radan, vuorokaudenaikojen alkamisajat ja veden
  lämmön, ja `seasonOf(settings)` antaa kauden (puuttuva on kesä).
- Kauden ilme tulee samoista järjestelmistä kuin muukin: taivas ja valo
  `SEASON_LOOKS`-hetkistä yhteen sävytykseen, maiseman värit
  `SEASON_COLORS`-taulukosta. Jaettu maailma
  (`staticWorldFor(map, season)`) rakennetaan kerran kautta kohden.
- Revontulet ovat taivaankuvun osa (`uAurora`): `auroraFor(seed, season)`
  arpoo ne kisan siemenestä keväälle ja syksylle (`AURORA`), ja ne näkyvät
  tähtien tavoin vain pimeällä ja kirkkaalla taivaalla.
- Kuun vaihe arvotaan samoin siemenestä (`moonPhaseFor`), ja `moonAt`
  laskee kuun paikan vaiheen mukaan. Vajaa kuu hehkuu ja kimaltaa vähemmän
  (`moonIllumination`). Tähtitaivas kiertyy taivaannavan ympäri pelikellon
  mukana (`starTurn`).
- Uusi kaudesta riippuva asia lukee kauden näistä eikä tee omia
  päivämäärätarkistuksia.

### Vesi (PR #339)

Koodi: `packages/client/src/world/lakeMesh.ts`.

- Vesi on tyynellä säällä lähes paikallaan ja liikkuu vain tuulen mukana
  (`uDrift`). Pintakuvio, mainingit, vaahtopäät, iso aalto ja trombin
  vaahtojuovat käyttävät samaa viivatyyliä ja samoja vaaleaa ja tummaa
  sävyä.
- Kuiva tila veden keskellä (veneen sisäpuoli) saa näkymättömän kannen
  `swellMask`-kutsulla: aaltoileva lähivesi piirretään sen jälkeen eikä näy
  pohjan läpi (#682). Älä nosta pohjaa tai litistä aaltoja aluksen kohdalta.
- Uusi vesiefekti tehdään samalla viivatyylillä ja vain, jos se ei lisää
  levotonta liikettä. Hyväksytä ennen/jälkeen-kuvat tai GIFit ennen
  yhdistämistä.

### Asetukset ja valikot (PR #342)

Koodi: `packages/client/src/ui/screens.ts` (`showSettings`, `showPause`).

- **Pelaajan asetukset vain jaetussa Asetukset-näkymässä**
  (`Screens.showSettings`): Näyttö (HUD-koko, näkökenttä, ilme ja Modernin laatu, opastus), Ohjaus
  (ohjaustapa, #638), Äänet,
  Peliohjain (näkyy, kun ohjain on kytketty; myös värinä, #594) ja Kieli.
  Sama näkymä aukeaa päävalikosta ja taukovalikosta.
- Päävalikko on lyhyt: Pelaa (alavalikossa Yksinpeli ja Moninpeli),
  Varusteet, Järvikartta, Ennätykset, Ohjeet, Asetukset ja Tietoa ja palaute
  (alavalikossa Palaute sekä Tekijät ja lähteet). Uusi kohta menee
  alavalikkoon, ei päävalikon jatkoksi.
- Taukovalikko on lyhyt: Jatka, Varusteet, Asetukset, Ohjeet, Palaute,
  Lopeta kisa. Matalalla ruudulla (puhelin vaakana) napit ovat kahdessa
  sarakkeessa. Palaute on sama lomake ja jono kuin päävalikossa.
  Kisan tilanteen alla näkyvät kisan säännöt vain luettavina (`pauseRules`:
  vaikeus, sää, kausi, voittaja ja kesto); niitä ei vaihdeta kesken kisan.
  Kosketuksella tilanteen alla on koko tulostaulu (`pauseScoreboard`), koska
  se ei ole puhelimen HUDissa.
- Koko näyttö on pieni kuvake paneelin oikeassa yläkulmassa
  (`fullscreenButton`, `ui/fullscreen.ts`) päävalikossa ja tauolla, ei oma
  rivinsä valikossa.
- **Ohjeet** (`Screens.showManual`, sisältö `ui/manual.ts`, #401) kertovat
  mekaniikat osioittain päävalikosta ja tauolta. Ensimmäisenä aukeaa Alkuun-osio,
  joka vie ensikertalaisen samaa polkua kuin opastus (`game/guide.ts`): yksi
  nappi heittää, kelaa, iskee ja nostaa. Ohjaus täytetään
  `CONTROLS`-kartasta ja vaikeustason luvut `DIFFICULTIES`-taulukosta. Kun
  mekaniikka muuttuu, päivitä sen kuvaus samassa PR:ssä.
- Varusteet laitetaan kuntoon vain päävalikon Varusteet-näkymässä (#383).
  Yksinpelin asetuksissa ja aulassa ne näkyvät vain yhteenvetona, ja kisassa
  vieheet vaihdetaan viehepakin pikavalikosta (R) ja kalastustapa omasta
  pikavalikostaan (M). Taukovalikon Varusteet (`showPauseTackle`) vaihtaa
  kesken kisan siiman ja perukkeen (virvelin siima ja teräsperuke, perhosiima ja perhon peruke); vapa vaihdetaan vain päävalikossa. Värit ovat omana
  alanäkymänään yksinpelin asetusten ja aulan yhteenvetoriviltä.
- Aulassa voi harjoitella odottaessa (#638, `startPractice` `main.ts`:ssä):
  harjoitus on yksinpeli huoneen säännöillä ilman kelloa ja ennätyksiä, ja
  se vaihtuu kisaan, kun isäntä aloittaa. Huonetta käyttävä koodi kysyy
  kisan huoneen `raceSession()`-kutsulla, joka on harjoitellessa null.
  Harjoittelun taukovalikko (#668) on otsikolla Harjoittelu, ja kisan
  tilanteen paikalla on aulan tilanne (`pausePractice`: aulassa, valmiina,
  harjoiteltu) ja tulevan kisan säännöt; ne päivittyvät paikallaan
  (`updatePausePractice`).
- Kisan säännöt (kesto, sää, rangaistukset, lajit) kuuluvat yksinpelin
  asetuksiin ja moninpelin aulaan, eivät Asetukset-näkymään.

### Palvelin voi olla pois päältä (PR #320, #344)

Pelikone on usein kiinni. Vain moninpeli saa vaatia palvelimen.

- Jokaisella palvelinta tarvitsevalla toiminnolla on aikaraja ja toimiva
  vaihtoehto ilman palvelinta. Esimerkkejä: palaute jonoon
  (`lunki.feedback.pending`), yksinpelin saaliit jonoon ja ennätyslistalle
  myöhemmin (`net/soloQueue.ts`, `lunki.solo.pending`).
- Uusi palvelinta käyttävä toiminto saa tapauksen testiin
  `e2e/palvelin-pois.spec.ts`.
- Service worker (`src/sw/`) pitää pelin koodin laitteella, joten
  yksinpeli toimii ilman nettiä, ks. [julkaisu.md](julkaisu.md).

### Omat tiedot ja nimimerkki (#415)

Koodi: `packages/client/src/net/identity.ts`.

- Kirjautumista ei ole. Pelaajan omat tiedot (tilastot, saalispäiväkirja,
  varusteet, viehepakki, värit, kulkupeli) tallennetaan laitteelle
  nimimerkin profiiliin avaimella `profileKey('…')`. Nimimerkki asetetaan
  Pelaa-alavalikossa; uusi nimi aloittaa alusta, ja vanha tuo tiedot
  takaisin. Laitteen asetukset (HUD, äänet, kieli) eivät ole profiilissa.
- Uusi omaa edistymistä tallentava tieto lisätään `PROFILE_DATA`-listaan
  eikä omalle `lunki.`-avaimelle.
- Saalispäiväkirja (`game/journal.ts`) kirjaa omat saaliit vieheineen ja
  oloineen; viehepakki näyttää siitä saaliit ja parhaat olot.

### Pelin rakenne (#371)

Koodi: `packages/client/src/game/game.ts` ja sen osat.

- `Game` kokoaa kisan ja kutsuu osia järjestyksessä:
  - `WeatherController`: sää, valo, vesi, salamat, isot aallot ja trombit.
  - `CraftController`: rengas, vene, soutu, ankkuri ja paikanvaihto.
  - `FishingController`: heitto, kelaus, perho, tapahtumat ja saalis.
  - `HudPresenter`: mittarit, tilanneohje, tilarivi, luotaimet ja kello.
  - `NetBridge`: moninpelin viestit, muut pelaajat ja katsoja (ohjaaja
    `game/director.ts`, #564).
  - `Penalties`: jäähyt, kumossaolo ja niiden selitys.
- Uusi toiminto kuuluu siihen osaan, jota se koskee. Osat näkevät pelistä
  vain oman `…Host`-rajapintansa.
- Moninpelin erot ovat `NetBridge`-luokassa eivätkä `if (net)`-haaroina
  muualla, kun se on mahdollista.

### Bottipelaajat (#624)

Koodi: `packages/shared/src/bots/botAngler.ts`, palvelimella
`LunkiRoom` (`syncBots`, `stepBots`).

- Botti on `BotAngler`: se tuottaa samat syötteet kuin pelaaja (potkut ja
  `FishingInput`) ja kalastaa samalla `stepFishing`-koodilla omasta
  kalakannan kopiostaan. Botille ei tehdä omia oikoteitä sääntöihin: sen
  saalis kulkee saman tarkistuksen (`landCatch`) läpi kuin pelaajan.
- Moninpelissä botit ovat palvelimen pelaajia tunnisteella `bot:N`
  (`isBotId`). `PlayerState` on kenttärajalla, joten botin taito lasketaan
  tunnisteesta ja asetuksesta (`botSkillFor`), ei omasta kentästä.
- Botit ovat kisan sääntö (`settings.bots`, `settings.botLevel`) aulassa,
  eivät Asetukset-näkymässä. Ne täyttävät tyhjät paikat ja väistyvät
  liittyvän pelaajan tieltä. Botit eivät mene ennätyslistalle eivätkä
  pumppaa täyttökisassa.
- Yksinpelissä botit laskee selain (`game/soloBots.ts`, asetus
  `settings.soloBots` yksinpelin asetuksissa), koska yksinpeli toimii ilman
  palvelinta. Ne piirretään kuten muut pelaajat (`RemotePlayersView`), ja
  tulossivu on sama kuin moninpelissä (`showRaceResults`). Törmäykset ja
  siimasotkut lasketaan samoilla säännöillä kuin palvelimella
  (`collideTubes`, sotkujen kirjanpito `TangleBook` `net/tangle.ts`:ssä), ja
  oman sotkun ilmoitukset ovat yhteiset moninpelin kanssa
  (`game/tangleNotices.ts`).
- Taidot (`BOT_SKILL`) eroavat paikan valinnassa, tähtäyksessä ja kalan
  väsytyksessä. Uusi käytös on uusi kenttä taulukkoon, ja saalistahti
  tarkistetaan `botAngler.test.ts`:n simulaatiolla.

### Äänet (#371)

Koodi: `packages/client/src/audio/sounds.ts`.

- **Pelin tapahtumien äänet vain äänikartan `SOUNDS` kautta**
  (`sounds.play('escaped')`): kartta päättää tehosteen ja kalastajan
  repliikin. Peli ei kutsu `Sfx`-tehosteita suoraan.
- Muiden pelaajien tapahtumat soivat samoilla äänillä etäisyyden mukaan
  hiljempaa ja tummempina (`sounds.playAt`, kantama `EFFECT_RANGE`), ja muiden
  puhe kuuluu käsimerkeistä (`voiceAt`). Molemmat kuuluvat suunnastaan
  kuulijasta (`effectPan`, `Game.listener`: ruudun oikea laita ylhäältä,
  kalastajan oikea käsi POV:ssa).
- Omat tehosteet kuuluvat keskeltä. Sää kuuluu suunnastaan
  (`sounds.playFrom`: salama, iso aalto, trombi), samoin trombin pauhu ja
  kuikat; tuuli ja sade ympäröivät kuulijan.
- Miksaus on `audio/mix.ts`:ssä (#411): väylien voimakkuudet `MIX` ja väistö
  `DUCKS`. Tärkeä ääni (repliikki, isku, lähisalama) hiljentää ympäristöä ja
  musiikkia hetkeksi väylän perässä olevalla `GainNode`illa, ei
  kompressorilla. Uusi väistävä tapahtuma saa äänikarttaan `duck`-kentän.
- Onnistumisista kalastaja iloitsee: oma lajiennätys (`recordCatch`), kala
  pitkän odotuksen jälkeen (`reliefCatch`) ja kisan suurin (`raceBestCatch`)
  ratkaistaan `game/catchJoy.ts`:ssä päiväkirjasta ja kisan saaliista.
  Niissä kuuluu pelkkä repliikki; sävelmä (`fallback`) soi vain, kun
  repliikit ovat pois päältä, koska se peittäisi puheen.
- Peliohjaimen värinä (#592, `engine/rumble.ts`) lähtee samasta kartasta:
  rivin `rumble`-kenttä värähtää omassa tapahtumassa (`RUMBLES`), ja kiinni
  olevan kalan veto tulee `sounds.pull(kuorma)`-kutsusta. Peli ei kutsu
  `playEffect`ia itse. Värinä toimii vain, kun pelaaja käyttää ohjainta ja
  selain tukee sitä (Chrome, Edge); asetus on Asetusten Peliohjain-osiossa.
- Sää, linnut ja ukkonen kuuluvat vain kisassa (myös tauolla): ne kulkevat
  kisan äänten portin läpi (`Sfx.setRaceAudio`), jonka pääsilmukka avaa kisan
  ajaksi. Päävalikossa, aulassa ja tulossivulla soi vain musiikki ja nappien
  äänet. Uusi jatkuva tai viiveellä soiva kisan ääni kytketään samaan porttiin.
- Uusi ääni on uusi rivi karttaan. Väylät (tehosteet, ympäristö, musiikki,
  puhe, ukkonen) ovat `Sfx`-luokassa ja niiden voimakkuudet `MIX`-taulukossa.

### Vaikeustaso ja avut (#391)

- Ohjaustapa (#638, `game/controlStyle.ts`) on eri asia kuin vaikeustaso:
  Asetusten Ohjaus-osion valinta Yksinkertainen tai Täysi on pelaajan oma ja
  toimii kaikilla tasoilla. Yksinkertaisella yksi nappi heittää ja kelaa,
  kelaus nostaa kalan (täydellä nosto on oma painalluksensa, #395) ja
  tartuttaa myös ison kalan, kelausnopeus on 3, vieheenä on aina lippa,
  jarrua ei säädetä, perhoa ei ole ja ohje on aina lyhyt. HUD on riisuttu
  (#653, #657): tilapaneelia ja kireysmittaria ei ole (`Hud.setSimple`), luotain on kosketuksella oikeassa yläkulmassa (pystyssä sää rivittyy sen vasemmalle puolelle, #671), ilmoitukset nousevat POV:ssa heti sen alle, ja kosketuksella näkyvät vain tatti, iso
  nappi, tauko ja sen alla KAM (`TouchControls.setSimple`; zoom vain ylhäältä, KATKO
  vain kun viehe on jumissa tai siima sotkussa). Opastuksen rivit jättävät
  piilotetut napit pois (`HudPresenter.guideText`).
  Se ei muuta kalojen käytöstä eikä kisan sääntöjä, joten ennätyslistat ovat
  yhteiset. Uusi mekaniikka, jota ensikertalainen ei tarvitse, jätetään pois
  `simpleControls()`-kutsun mukaan eikä uudella vaikeustasolla. Oletustaso
  on Helppo.
- Uuden pelaajan oletukset ovat helpoimmat: ohjaustapa Yksinkertainen
  (`defaultStyle`; laite, jolla on jo saatu kala tai ohitettu opastus, jatkaa
  täydellä), taso Helppo ja kieli suomi selaimen kielestä riippumatta
  (`detectLang`; englannin saa päävalikosta ja Asetuksista). Tallennettua
  valintaa oletus ei muuta. Selaintestit valitsevat täyden ohjauksen
  (`fullControls`, `e2e/apu.ts`).
- Kalastuksen vaikeustaso (`settings.difficulty`) päättää myös näkyvät
  avut: helpolla saa olla pelimäisiä apuja, realistisella vain se, minkä
  oikeakin kalastaja näkee.
- Vieheen merkki järvellä on `game/lureMarker.ts`: tilan värinen
  pikselitimantti kaikilla tasoilla (Luuka testasi vesirajan ja vieheen
  kuvan, ja valitsi timantin). Sama merkki piirtää muiden pelaajien vieheet.
- Tärppi näkyy merkissä kaikilla tasoilla (#440): timantti nykii siiman
  nykäysten tahdissa (`strikeTug`, silmin pinnan alle), ja jokainen nykäys
  nostaa renkaan (`STRIKE_SIGNS` `fishingView.ts`:ssä, ylhäältä
  kuvapisteinä). Näin ylhäältä voi kalastaa ilman luotaimia.
- Avut ovat tasoittain: kalan merkit (`FISH_SIGNS.difficulty`),
  vieheen pyörteet (`LURE_MARKER.signs`) ja perhoheiton merkki
  (`DIFFICULTIES[…].flyCast.marker`). Uusi apu lisätään näiden rinnalle eikä
  omaksi asetuksekseen.
- Linnut ovat näkymää (`game/birdsView.ts`, #571, #572). Kalaa pyytävät
  linnut (`game/fishBirds.ts`: lokit ja tiirat syövän ahvenparven päällä,
  kalasääski pintaveden kalan perässä) lukevat kalakantaa ja syöntijaksoja
  kuten kalojen merkit, eivätkä arvo mitään kalakantaan. Ne näkyvät kaikilla
  tasoilla, koska oikeakin kalastaja näkee ne; `FISH_BIRDS` päättää määrät
  tasoittain. Vesilinnut (`game/waterfowl.ts`) arvotaan kisan siemenestä
  kausittain ja väistävät kulkupelejä. Uusi lintu on uusi rivi näihin
  taulukoihin, kuva `game/birdArt.ts`:iin ja Modernin malli
  `modern/birdShapes.ts`:ään, ei oma järjestelmä.
- Pikselikuvat järvellä tehdään `game/pixelSprite.ts`:n tekstuureina
  (`alphaTest`, ei puoliläpinäkyvyyttä).

### Tekstit ja nimet

- Pelaajan näkemät tekstit vain sanakirjoissa `packages/client/src/i18n/`
  (`fi.ts` lähdekieli, `en.ts` käännös). Palvelin lähettää virhekoodeja.
- Pelaajalle näkyvä nimi on **Lunkinjärvi**. Koodi, repositorio, paketit ja
  huonekoodit (`LUNKI-4F7K`) käyttävät nimeä `lunki`.
- Kelluntarengas on U-muotoinen (edestä avoin), ei pyöreä rengas.
  Grafiikassa, kuvakkeissa ja logoissa sitä ei piirretä renkaaksi.

### Pelin fysiikka ja säännöt

Fysiikka, sää, kalakanta ja säännöt ovat `packages/shared`-paketissa, ja
asiakas ja palvelin laskevat ne samalla koodilla samasta siemenestä
([moninpeli.md](moninpeli.md), [saa.md](saa.md)). Kalakannan arvontaan
(`createFishPopulation`, `spawnFish`) ei lisätä satunnaislukukutsuja, ja uudet
lajit lisätään `SPECIES`-listan loppuun: muuten samalla siemenellä saadaan eri
kalat kuin vanhalla palvelimella. `fish.test.ts` vartioi tätä sormenjäljellä.
Vaikeustasojen saalismäärät tarkistetaan simulaatiolla `naiveAngler.test.ts`.

## Selaintestit (e2e)

CI ajaa selaintestit ohjelmistorenderöinnillä (SwiftShader, Mesa), joten
kuvat piirtyvät hitaasti ja kone voi olla kuormitettu. Testin pitää kestää
se ilman uusintaa; `retries: 1` on vain varaverkko, ja uusinnalla läpi
mennyt testi (`flaky` CI:n lokissa) on vika, joka korjataan.

- **Kisa kiinteällä siemenellä.** `startSolo` ja `soloUrl()`
  (`e2e/apu.ts`) lisäävät osoitteeseen `?seed=8`: aloituspaikka ja sää ovat
  joka kerta samat (tyyntä 18 minuuttia, avovettä selän takana). Ilman
  siementä tuulivaroitus voi peittää testin odottaman ilmoituksen, koska
  tärkeämpi ilmoitus vie vähemmän tärkeän paikan.
- **Kanvaasin kuva luetaan sivulla** (`canvasColors`), ei
  ruutukaappauksella: Chromiumin kaappaus WebGL-kuvasta kestää CI:ssä
  5–25 s.
- **Odota tilaa, älä aikaa.** Ei kiinteitä viiveitä (`waitForTimeout`)
  tilan odottamiseen; käytä `expect.poll`- ja `toHaveText`-odotuksia.
  Hidastettu verkko pidetään auki lupauksella, kunnes tarkistus on tehty.
  Hetken näkyvään tilaan reagoidaan sivulla (MutationObserver), ks. perhon
  rytmiheitto `peli.spec.ts`:ssä.
- **Palvelin on yhteinen.** Kaikki projektit, toistot ja uusinnat käyttävät
  samaa pelipalvelinta. Testin oma ennätys tehdään painavammaksi kuin listan
  kärki (`topWeight`), ettei se putoa viiden kalan listalta.
- **Modernin maisema on ohjelmistorenderöinnille liian raskas.** Koko järven
  maisema (päävalikon tausta) tai rannan puut vievät yli puoli sekuntia
  ruutua kohden, ja selain jää purkamaan piirtojonoa kymmeniksi sekunneiksi.
  Modernia käyttävä testi valitsee ilmeen kisan taukovalikosta keskeltä selkää
  (`OPEN_WATER`, `e2e/ilme.spec.ts`) eikä jää päävalikkoon Moderni päällä.
- **Raskaat testit erikseen.** Moninpelitestit avaavat useita selaimia, joten
  ne ovat oma Playwright-projektinsa `moninpeli` ja oma CI-ajonsa
  (`MULTIPLAYER` tiedostossa `playwright.config.ts`).
