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
  toiminnolla on näppäimet, kosketusnappi tai ele ja nimi ohjeisiin.
  Peli kysyy toimintoja (`controls.wasPressed('castForward')`), ei näppäimiä.
- Kosketusnapit painavat toimintoja (`controls.set` / `controls.tap`), eivät
  matki näppäimiä. Ei raakoja `KeyX`-tarkistuksia pelikoodissa eikä
  keksittyjä näppäinnimiä.
- Ohjetekstien `{toiminto}`-kohdat täytetään kartasta (`controlText`,
  `withKey`), joten näppäimen vaihto päivittää ohjeet, napit ja valikot
  kerralla.
- Tilannenapit (iso nappi HEITÄ/KELAA/VETO, perhon SIIMA/NOSTA/KELALLE,
  KATKO/PERU) ratkaisee `contextActions`.

### Valo, sää ja välähdykset (PR #341)

Koodi: `packages/client/src/game/skyView.ts`, `engine/retroRenderer.ts`.

- **Koko kuvan kirkkaus yhdestä sävytyksestä** (`SkyView.grade`):
  vuorokaudenaika, pilvisyyden synkkyys ja salaman välähdys lasketaan
  samaan paletin jälkeiseen sävytykseen. Välähdyksen voimakkuus riippuu
  salaman etäisyydestä (`flashStrength`), ja aivan vieressä kuva kääntyy
  hetkeksi negatiiviksi (`grade.invert`).
- Älä lisää omia välähdyskerroksia (DOM-verhoja, valon kertoimia,
  pistevaloja) tai erillisiä tummennuksia. Valaistuksen himmennys rikkoo
  paletin: tummat vesisävyt kääntyvät vihreiksi.
- Usva on yksi kerros (`grade.mist` ja `game/mistView.ts`).

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
  (`Screens.showSettings`): Näyttö (HUD-koko, näkökenttä), Äänet ja Kieli.
  Sama näkymä aukeaa päävalikosta ja taukovalikosta.
- Taukovalikko on lyhyt: Jatka, Varusteet, Asetukset, Koko näyttö, Lopeta
  kisa. Varusteet ja värit ovat omina alanäkyminään, ja yksinpelin
  asetuksissa sekä aulassa ne näkyvät yhteenvetoriveinä.
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

### Äänet (#371)

Koodi: `packages/client/src/audio/sounds.ts`.

- **Pelin tapahtumien äänet vain äänikartan `SOUNDS` kautta**
  (`sounds.play('escaped')`): kartta päättää tehosteen ja kalastajan
  repliikin. Peli ei kutsu `Sfx`-tehosteita suoraan.
- Muiden pelaajien tapahtumat soivat samoilla äänillä etäisyyden mukaan
  hiljempaa (`sounds.playAt`, kantama `EFFECT_RANGE`), ja muiden puhe
  kuuluu käsimerkeistä (`voiceAt`).
- Uusi ääni on uusi rivi karttaan. Väylät (tehosteet, ympäristö, musiikki,
  puhe, ukkonen) ja niiden voimakkuudet ovat `Sfx`-luokassa.

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
