import * as THREE from 'three';
import type { LakeBottom } from '@lunki/shared';

type DepthBand = [number, [number, number, number, number]];

/** Syvyysvyöhykkeet pinnan sävyyn (sRGB 0–255, peitto): matala ranta vaalea, syvänne tumma. */
const DEPTH_BANDS: DepthBand[] = [
  [1, [120, 180, 165, 0.5]],
  [2, [95, 170, 160, 0.32]],
  [3.5, [60, 140, 170, 0.18]],
  [6, [0, 0, 0, 0]],
  [8, [10, 30, 70, 0.22]],
  [Infinity, [5, 15, 45, 0.4]],
];

/**
 * Terävän ilmeen (#674) matalikot: Retrossa vihertävä sävy pyöristyy paletissa
 * siniseksi, mutta ilman palettia se näkyisi vihreänä. Sävyt on valittu niin,
 * että matalikko on kummassakin ilmeessä samaa vaaleaa sinistä.
 */
const SHARP_DEPTH_BANDS: DepthBand[] = [
  [1, [80, 160, 200, 0.45]],
  [2, [60, 140, 190, 0.3]],
  [3.5, [45, 120, 180, 0.18]],
  ...DEPTH_BANDS.slice(3),
];

/**
 * Modernin ilmeen (#650) vesi: sävy liukuu syvyyden mukaan ilman portaita.
 * Matalassa näkyy vaalea pohja, syvänne tummuu. Ylhäältä syvyyskäyrät
 * piirretään näille syvyyksille (m), samoille kuin Retron vyöhykkeiden rajat.
 */
export const MODERN_DEPTH = {
  shallow: [84, 152, 150] as const,
  shallowCover: 0.5,
  shallowTo: 4,
  deep: [6, 22, 32] as const,
  deepCover: 0.5,
  deepFrom: 4,
  deepTo: 11,
  contours: [1, 2, 3.5, 6, 8],
};

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
const bandsGlsl = (name: string, bands: DepthBand[]) => `vec4 ${name}(float d) {
${bands
  .map(([max, [r, g, b, a]]) => {
    const c = new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
    const value = `vec4(${f(c.r)}, ${f(c.g)}, ${f(c.b)}, ${f(a)})`;
    return Number.isFinite(max)
      ? `  if (d < ${max.toFixed(2)}) return ${value};`
      : `  return ${value};`;
  })
  .join('\n')}
}
`;

const linear = ([r, g, b]: readonly [number, number, number]) => {
  const c = new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
  return `vec3(${f(c.r)}, ${f(c.g)}, ${f(c.b)})`;
};

const modernGlsl = (m: typeof MODERN_DEPTH) => `vec4 depthShadeModern(float d) {
  float shallow = 1.0 - smoothstep(0.0, ${f(m.shallowTo)}, d);
  float deep = smoothstep(${f(m.deepFrom)}, ${f(m.deepTo)}, d);
  return d < ${f(m.shallowTo)}
    ? vec4(${linear(m.shallow)}, ${f(m.shallowCover)} * shallow * shallow)
    : vec4(${linear(m.deep)}, ${f(m.deepCover)} * deep);
}
// Syvyyskäyrä 0–1: w on syvyyden muutos pikselin matkalla (fwidth).
float depthContour(float d, float w) {
  float line = 0.0;
${m.contours
  .map((c) => `  line = max(line, 1.0 - smoothstep(0.0, 1.2 * w, abs(d - ${f(c)})));`)
  .join('\n')}
  // Tasaisella pohjalla käyrä leviäisi laikuksi: jätetään pois.
  return line * smoothstep(0.0005, 0.004, w);
}
`;

/** Tarvitsee uniformit `uLookSharp` ja `uLookModern` (`LOOK_UNIFORMS`, `engine/look.ts`). */
export const DEPTH_SHADE_GLSL = `uniform float uLookSharp;
uniform float uLookModern;
${bandsGlsl('depthShadeRetro', DEPTH_BANDS)}
${bandsGlsl('depthShadeSharp', SHARP_DEPTH_BANDS)}
${modernGlsl(MODERN_DEPTH)}
vec4 depthShade(float d) {
  if (uLookModern > 0.5) return depthShadeModern(d);
  return uLookSharp > 0.5 ? depthShadeSharp(d) : depthShadeRetro(d);
}
`;

const depthTextures = new WeakMap<LakeBottom, ReturnType<typeof createDepthTexture>>();

/** Syvyystekstuuri lasketaan kerran pohjaa kohden; valikon tausta ja kisat jakavat sen (#327). */
export function depthTextureFor(bottom: LakeBottom): ReturnType<typeof createDepthTexture> {
  let tex = depthTextures.get(bottom);
  if (!tex) depthTextures.set(bottom, (tex = createDepthTexture(bottom)));
  return tex;
}

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
  // Puoliliukuluku: kahdeksan bitin portaat (5 cm) näkyisivät modernin ilmeen
  // syvyyskäyrissä sahalaitana tasaisella pohjalla.
  const data = new Uint16Array(w * h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const d = bottom.depthAt({ x: x0 + (i + 0.5) * c, y: y0 + (j + 0.5) * c });
      data[j * w + i] = THREE.DataUtils.toHalfFloat(Math.min(1, d / DEPTH_TEX_RANGE));
    }
  }
  const texture = new THREE.DataTexture(data, w, h, THREE.RedFormat, THREE.HalfFloatType);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return { texture, bounds: new THREE.Vector4(x0, y0, w * c, h * c) };
}
