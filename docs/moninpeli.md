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
  jatkuu palvelimen kuittauksesta. Hetken jumittaneen yhteyden viestit
  saapuvat palvelimelle ryöppynä, joten viestiraja on väljä
  (`MAX_MESSAGES_PER_SECOND`), ja asiakas yhdistää uudelleen heti liittymisen
  jälkeenkin (`reconnection.minUptime = 0`).

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

- **Käsimerkit ja puhekuplat** (#228, protokolla 5). G (kosketuksella ELE)
  avaa ympyrävalikon: vilkutus, peukku, keskisormi, nyrkin heristys, "tänne!"
  ja "näin iso!". Ele on 2,2 s käsien animaatio (`animateEmote`), jonka aikana
  ei voi heittää, ja 3 s kupla nimilapun yllä. Chat-viestit näkyvät kuplassa
  40 merkkiin lyhennettynä 5 s; yli 45 m:n päässä kupla pienenee ja viestistä
  näkyy vain "…". Palvelin tarkistaa eleen tunnisteen ja tiheyden (2 putkeen,
  sitten 1 / 2 s) ja välittää sen muille (`ServerMsg.emote`); eleitä ei
  tallenneta. Yksinpelissä eleet näkyvät vain omalla koneella.

- **Vene kulkupelinä** (#263, protokolla 7). Jokainen valitsee aulassa
  kulkupelin: kelluntarengas tai oma vene (`ClientMsg.boat`: 0 = uusi oma
  vene, n = kyytiin veneeseen n, `BOAT_TUBE` = takaisin renkaalle). Veneessä
  on soutaja ja enintään kaksi kalastajaa (`PlayerState.boat`, `seat`), ja
  venekunta on yksi joukkue: tulostaulussa renkaat ovat omina riveinään ja
  veneet joukkueina (`rankTeams`). Vene on soutajan `TubeState` (suunta
  perään), kyydissä olevat seuraavat sitä (`seatPos`) ja kääntyvät sen mukana.
  Soutaja ei voi soutaa heittäessään eikä kelatessaan (`rodInHand`, `RowerSeat`),
  mutta viehe vedessä hän voi soutaa ja uistella. Heitto ja kelaus nostavat
  airot, soutu laskee vavan, ja B vaihtaa. Vavassa soutaja kääntyy tuhdolla
  (`look`, lähetetään syötteen mukana). Runko on kolme ympyrää (`BOAT_CIRCLES`), joten
  keula ja perä törmäävät rantaan ja muihin; raskas vene (`CRAFTS.boat.mass`)
  tönäisee rengasta enemmän kuin rengas venettä. Vene kulkee noin 1,5 kertaa
  renkaan vauhtia, kiihtyy hitaammin ja liukuu vetojen jälkeen pitkään
  (`BOAT_PHYSICS`). Vanha asiakas ei pääse huoneeseen, jossa on vene, eikä
  venettä voi valita, kun huoneessa on vanha asiakas.
- **Ankkuri** (#355, protokolla 8). Renkaalla ja veneen soutajalla on ankkuri:
  N (kosketuksella ⚓) laskee ja nostaa sen. Painallus kulkee syötteen bittinä
  (32), joten palvelin ja ennakointi laskevat ankkurin samoista syötteistä
  (`stepAnchor` `stepPlayerTube`:ssa, syvyys `LakeBottom.depthAt`). Tila on
  `TubeState.anchor` ja verkossa `PlayerState.anchor…` (`AnchorPhase`).
  Pohjassa ankkuri pitää aluksen köyden mitan sisällä (köyttä 1,5 × syvyys),
  vene kääntyy keula ankkuria kohti eli tuulta vasten, ja ankkurissa ei potkita
  eikä soudeta. Myrskyssä (yli 10,5 m/s) ankkuri laahaa, ja trombi repäisee
  sen irti. Kyytiläinen ei laske ankkuria, eikä asiakas tarjoa ankkuria
  vanhalle palvelimelle (`ANCHOR_PROTOCOL`).
- **Paikanvaihto veneessä** (#357, protokolla 9). T (kosketuksella ⇄)
  lähettää `ClientMsg.seat` halutulla paikalla. Vapaalle kyytiläisen paikalle
  siirrytään suoraan; varatusta pyydetään vaihtoa (`PlayerState.seatAsk` =
  paikka + 1), ja vaihto tehdään, kun paikan haltija pyytää pyytäjän paikkaa
  (`seatChange`). Soutajan paikka ei jää tyhjäksi. Kisassa vene on lähes
  paikallaan (`SEAT_SWAP.maxSpeed`), viehe kelalla eikä jäähyä ole, ja pyyntö
  raukeaa 10 sekunnissa. Uusi soutaja jatkaa veneen tilasta (vauhti, suunta,
  ankkuri) kuten soutajan lähtiessä (`passOars`). Aulassa venekunnan riveillä
  on Vaihda paikkaa -nappi. Piirrossa hahmo liukuu uudelle paikalle ja vene
  keinahtaa (`SeatSlides`).
- **Kisan tilastot ja palkinnot** (#367, protokolla 10). Jokainen laskee
  omat tilastonsa (`RaceStatsCounter`: heitot, tärpit, karanneet, sotkut,
  kaatumiset, matka…) ja lähettää ne kisan lopussa `ClientMsg.stats`. Palvelin
  ottaa ne vastaan kerran kisassa ja lähettää kaikille koko joukon
  (`ServerMsg.stats`); uusi kisa tyhjentää. Tulossivun palkinnot (`raceAwards`)
  ja tilastot lasketaan asiakkaalla. Tilastot ovat huvia, ne eivät vaikuta
  tulokseen. Vanhan palvelimen kanssa näkyvät vain omat tilastot. Kaikkien
  kisojen omat yhteistilastot ovat laitteella (`lunki.stats`).
- **Rantautuminen** (#457, protokolla 12). Renkaalla noustaan maihin
  potkimalla selkä edellä rantaa vasten noin sekunti (`stepLanding`, kertymä
  `TubeState.landing`), kun viehe on sisällä. Maalla `TubeState.shore` kertoo
  renkaan paikan maassa tai kannettuna, ja `pos` on kalastajan paikka, joten
  kamera, äänet, salama ja muiden näkymä seuraavat kalastajaa. Kävely
  (`stepShore`) pysyy maalla 5 m kaistalla rantaviivasta (`canStand`, ei
  laitureille). Pääkonteksti maalla (renkaan otto ja lasku, vesirajassa
  kyytiin hyppy) on syötteen bitti 64; verkossa `PlayerState.shore…`
  (`shoreToNet`/`shoreFromNet`). Palvelin päästää maihin vain renkaalla,
  vieheen ollessa sisällä ja asiakkaan osatessa rantautumisen (`Sim.canLand`).
  Maalla oleva ei törmää renkaisiin, ei kalasta, eikä salama, iso aalto tai
  trombi osu häneen. Vanhan palvelimen kanssa ranta on seinä kuten ennen.

## Testaus viiveellä

```sh
COLYSEUS_LATENCY=150 pnpm dev:server   # 150 ms edestakainen viive
LUNKI_RACE_SECONDS=60 pnpm dev:server  # kaikki kisat minuutin mittaisia
pnpm dev
```

Kehitystilassa `window.lunki.net.world.predictor.lastCorrection` kertoo
viimeisimmän korjauksen metreinä (normaalisti 0).
