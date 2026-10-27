# Lunkinjärvi (repo `lunki`)

Selainmoninpeli: kalastus kelluntarenkaalta Tammelan Lunkinjärvellä. Koodi,
kommentit, commit-viestit ja dokumentaatio ovat suomeksi.

Lue ennen muutosta kehitysperiaatteet, erityisesti yhtenäiset järjestelmät
(HUD-ilmoitukset, ohjauksen toimintokartta, yksi valon sävytys, vesi,
Asetukset-näkymä, toimiminen ilman palvelinta):

@docs/kehitys.md

Lyhyesti:

- Haara ja PR jokaiselle muutokselle, main vain yhdistettyjen PR:ien kautta.
- Käyttöliittymämuutoksiin ennen/jälkeen-kuvakaappaukset.
- `pnpm check` ennen PR:ää; selaintestit ajetaan CI:ssä.
- `ehdotus`- ja `palaute`-issueita ei toteuteta ilman Luukan hyväksyntää.
- Muut ohjeet: [README.md](README.md) ja `docs/`.
