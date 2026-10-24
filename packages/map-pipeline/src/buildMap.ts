/**
 * Muuntaa OSM-aineiston pelin karttamuotoon (ETRS-TM35FIN-metrit, origo järven
 * keskellä) ja kirjoittaa sen shared-pakettiin.
 *
 * Ajo: pnpm --filter @lunki/map-pipeline build-map
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toLakeMap } from './lakeMap';
import type { OsmLake } from './osm';

const here = dirname(fileURLToPath(import.meta.url));
const inFile = resolve(here, '../data/osm-lunkinjarvi.json');
const outFile = resolve(here, '../../shared/src/map/lunkinjarvi.json');

const osm = JSON.parse(await readFile(inFile, 'utf8')) as OsmLake;
const map = toLakeMap(osm);
await writeFile(outFile, JSON.stringify(map) + '\n');

const w = map.bounds.maxX - map.bounds.minX;
const h = map.bounds.maxY - map.bounds.minY;
console.log(
  `${map.name}: ${w.toFixed(0)} × ${h.toFixed(0)} m, rannassa ${map.shore.length} pistettä, ` +
    `${map.islands.length} saarta → ${outFile}`,
);
