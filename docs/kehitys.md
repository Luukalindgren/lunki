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
  Alimpana tasona on opastus ensimmäiseen kalaan (`game/guide.ts`, #370):
  uusi opastettava asia on uusi askel sen tilakoneeseen, ei oma ohjeruutu.
- **Rangaistukset `Hud.setPenalties(rows, note)`** ajastimen alle (jäähy,
  kaatuminen, salama, maalle heitto), ei erillistä korttia.
- **Asettelu kiinteissä vyöhykkeissä.** Ylhäällä keskellä olevat osat ovat
  ruudun keskilinjalla, vasemman reunan laatikot alkavat `--edge-l`:stä ja
  oikean reunan laatikot päättyvät `--edge-r`:ään (kosketuksella toinen
  sarake `--col2`). Ilmoitusalue on symmetrinen (`--ns`). Mitat tulevat
  HUD-yksiköistä `--m`/`--u` ja mitatuista korkeuksista (`--top-h`,
  `--timer-h`); **ei uusia kovakoodattuja pikselisiirtymiä**. HUD-koon
  liukusäädin skaalaa kaiken, ks. `ui/hudScale.ts`.

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
  pelaaja käyttää ohjainta. Valikoissa ohjain kulkee `MenuNav.pad`-kutsulla,
  oikea tatti tähtää heiton (`castControl.ts`) ja osoittaa pikavalikon
  lohkon (`HeldMenu`). Uusi toiminto saa `pad`-napin, jos sellainen on vapaana.
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
- Uusi vesiefekti tehdään samalla viivatyylillä ja vain, jos se ei lisää
  levotonta liikettä. Hyväksytä ennen/jälkeen-kuvat tai GIFit ennen
  yhdistämistä.

### Asetukset ja valikot (PR #342)

Koodi: `packages/client/src/ui/screens.ts` (`showSettings`, `showPause`).

- **Pelaajan asetukset vain jaetussa Asetukset-näkymässä**
  (`Screens.showSettings`): Näyttö (HUD-koko, näkökenttä, opastus), Äänet
  ja Kieli.
  Sama näkymä aukeaa päävalikosta ja taukovalikosta.
- Päävalikko on lyhyt: Pelaa (alavalikossa Yksinpeli ja Moninpeli),
  Varusteet, Järvikartta, Ennätykset, Ohjeet, Asetukset ja Tietoa ja palaute
  (alavalikossa Palaute sekä Tekijät ja lähteet). Uusi kohta menee
  alavalikkoon, ei päävalikon jatkoksi.
- Taukovalikko on lyhyt: Jatka, Asetukset, Ohjeet, Lopeta kisa.
- Koko näyttö on pieni kuvake paneelin oikeassa yläkulmassa
  (`fullscreenButton`, `ui/fullscreen.ts`) päävalikossa ja tauolla, ei oma
  rivinsä valikossa.
- **Ohjeet** (`Screens.showManual`, sisältö `ui/manual.ts`, #401) kertovat
  mekaniikat osioittain päävalikosta ja tauolta. Ohjaus täytetään
  `CONTROLS`-kartasta ja vaikeustason luvut `DIFFICULTIES`-taulukosta. Kun
  mekaniikka muuttuu, päivitä sen kuvaus samassa PR:ssä.
- Varusteet laitetaan kuntoon vain päävalikon Varusteet-näkymässä (#383).
  Yksinpelin asetuksissa ja aulassa ne näkyvät vain yhteenvetona, ja kisassa
  vieheet vaihdetaan viehepakin pikavalikosta (R) ja kalastustapa omasta
  pikavalikostaan (M). Värit ovat omana
  alanäkymänään yksinpelin asetusten ja aulan yhteenvetoriviltä.
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
  - `NetBridge`: moninpelin viestit, muut pelaajat ja katsoja.
  - `Penalties`: jäähyt, kumossaolo ja niiden selitys.
- Uusi toiminto kuuluu siihen osaan, jota se koskee. Osat näkevät pelistä
  vain oman `…Host`-rajapintansa.
- Moninpelin erot ovat `NetBridge`-luokassa eivätkä `if (net)`-haaroina
  muualla, kun se on mahdollista.

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
- Onnistumiset kuulostavat iloisilta: oma lajiennätys (`recordCatch`,
  fanfaari) ja kala pitkän odotuksen jälkeen (`reliefCatch`) ratkaistaan
  `game/catchJoy.ts`:ssä päiväkirjasta ja kisa-ajasta.
- Uusi ääni on uusi rivi karttaan. Väylät (tehosteet, ympäristö, musiikki,
  puhe, ukkonen) ovat `Sfx`-luokassa ja niiden voimakkuudet `MIX`-taulukossa.

### Vaikeustaso ja avut (#391)

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
- **Raskaat testit erikseen.** Moninpelitestit avaavat useita selaimia, joten
  ne ovat oma Playwright-projektinsa `moninpeli` ja oma CI-ajonsa
  (`MULTIPLAYER` tiedostossa `playwright.config.ts`).
