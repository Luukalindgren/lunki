/**
 * Hakee Lunkinjärven ympäristön OpenStreetMapista: maankäyttö (metsä, pelto,
 * suo, kaislikko), rakennukset, tiet, laiturit ja muut vedet. Tallentaa
 * tiedostoon data/osm-surroundings.json.
 *
 * Aineisto © OpenStreetMapin tekijät, ODbL 1.0.
 *
 * Ajo: pnpm --filter @lunki/map-pipeline fetch-surroundings
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { surroundingBox } from './area';
import { overpass } from './overpass';
import { extractSurroundings, type OsmLake } from './osm';

const here = dirname(fileURLToPath(import.meta.url));
const lake = JSON.parse(
  await readFile(resolve(here, '../data/osm-lunkinjarvi.json'), 'utf8'),
) as OsmLake;
const box = surroundingBox(lake);
const bbox = `${box.south},${box.west},${box.north},${box.east}`;

const QUERY = `
[out:json][timeout:120][bbox:${bbox}];
(
  way["landuse"];
  relation["landuse"]["type"="multipolygon"];
  way["natural"~"^(wood|wetland|scrub|heath|grassland|beach|sand|bare_rock|water)$"];
  relation["natural"~"^(wood|wetland|scrub|heath|grassland|water)$"]["type"="multipolygon"];
  way["building"];
  way["highway"];
  way["man_made"~"^(pier|breakwater|jetty)$"];
  way["leisure"~"^(slipway|swimming_area|beach_resort)$"];
  way["waterway"];
);
out geom;
`;

const response = await overpass(QUERY);
const data = extractSurroundings(response, box);
const outFile = resolve(here, '../data/osm-surroundings.json');
await writeFile(outFile, JSON.stringify(data) + '\n');
const count = (k: string) => data.features.filter((f) => f.kind === k).length;
console.log(
  `Tallennettu ${outFile}: ${data.features.length} kohdetta ` +
    `(metsä ${count('forest')}, pelto ${count('field')}, suo ${count('wetland')}, ` +
    `rakennus ${count('building')}, tie ${count('road')}, polku ${count('path')}, laituri ${count('pier')})`,
);
