import * as THREE from 'three';
import { activeLook, onLookChange } from '../engine/look';
import { pixelBytes, smoothPixels } from '../engine/smoothPixels';

/** Pikselikuva: värit riveittäin (0xRRGGBB), -1 = läpinäkyvä (vieheet, kalat, merkit). */
export interface Pixels {
  width: number;
  height: number;
  data: ArrayLike<number>;
}

/** Elossa olevat tekstuurit lähdekuvineen: ilmeen vaihtuessa ne piirretään uudelleen. */
const live = new Set<{ ref: WeakRef<THREE.DataTexture>; px: Pixels }>();

/** Kirjoittaa kuvan tekstuuriin käytössä olevan ilmeen mukaan. Ylin rivi ylös. */
function fill(tex: THREE.DataTexture, px: Pixels): void {
  const sharp = activeLook() === 'sharp';
  const image = sharp ? smoothPixels(px) : px;
  const { width, height } = image;
  const bytes = pixelBytes(image);
  // Tekstuurin rivi 0 on alhaalla.
  const rgba = new Uint8Array(bytes.length);
  for (let y = 0; y < height; y++)
    rgba.set(bytes.subarray(y * width * 4, (y + 1) * width * 4), (height - 1 - y) * width * 4);
  // Koko vaihtuu ilmeen mukana: vanha näytönohjaimen tekstuuri vapautetaan.
  tex.dispose();
  tex.image = { data: rgba, width, height };
  // Terävällä kuva on sileä ja reunat pehmeät; Retrossa pikselit pysyvät terävinä.
  tex.magFilter = sharp ? THREE.LinearFilter : THREE.NearestFilter;
  tex.minFilter = sharp ? THREE.LinearFilter : THREE.NearestFilter;
  tex.needsUpdate = true;
}

onLookChange(() => {
  for (const entry of live) {
    const tex = entry.ref.deref();
    if (tex) fill(tex, entry.px);
    else live.delete(entry);
  }
});

/**
 * Pikselikuva tekstuuriksi: Retrossa terävät pikselit ja vain täysin peittävät
 * tai läpinäkyvät kohdat, jotta paletti ei vaihda sävyä. Terävällä (#674)
 * samasta kuvasta tehdään sileä versio (`smoothPixels`), ja tekstuuri vaihtuu
 * ilmeen mukana itsestään.
 */
export function pixelTexture(px: Pixels): THREE.DataTexture {
  const tex = new THREE.DataTexture(new Uint8Array(4), 1, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  fill(tex, px);
  live.add({ ref: new WeakRef(tex), px });
  return tex;
}

/** Pikselikuva merkkijonoista: `#` = väri, `o` = toinen väri, muu = läpinäkyvä. */
export function pixelArt(rows: string[], color: number, other = -1): Pixels {
  const width = rows[0]!.length;
  const data: number[] = [];
  for (const row of rows)
    for (let i = 0; i < width; i++) data.push(row[i] === '#' ? color : row[i] === 'o' ? other : -1);
  return { width, height: rows.length, data };
}
