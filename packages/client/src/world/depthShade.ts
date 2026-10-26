import * as THREE from 'three';
import type { LakeBottom } from '@lunki/shared';

/** Syvyysvyöhykkeet pinnan sävyyn (sRGB 0–255, peitto): matala ranta vaalea, syvänne tumma. */
const DEPTH_BANDS: [number, [number, number, number, number]][] = [
  [1, [120, 180, 165, 0.5]],
  [2, [95, 170, 160, 0.32]],
  [3.5, [60, 140, 170, 0.18]],
  [6, [0, 0, 0, 0]],
  [8, [10, 30, 70, 0.22]],
  [Infinity, [5, 15, 45, 0.4]],
];

/** Syvyystekstuurin lukualue (m): punainen 1 = tämä syvyys tai syvempi. */
export const DEPTH_TEX_RANGE = 12;
/**
 * Syvyysrajan porras (m): syvyys luetaan tämän kokoisten ruutujen keskeltä,
 * jolloin raja kaartuu mutta etenee pikselitaiteen tapaan pienin portain.
 */
export const DEPTH_PIXEL = 1;
/** Syvyystekstuurin tarkkuus (m/pikseli); välit interpoloidaan sileästi. */
const DEPTH_TEX_CELL = 2;

const f = (x: number) => x.toFixed(4);

/**
 * GLSL: syvyys (m) → vyöhykkeen sävy (lineaarinen rgb, peitto). Vyöhykkeet
 * vaihtuvat terävästi kuten ennenkin, ja raja seuraa interpoloitua
 * syvyyttä pienin portain (ks. DEPTH_PIXEL).
 */
export const DEPTH_SHADE_GLSL = `vec4 depthShade(float d) {
${DEPTH_BANDS.map(([max, [r, g, b, a]]) => {
  const c = new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
  const value = `vec4(${f(c.r)}, ${f(c.g)}, ${f(c.b)}, ${f(a)})`;
  return Number.isFinite(max)
    ? `  if (d < ${max.toFixed(2)}) return ${value};`
    : `  return ${value};`;
}).join('\n')}
}
`;

/** Pohjan syvyys tekstuurina vesishaderille sekä sen rajat (minX, minY, leveys, korkeus). */
export function createDepthTexture(bottom: LakeBottom): {
  texture: THREE.DataTexture;
  bounds: THREE.Vector4;
} {
  const b = bottom.bounds;
  const c = DEPTH_TEX_CELL;
  const w = Math.ceil((b.maxX - b.minX) / c) + 2;
  const h = Math.ceil((b.maxY - b.minY) / c) + 2;
  // Tekselin i keskipiste on x = minX + (i − 0.5)·c; rivi 0 on etelässä (v = 0).
  const x0 = b.minX - c;
  const y0 = b.minY - c;
  const data = new Uint8Array(w * h * 4);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const d = bottom.depthAt({ x: x0 + (i + 0.5) * c, y: y0 + (j + 0.5) * c });
      const k = (j * w + i) * 4;
      data[k] = Math.round(Math.min(1, d / DEPTH_TEX_RANGE) * 255);
      data[k + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, w, h);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return { texture, bounds: new THREE.Vector4(x0, y0, w * c, h * c) };
}
