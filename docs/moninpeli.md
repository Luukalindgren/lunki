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
  Saaliiden punnitus palvelimella tulee issuessa #16.

## Testaus viiveellä

```sh
COLYSEUS_LATENCY=150 pnpm dev:server   # 150 ms edestakainen viive
pnpm dev
```

Kehitystilassa `window.lunki.net.world.predictor.lastCorrection` kertoo
viimeisimmän korjauksen metreinä (normaalisti 0).
