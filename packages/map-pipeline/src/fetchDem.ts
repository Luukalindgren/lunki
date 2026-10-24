/**
 * Hakee järven ympäristön korkeusmallin Copernicus DEM GLO-30 -aineistosta
 * (AWS:n avoin COG-tiedosto, vain tarvittava ikkuna luetaan HTTP-alueina).
 * Tallentaa tiedostoon data/dem-lunkinjarvi.json.
 *
 * Aineisto: © DLR e.V. 2010–2014 ja © Airbus Defence and Space GmbH 2014–2018,
 * Copernicus-ohjelman kautta (Euroopan unioni ja ESA). Vapaa käyttö lähdemaininnalla.
 *
 * MML:n 2 m korkeusmalli olisi tarkempi, mutta sen rajapinta vaatii API-avaimen.
 *
 * Ajo: pnpm --filter @lunki/map-pipeline fetch-dem
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fromUrl } from 'geotiff';
import { surroundingBox } from './area';
import type { OsmLake } from './osm';

const here = dirname(fileURLToPath(import.meta.url));
const lake = JSON.parse(
  await readFile(resolve(here, '../data/osm-lunkinjarvi.json'), 'utf8'),
) as OsmLake;
const box = surroundingBox(lake);

const lat = Math.floor(box.south);
const lon = Math.floor(box.west);
if (Math.floor(box.north) !== lat || Math.floor(box.east) !== lon)
  throw new Error('Alue ulottuu usealle DEM-ruudulle; yhdistämistä ei ole toteutettu');
const name = `Copernicus_DSM_COG_10_N${lat}_00_E${String(lon).padStart(3, '0')}_00_DEM`;
const url = `https://copernicus-dem-30m.s3.amazonaws.com/${name}/${name}.tif`;

const tiff = await fromUrl(url);
const image = await tiff.getImage();
const [originLon, originLat] = image.getOrigin() as [number, number];
const [resLon, resLat] = image.getResolution() as [number, number];
const col = (x: number) => Math.floor((x - originLon) / resLon);
const row = (y: number) => Math.floor((y - originLat) / resLat);
const window = [col(box.west), row(box.north), col(box.east) + 1, row(box.south) + 1] as const;
const [raster] = (await image.readRasters({ window: [...window] })) as unknown as [Float32Array];
const cols = window[2] - window[0];
const rows = window[3] - window[1];

const out = {
  source:
    'Copernicus DEM GLO-30: © DLR e.V. 2010–2014 ja © Airbus Defence and Space GmbH 2014–2018, Copernicus (EU, ESA)',
  /** Ruudukon vasemman yläkulman ruudun keskipiste ja ruudun koko asteina. */
  west: originLon + (window[0] + 0.5) * resLon,
  north: originLat + (window[1] + 0.5) * resLat,
  dLon: resLon,
  dLat: resLat,
  cols,
  rows,
  /** Korkeudet merenpinnasta desimetreinä, riveittäin pohjoisesta etelään. */
  heights: Array.from(raster, (h) => Math.round(h * 10)),
};
const outFile = resolve(here, '../data/dem-lunkinjarvi.json');
await writeFile(outFile, JSON.stringify(out) + '\n');
const hs = out.heights.map((h) => h / 10);
console.log(
  `Tallennettu ${outFile}: ${cols} × ${rows} ruutua, korkeus ${Math.min(...hs)}–${Math.max(...hs)} m`,
);
