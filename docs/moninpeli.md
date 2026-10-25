# Moninpelin verkkokoodi

## Periaate

Palvelin on totuus renkaiden liikkeestä. Asiakas ennakoi oman renkaansa,
joten liike tuntuu viiveettömältä myös hitaalla yhteydellä.

```
asiakas                                   palvelin (LunkiRoom)
───────                                   ────────────────────
60 Hz: syöte → TubePredictor.step()       60 Hz: InputQueue.next() → stepPlayerTube()
  (oma rengas liikkuu heti)                 (yksi syöte per askel, tyhjällä jonolla odotetaan)
20 Hz: 3 syötettä + viehe → "input"  ──▶
                                     ◀──  20 Hz: tila (renkaat float64, ack = viimeisin syöte)
reconcile(): palvelimen tila + kuittaamattomat syötteet uudelleen
muut pelaajat: SnapshotBuffer, piirretään 120 ms menneisyydestä
```

- **Sama fysiikka molemmissa.** `stepPlayerTube` (shared) ajetaan samalla
  60 Hz:n askeleella asiakkaalla ja palvelimella. Koska fysiikka on
  deterministinen ja palvelin käyttää täsmälleen samoja syötteitä, ennakointi
  osuu yleensä tarkasti eikä korjauksia tarvita.
- **Huijauksen esto.** Palvelin kuluttaa korkeintaan yhden syötteen askeleessa
  ja jonossa on enintään 30 syötettä, joten pelaaja ei voi nopeuttaa omaa
  liikettään. Heiton osumapiste tarkistetaan (`isPlausibleSplash`): liian pitkä
  heitto hylätään ja viehe palaa kelalle.
- **Kalastus** (viehe, siima, kalat) lasketaan vielä asiakkaalla. Kaikilla on
  sama kalakanta yhteisestä siemenestä, mutta kukin näkee oman kopionsa. Kalan
  tunnistaa kaikissa kopioissa sen paikasta kalakannassa ja sukupolvesta
  (`FishTag`): saatu kala korvautuu saman paikan seuraavalla sukupolvella.
  Palvelin hyväksyy saman kalan vain ensimmäiseltä nostajalta, ja muiden
  kopioista se katoaa heti, myös kesken väsytyksen.
- **Saaliin laji ja paino palvelimelta.** Kalan paino ja uuden kalan
  kotipaikka lasketaan kalakannan siemenestä, paikasta ja sukupolvesta
  (`fishWeight`, `fishHome`), joten ne ovat samat kaikilla koneilla. Palvelin
  laskee kisan alkaessa saman kalakannan ja ottaa saaliin lajin ja painon
  siitä; asiakas kertoo vain, mikä kala nousi. Saalis hyväksytään, jos kala on
  paikan nykyinen sukupolvi ja viehe tarttui kalan kotipaikan lähellä
  (`catchRadius`: vaellusalue, vieheen seuraaminen ja heiton mitta). Itse
  väsytys lasketaan edelleen asiakkaalla, jotta se tuntuu viiveettömältä.
- **Kisan kulku palvelimella.** Aula → lähtölaskenta (3 s, renkaat paikallaan)
  → kisa palvelimen kellolla → loppu. Nostettu kala punnitaan palvelimella
  (`isPlausibleCatch`): laji järvessä, heitto veteen edellisen
  saaliin jälkeen ja vähintään 4 s saaliiden välillä. Hyväksytyt saaliit ovat
  kaikkien nähtävissä, ja tulostaulu lasketaan niistä voittoehdon mukaan
  (`rankPlayers`, sama funktio kuin yksinpelin tuloksissa). Isäntä voi
  palauttaa huoneen aulaan uutta kisaa varten.

- **Yhteyskatkos.** Palvelin pitää katkenneen pelaajan paikkaa 60 s
  (`LUNKI_RECONNECT_SECONDS`). Rengas odottaa paikallaan ja muut näkevät
  nimen perässä "(katkos)". Lyhyet katkokset SDK yhdistää itse; sivun
  uudelleenlatauksessa asiakas palaa välilehden muistiin tallennetulla
  tunnisteella samaan renkaaseen ja saaliisiin, ja syötteiden numerointi
  jatkuu palvelimen kuittauksesta.

- **Liittyminen kesken kisan.** Huonetta ei lukita kisan alkaessa. Kisan
  aikana lähteneen paikka (rengas, jäähyt, nimi) jää odottamaan selaimen
  pysyvän tunnisteen (`playerId`, ei jaeta muille) mukaan. Samalla selaimella
  huonekoodilla tai päävalikon "Palaa kisaan" -napista liittyvä palaa
  paikalleen, ja hänen saaliinsa siirtyvät uudelle yhteydelle. Uusi välilehti
  ottaa katkenneen yhteyden paikan heti. Uusi pelaaja aloittaa rannalta
  kisan ensimmäisen aloituspaikan läheltä ja kalastaa jäljellä olevan ajan.
  Isäntä valitsee aulassa: Sallittu / Vain paluu / Ei (`lateJoin`, tarkistus
  `onAuth`issa). Lähteneiden paikat lasketaan mukaan pelaajarajaan.

- **Katsojat.** Pelaaja, jolla on `spectator`, on huoneessa ilman rengasta:
  palvelin ei luo hänelle simulointia, joten syötteet, heitot ja saaliit
  ohitetaan, eikä hän ole tulostaulussa. Aulassa voi valita "Seuraava kisa:
  Kalastan / Katson" (`ClientMsg.spectate`), esim. turnauksessa karsituille.
  Kisaan ilman tyhjää paikkaa tai `lateJoin`-asetuksen estäessä liittyvä
  pääsee katsojaksi, jos asiakas pyytää sitä (`JoinOptions.spectate`, vanha
  palvelin hylkää kuten ennen). Kesken kisan tulleet katsojat ovat uudessa
  kisassa kalastajia. Katsojan kamera seuraa valittua kalastajaa (←/→,
  klikkaus) ylhäältä tai kalastajan silmin.

- **Siimojen sotkeutuminen.** Asiakas lähettää syötteen mukana vavan kärjen,
  vieheen paikan ja tiedon kelaamisesta (`l`). Palvelin etsii joka
  verkkoaskeleella vedessä olevat siimat, jotka ovat ristissä, kun jompikumpi
  kelaa (`findTangles`). Sotkussa kumpikaan ei voi nostaa kalaa (kala karkaa,
  jos se oli koukussa). Kelaavat pelaajat selvittävät sotkua yhdessä: yksin
  kelaten 6 s, kahdestaan 3 s (`TANGLE.untangleSeconds`). C-näppäin katkaisee
  oman siiman heti; toinen jatkaa normaalisti. Sotkukohta näkyy kaikille
  valkoisena rastina, ja selvinnyt pari on 2 s suojassa uudelta sotkulta.

## Testaus viiveellä

```sh
COLYSEUS_LATENCY=150 pnpm dev:server   # 150 ms edestakainen viive
LUNKI_RACE_SECONDS=60 pnpm dev:server  # kaikki kisat minuutin mittaisia
pnpm dev
```

Kehitystilassa `window.lunki.net.world.predictor.lastCorrection` kertoo
viimeisimmän korjauksen metreinä (normaalisti 0).
