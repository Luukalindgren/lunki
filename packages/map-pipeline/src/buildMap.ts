/**
 * Muuntaa avoimen aineiston pelin karttamuotoon (ETRS-TM35FIN-metrit, origo
 * järven keskellä) ja kirjoittaa sen shared-pakettiin:
 * - lunkinjarvi.json: rantaviiva (OSM) ja saaret (OSM tai ilmakuvista tulkitut,
 *   data/islands-aerial.json)
 * - lunkinjarvi-surroundings.json: maankäyttö, rakennukset, tiet (OSM) ja
 *   maaston korkeus (Copernicus DEM), jos aineistot on haettu.
 *
 * Ajo: pnpm --filter @lunki/map-pipeline build-map
 */
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toLakeMap, type AerialIslands } from './lakeMap';
import type { OsmLake, OsmSurroundings } from './osm';
import { toSurroundings, type Dem } from './surroundings';

const here = dirname(fileURLToPath(import.meta.url));
const data = (name: string) => resolve(here, '../data', name);
const shared = (name: string) => resolve(here, '../../shared/src/map', name);
const readJson = async <T>(file: string): Promise<T | null> =>
  existsSync(file) ? (JSON.parse(await readFile(file, 'utf8')) as T) : null;

const osm = (await readJson<OsmLake>(data('osm-lunkinjarvi.json')))!;
const map = toLakeMap(osm, await readJson<AerialIslands>(data('islands-aerial.json')));
await writeFile(shared('lunkinjarvi.json'), JSON.stringify(map) + '\n');

const w = map.bounds.maxX - map.bounds.minX;
const h = map.bounds.maxY - map.bounds.minY;
console.log(
  `${map.name}: ${w.toFixed(0)} × ${h.toFixed(0)} m, rannassa ${map.shore.length} pistettä, ` +
    `${map.islands.length} saarta`,
);

const surroundings = toSurroundings(
  map,
  await readJson<OsmSurroundings>(data('osm-surroundings.json')),
  await readJson<Dem>(data('dem-lunkinjarvi.json')),
);
await writeFile(shared('lunkinjarvi-surroundings.json'), JSON.stringify(surroundings) + '\n');
const t = surroundings.terrain;
console.log(
  `Ympäristö: ${surroundings.areas.length} aluetta, ${surroundings.lines.length} viivaa, ` +
    (t
      ? `maasto ${t.cols} × ${t.rows} (${t.cell} m), järven pinta ${t.waterLevel} m, ` +
        `korkeus ${Math.min(...t.heights)}…${Math.max(...t.heights)} m`
      : 'ei maastoa'),
);
