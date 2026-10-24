/**
 * Hakee Lunkinjärven ja sen saarten rantaviivat OpenStreetMapista (Overpass API)
 * ja tallentaa ne tiedostoon data/osm-lunkinjarvi.json.
 *
 * Aineisto © OpenStreetMapin tekijät, ODbL 1.0.
 *
 * Ajo: pnpm --filter @lunki/map-pipeline fetch-osm
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractLake } from './osm';
import { overpass } from './overpass';

const LAKE_QUERY = `
[out:json][timeout:90];
area["name"="Tammela"]["boundary"="administrative"]["admin_level"="8"]->.t;
(
  way["natural"="water"]["name"="Lunkinjärvi"](area.t);
  relation["natural"="water"]["name"="Lunkinjärvi"](area.t);
)->.lake;
.lake out geom;
.lake map_to_area->.la;
(
  way["place"~"^(island|islet)$"](area.la);
  relation["place"~"^(island|islet)$"](area.la);
);
out geom;
`;

const here = dirname(fileURLToPath(import.meta.url));
const outFile = resolve(here, '../data/osm-lunkinjarvi.json');

const response = await overpass(LAKE_QUERY);
const lake = extractLake(response);
await mkdir(dirname(outFile), { recursive: true });
await writeFile(outFile, JSON.stringify(lake) + '\n');
console.log(
  `Tallennettu ${outFile}: ${lake.outer.length} ulkoreunaa, ${lake.islands.length} saarta, ` +
    `${lake.outer.reduce((n, r) => n + r.length, 0)} pistettä ulkoreunassa`,
);
