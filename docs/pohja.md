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

## Pohjatartunta

Jos liikkuva viehe hipoo pohjaa (alle 0,35 m pohjasta) kivikon tai puun kohdalla, se voi
tarttua. Kelaaminen kiristää siiman jarrun voimalla. Noin 1,2 s vedon jälkeen viehe irtoaa
(60 %) tai siima katkeaa ja viehe jää pohjaan. Jos jarru on kireämmällä kuin siima kestää,
siima katkeaa heti.
