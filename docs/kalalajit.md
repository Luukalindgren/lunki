# Kalalajit

Lajien parametrit ovat tiedostossa `packages/shared/src/fishing/fish.ts` (`SPECIES`).
Oletuksena järvessä ovat Lunkinjärven oikeat lajit: ahven, hauki ja särki. Kuhan ja
taimenen voi lisätä asetuksista (yksinpelin alkuvalikko, moninpelissä isännän aula).

| Laji   | Oma laji | Parvi | Elinalue (pohjan syvyys)   | Paino, mediaani | Iso yksilö             | Käytös                                                  |
| ------ | -------- | ----- | -------------------------- | --------------- | ---------------------- | ------------------------------------------------------- |
| Ahven  | kyllä    | 12    | 1–4,5 m, rantojen tuntuma  | 140 g           | 1 %, ~0,7 kg           | Runsain, kiinnostuu reippaasta vieheestä                |
| Hauki  | kyllä    | yksin | 0,6–2,2 m, kaislikon reuna | 1,3 kg          | 3 %, ~5 kg (max 12 kg) | Vaanii paikallaan, iskee kauas ja nopeasti              |
| Särki  | kyllä    | 24    | 0,5–3 m                    | 110 g           | 1 %, ~0,45 kg          | Ei petokala: tarttuu harvoin, vain hitaaseen vieheeseen |
| Kuha   | ei       | 5     | yli 4 m, syvänteet         | 1 kg            | 3 %, ~4 kg             | Pohjan tuntumassa, hidas viehe                          |
| Taimen | ei       | 3     | yli 2 m, avovesi           | 0,9 kg          | 3 %, ~3 kg             | Partioi laajasti, vahvin taistelija                     |

Runsaus jaetaan valittujen lajien kesken suhteessa (ahven 6, särki 4, kuha 0,8, hauki 0,6,
taimen 0,5). Saatu kala korvautuu uudella saman lajin kalalla lajitoverin lähellä.

Moninpelissä palvelin hylkää saaliin, jonka lajia ei ole huoneen lajistossa.

Kaislikoita ei vielä ole kartassa, joten hauen elinalue on toistaiseksi matala rantavesi.
Kun pohjakartta (#20) ja kasvillisuus tulevat, elinalueet tarkentuvat.

## Vieheet ja varusteet

Varusteet vaihdetaan taukovalikosta (Esc) tai vieheen pikanäppäimellä R. Vaihto tapahtuu,
kun viehe on kelalla. Parametrit: `packages/shared/src/fishing/gear.ts`.

| Viehe   | Uppoaminen                                          | Heitto   | Parhaat lajit        |
| ------- | --------------------------------------------------- | -------- | -------------------- |
| Lusikka | uppoaa, nousee kelatessa                            | pitkä    | hauki, taimen, ahven |
| Vaappu  | kelluu, sukeltaa kelatessa n. 2,5 m:iin             | lyhyt    | hauki, kuha, taimen  |
| Jigi    | painuu nopeasti pohjaan, kiinnostaa myös paikallaan | pisin    | kuha, ahven          |
| Lippa   | uppoaa hitaasti                                     | lyhyehkö | ahven, taimen, särki |

| Siima   | Kestävyys | Heitto   | Kalat                  |
| ------- | --------- | -------- | ---------------------- |
| 0,20 mm | 3,5 kg    | +7 %     | kiinnostuvat herkemmin |
| 0,25 mm | 5 kg      | normaali | normaali               |
| 0,30 mm | 7 kg      | −8 %     | arkailevat             |

Teräsperukka estää hauen hampaita katkaisemasta siimaa väsytyksessä (normaalilla ja
realistisella noin 3 % sekunnissa), mutta muut lajit tarttuvat siihen hieman harvemmin.
