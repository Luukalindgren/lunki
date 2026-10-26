# Järven pohja

Lunkinjärvestä ei ole luotausaineistoa: Järvi-meriwikin (Syken järvirekisteri) sivulla
[Lunkinjärvi (35.936.1.013)](<https://www.jarviwiki.fi/wiki/Lunkinj%C3%A4rvi_(35.936.1.013)>)
syvyys-, keskisyvyys- ja tilavuuskentät ovat tyhjiä. Sivulla on pinta-ala 115,59 ha,
rantaviivan pituus 8,59 km ja korkeustaso 129,9 m. Pohja siis lasketaan.

## Laskenta (`packages/shared/src/map/bottom.ts`)

1. Järven alue jaetaan 4 m ruutuihin. Jokaiselle vesiruudulle lasketaan etäisyys rantaan
   (euklidinen etäisyysmuunnos).
2. Syvyys kasvaa rannasta kyllästyvällä käyrällä kohti arvioitua maksimisyvyyttä
   (`maxDepth`, nyt 8 m). Rannan jyrkkyys vaihtelee rantaa pitkin pehmeän kohinan mukaan.
3. Pohjaan lisätään luonnollista vaihtelua (±0,5 m) kauempana rannasta.
4. Erikoismuodot muokkaavat tulosta.

Kysely interpoloi esilasketusta ruudukosta, joten se on nopea. Koko järven laskenta kestää
noin 0,1–0,2 s pelin käynnistyessä.

Rannan jyrkkyys maaston kaltevuudesta (MML:n korkeusmalli) tulee mukaan karttaputken (#19)
myötä. Siihen asti jyrkät ja loivat rannat merkitään käsin `steep`-muodoilla.

## Erikoismuodot (`packages/shared/src/map/lunkinjarvi-features.json`)

Tiedostoa saa muokata käsin. Koordinaatit ovat pelin metrejä: x itään ja y pohjoiseen
järven keskeltä. Pelaajan sijainnin näkee kehitystilassa konsolista: `lunki.tube.pos`.

| Tyyppi    | Kentät                                    | Vaikutus                                                                                                 |
| --------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `shoal`   | x, y, radius, depth                       | Matalikko: pohja nousee pehmeästi syvyyteen `depth`                                                      |
| `hole`    | x, y, radius, depth                       | Syvänne: pohja painuu pehmeästi syvyyteen `depth`                                                        |
| `dropoff` | x, y, radius, depth                       | Jyrkänne: tasanne syvyydessä `depth`, reuna putoaa parissa metrissä. Kuhat ja ahvenet viihtyvät reunalla |
| `rocks`   | x, y, radius                              | Kivikko: ahvenet, hauet ja kuhat viihtyvät. Pohjaa hipova viehe voi tarttua                              |
| `tree`    | x, y (tyvi rannalla), length, angle (rad) | Kaatunut puu: hauen vaanimapaikka. Viehe voi tarttua oksiin                                              |
| `steep`   | x, y, radius, steepness                   | Rannan jyrkkyyskerroin alueella (>1 jyrkkä, <1 loiva)                                                    |

Kaikilla muodoilla voi olla `name`. Testit (`bottom.test.ts`) tarkistavat, että muodot ovat
vedessä ja puiden tyvet rannalla.

## Kivet, kasvustot, risukot ja pohjan laatu (`packages/shared/src/map/scatter.ts`)

Lunkinjärvestä ei ole luotausta, joten pohjan pienet rakenteet sijoitellaan sääntöjen
mukaan siitä, millainen Hämeen järviylängön moreenijärven pohja tyypillisesti on (#226).
Sijoittelu on kiinteä (hajautusfunktio ruudun koordinaateista, ei satunnaislukuja), joten
pohja on sama kaikille pelaajille ja palvelimelle. Se on käytössä, kun muotojen
tiedostossa on `"scatter": true` (testijärvillä pois).

| Rakenne   | Määrä | Sijoittelu                                                                                                                                |
| --------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `boulder` | ~210  | Siirtolohkareet 0,3–1,5 m: jyrkät rannat, matalikot ja kivikkojen ympäristö, harvakseltaan alle 4 m:ssä. Isoimmat nousevat lähelle pintaa |
| `weed`    | ~40   | Uposkasvustot (vidat, karvalehti, ärviä) 0,8–3 m:ssä, eniten suojaisilla loivilla rannoilla; säde 7–18 m, tiheys 0,4–1                    |
| `brush`   | ~14   | Ahvenrisukot noin joka kolmannen laiturin edustalla ja vanhat uppotukit 8–45 m rannasta, 1,4–4,5 m:ssä                                    |

Pohjan laatu (`bottomTypeAt`): **kivikko** kivikoissa, matalikoilla ja jyrkillä rannoilla,
**lieju** syvänteissä (yli noin 5 m, suojaisissa lahdissa matalammalta), muuten **hiekka**.

Rakenteet ovat `LakeBottom.structures`-listassa käsin merkittyjen jälkeen, ja `structureAt`
hakee ne 16 m:n ruudukosta. Kalat: ahven viihtyy myös kasvustoissa ja risukoissa, hauki
kasvustojen reunoilla ja risukoissa, särki kasvustoissa. Yksittäinen siroteltu rakenne
painaa parven paikkaa arvottaessa vähemmän kuin käsin merkitty.

Näkyvyys: kaikuluotain ja vieheen syvyysnäyttö piirtävät kivikkopohjan kirkkaampana ja
paksumpana viivana, liejun himmeämpänä, kiven kohoumana ja kasvuston vihreänä kerroksena.
Ylhäältä ja kalastajan silmin kivet, kasvustot ja risukot kuultavat veden läpi, jos niiden
yläpää on alle 1,5 m pinnasta.

## Pohjatartunta

Jos liikkuva viehe hipoo pohjaa (alle 0,35 m pohjasta tai kiven, kasvuston tai risukon
yläpäästä) rakenteen kohdalla, se voi tarttua. Riski (0,9/s kerrottuna) riippuu
rakenteesta (kivi 1,5, risukko 1,6, puu 1,2, kivikko ja kaislikko 1, kasvusto 0,12 ×
tiheys²) ja vieheestä (jigi 1,4, lusikka 1, lippa 0,9, vaappu 0,45, koska lippa kimmottaa
sen kivestä). Kelaaminen kiristää siiman jarrun voimalla. Noin 1,2 s vedon jälkeen viehe
irtoaa (60 %) tai siima katkeaa ja viehe jää pohjaan. Jos jarru on kireämmällä kuin siima
kestää, siima katkeaa heti.

- **Rikka**: kasvuston läpi kulkeva viehe kerää rikkaa (1,5/s × tiheys). Rikkainen viehe
  houkuttelee kaloja vain 5 % tavallisesta, kunnes se kelataan kotiin ja puhdistetaan.
- **Lieju**: pohjaa laahaava jigi tarttuu liejuun kevyesti (0,15/s) ja irtoaa aina
  ensimmäisellä vedolla.
- **Kivikko**: pohjaa laahaava jigi kolisee kivikkopohjassa (ääni).

## Saaret ja kaislikot

OpenStreetMapissa Lunkinjärvellä ei ole saaria eikä kaislikoita, eikä Maanmittauslaitoksen
maastotietokantaa saa haettua ilman API-avainta. Ne on siksi rajattu ilmakuvista (Esri
World Imagery, Microsoft Bing Maps; haettu GitHub Actionsissa ja sovitettu OSM-rantaviivaan,
ks. #99).

- **Saaret** (`packages/map-pipeline/data/islands-aerial.json`, ETRS-TM35FIN): 9 luotoa,
  rajattu automaattisesti kesäkuvan kasvillisuudesta (puiden latvukset + 1 m). Karttaputki
  (`build-map`) lisää ne `lunkinjarvi.json`in `islands`-kenttään. Saaret ovat maata:
  este renkaalle ja vieheelle, pohja madaltuu niiden ympärillä kuten rannassa.
- **Kaislikot ja lumpeikot** (`packages/shared/src/map/lunkinjarvi-reeds.json`, pelin
  metrit): 14 laikkua, rajattu käsin suurpiirteisesti. Tiedostoa saa muokata. Kaislikossa
  pohja nousee reunalta 8 m matkalla 1,2 metriin, rengas kulkee noin puolta hitaammin
  (vastus × 3,5), viehe voi tarttua varsiin missä syvyydessä tahansa, ja osa hauista ja
  särjistä asettuu kaislikon reunalle (`packages/shared/src/map/reeds.ts`).
