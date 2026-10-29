import * as THREE from 'three';

/** Pikselikuva: värit riveittäin (0xRRGGBB), -1 = läpinäkyvä (vieheet, kalat, merkit). */
export interface Pixels {
  width: number;
  height: number;
  data: ArrayLike<number>;
}

/**
 * Pikselikuva tekstuuriksi: terävät pikselit ja vain täysin peittävät tai
 * läpinäkyvät kohdat, jotta paletti ei vaihda sävyä. Ylin rivi ylös.
 */
export function pixelTexture(px: Pixels): THREE.DataTexture {
  const { width, height } = px;
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < px.data.length; i++) {
    const c = px.data[i]!;
    if (c < 0) continue;
    // Tekstuurin rivi 0 on alhaalla.
    const o = ((height - 1 - Math.floor(i / width)) * width + (i % width)) * 4;
    rgba[o] = (c >> 16) & 0xff;
    rgba[o + 1] = (c >> 8) & 0xff;
    rgba[o + 2] = c & 0xff;
    rgba[o + 3] = 255;
  }
  const tex = new THREE.DataTexture(rgba, width, height);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
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
