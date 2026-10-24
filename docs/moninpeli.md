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
  sama kalakanta yhteisestä siemenestä, mutta kukin näkee oman kopionsa.
- **Kisan kulku palvelimella.** Aula → lähtölaskenta (3 s, renkaat paikallaan)
  → kisa palvelimen kellolla → loppu. Nostettu kala punnitaan palvelimella
  (`isPlausibleCatch`): laji ja paino lajin rajoissa, heitto veteen edellisen
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

## Testaus viiveellä

```sh
COLYSEUS_LATENCY=150 pnpm dev:server   # 150 ms edestakainen viive
LUNKI_RACE_SECONDS=60 pnpm dev:server  # kaikki kisat minuutin mittaisia
pnpm dev
```

Kehitystilassa `window.lunki.net.world.predictor.lastCorrection` kertoo
viimeisimmän korjauksen metreinä (normaalisti 0).
