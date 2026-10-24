import { distance, type Vec2 } from '../vec2';
import { closestPointOnSegment } from './geometry';

/**
 * Pohjan erikoismuodot. Muodot kuvataan käsin muokattavassa JSON-tiedostossa
 * (esim. `lunkinjarvi-features.json`) pelin metrikoordinaatteina.
 */
export type BottomFeature =
  /** Matalikko: pohja nousee pehmeästi `depth`-syvyyteen. */
  | { type: 'shoal'; x: number; y: number; radius: number; depth: number; name?: string }
  /** Syvänne: pohja painuu pehmeästi `depth`-syvyyteen. */
  | { type: 'hole'; x: number; y: number; radius: number; depth: number; name?: string }
  /** Jyrkänne: tasanne `depth`-syvyydessä, jonka reuna putoaa jyrkästi. */
  | { type: 'dropoff'; x: number; y: number; radius: number; depth: number; name?: string }
  /** Kivikko: kalat viihtyvät, viehe voi tarttua pohjaan. */
  | { type: 'rocks'; x: number; y: number; radius: number; name?: string }
  /** Kaatunut puu rannasta veteen: hauen vaanimapaikka, viehe voi tarttua. */
  | { type: 'tree'; x: number; y: number; length: number; angle: number; name?: string }
  /** Jyrkkä ranta: pohja syvenee rannasta tavallista nopeammin (kerroin). */
  | { type: 'steep'; x: number; y: number; radius: number; steepness: number; name?: string };

export interface BottomFeatures {
  /** Arvioitu suurin syvyys (m), kun luotausaineistoa ei ole. */
  maxDepth: number;
  features: BottomFeature[];
}

/** Rakenne, johon viehe voi tarttua ja jonka lähellä kalat viihtyvät. */
export interface Structure {
  kind: 'rocks' | 'tree' | 'dropoff';
  /** Keskipiste (puulla rungon puoliväli). */
  pos: Vec2;
  radius: number;
  /** Puun runko janana tyvestä latvaan. */
  trunk?: [Vec2, Vec2];
}

/** Rungon ympäriltä viehe voi tarttua oksiin (m). */
const TREE_REACH = 2.5;

export const BOTTOM = {
  /** Ruudukon koko (m): syvyys esilasketaan ja interpoloidaan. */
  cell: 4,
  /** Syvyys aivan rantaviivalla (m). */
  shoreDepth: 0.3,
  /** Pohjan kaltevuus rannan lähellä (m/m), ennen jyrkkyyskerrointa. */
  slope: 0.07,
  /** Luonnollinen vaihtelu (m) ja sen mittakaava (m). */
  noise: 0.5,
  noiseScale: 60,
  /** Rannan jyrkkyyden vaihtelu rantaa pitkin (osuus). */
  steepnessVariation: 0.45,
} as const;

/**
 * Laskennallinen pohja: syvyys kasvaa etäisyydestä rantaan kohti arvioitua
 * maksimisyvyyttä, rannan jyrkkyys vaihtelee, pinnassa on luonnollista
 * kohinaa ja käsin lisätyt muodot muokkaavat pohjaa. Syvyys lasketaan kerran
 * ruudukkoon (etäisyysmuunnos), joten kysely on nopea.
 */
export class LakeBottom {
  private readonly cols: number;
  private readonly rows: number;
  private readonly depth: Float32Array;
  readonly structures: Structure[];
  readonly maxDepth: number;

  constructor(
    private readonly water: { isWater(p: Vec2): boolean },
    readonly bounds: { minX: number; minY: number; maxX: number; maxY: number },
    readonly features: BottomFeatures,
  ) {
    const c = BOTTOM.cell;
    this.cols = Math.ceil((bounds.maxX - bounds.minX) / c) + 3;
    this.rows = Math.ceil((bounds.maxY - bounds.minY) / c) + 3;
    const wet = new Uint8Array(this.cols * this.rows);
    for (let j = 0; j < this.rows; j++)
      for (let i = 0; i < this.cols; i++)
        wet[j * this.cols + i] = water.isWater(this.cellPos(i, j)) ? 1 : 0;
    const dist = distanceTransform(wet, this.cols, this.rows, c);
    this.depth = new Float32Array(this.cols * this.rows);
    let deepest = 0;
    for (let j = 0; j < this.rows; j++) {
      for (let i = 0; i < this.cols; i++) {
        const k = j * this.cols + i;
        const d = wet[k] ? this.computeDepth(this.cellPos(i, j), dist[k]!) : 0;
        this.depth[k] = d;
        deepest = Math.max(deepest, d);
      }
    }
    this.maxDepth = deepest;
    this.structures = features.features.flatMap((f): Structure[] => {
      if (f.type === 'rocks') return [{ kind: 'rocks', pos: { x: f.x, y: f.y }, radius: f.radius }];
      if (f.type === 'dropoff')
        return [{ kind: 'dropoff', pos: { x: f.x, y: f.y }, radius: f.radius }];
      if (f.type === 'tree') {
        const base = { x: f.x, y: f.y };
        const top = {
          x: f.x + Math.cos(f.angle) * f.length,
          y: f.y + Math.sin(f.angle) * f.length,
        };
        const mid = { x: (base.x + top.x) / 2, y: (base.y + top.y) / 2 };
        return [{ kind: 'tree', pos: mid, radius: f.length / 2 + TREE_REACH, trunk: [base, top] }];
      }
      return [];
    });
  }

  /** Pohjan syvyys (m, positiivinen alaspäin). Maalla 0. */
  depthAt(p: Vec2): number {
    if (!this.water.isWater(p)) return 0;
    const c = BOTTOM.cell;
    const fx = (p.x - this.bounds.minX) / c + 1;
    const fy = (p.y - this.bounds.minY) / c + 1;
    const i = Math.max(0, Math.min(this.cols - 2, Math.floor(fx)));
    const j = Math.max(0, Math.min(this.rows - 2, Math.floor(fy)));
    const tx = Math.max(0, Math.min(1, fx - i));
    const ty = Math.max(0, Math.min(1, fy - j));
    const at = (a: number, b: number) => this.depth[b * this.cols + a]!;
    // Rantaruuduissa naapuri voi olla maata (0): pidetään vesi aina vähintään matalana.
    const d =
      (at(i, j) * (1 - tx) + at(i + 1, j) * tx) * (1 - ty) +
      (at(i, j + 1) * (1 - tx) + at(i + 1, j + 1) * tx) * ty;
    return Math.max(0.2, d);
  }

  /** Rakenne, jonka alueella piste on (kivikko, puun oksat, jyrkänteen reuna), tai null. */
  structureAt(p: Vec2): Structure | null {
    for (const s of this.structures) {
      if (s.trunk) {
        if (distance(closestPointOnSegment(p, s.trunk[0], s.trunk[1]), p) <= TREE_REACH) return s;
      } else if (distance(s.pos, p) <= s.radius) return s;
    }
    return null;
  }

  private cellPos(i: number, j: number): Vec2 {
    return {
      x: this.bounds.minX + (i - 1) * BOTTOM.cell,
      y: this.bounds.minY + (j - 1) * BOTTOM.cell,
    };
  }

  private computeDepth(p: Vec2, shoreDist: number): number {
    const max = this.features.maxDepth;
    let steep = 1 + BOTTOM.steepnessVariation * valueNoise(p.x / 220, p.y / 220, 7);
    for (const f of this.features.features) {
      if (f.type !== 'steep') continue;
      const w = smoothFalloff(distance(p, f), f.radius);
      steep *= 1 + (f.steepness - 1) * w;
    }
    // Kyllästyvä käyrä: rannalla jyrkkyyden mukainen, keskellä lähestyy maksimia.
    const k = BOTTOM.slope * steep;
    let d = BOTTOM.shoreDepth + (max - BOTTOM.shoreDepth) * (1 - Math.exp((-k * shoreDist) / max));
    const n =
      valueNoise(p.x / BOTTOM.noiseScale, p.y / BOTTOM.noiseScale, 1) * 0.7 +
      valueNoise(p.x / (BOTTOM.noiseScale / 3), p.y / (BOTTOM.noiseScale / 3), 2) * 0.3;
    d += n * BOTTOM.noise * Math.min(1, shoreDist / 30);
    for (const f of this.features.features) {
      const r = distance(p, f);
      if (f.type === 'shoal') d = Math.min(d, lerp(d, f.depth, smoothFalloff(r, f.radius)));
      else if (f.type === 'hole') d = Math.max(d, lerp(d, f.depth, smoothFalloff(r, f.radius)));
      else if (f.type === 'dropoff') {
        // Jyrkkä reuna: tasanne ulottuu lähes säteelle asti ja putoaa parissa metrissä.
        const w = Math.max(0, Math.min(1, (f.radius - r) / 3));
        d = lerp(d, Math.min(d, f.depth), w);
      }
    }
    // Rannan lähellä pohja ei voi olla mielivaltaisen syvä.
    return Math.max(0.2, Math.min(d, BOTTOM.shoreDepth + shoreDist * 0.5));
  }
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** 1 keskellä, pehmeästi 0:aan säteen kohdalla. */
function smoothFalloff(r: number, radius: number): number {
  const t = Math.max(0, 1 - r / radius);
  return t * t * (3 - 2 * t);
}

/** Deterministinen arvokohina [-1, 1] (ei riipu satunnaisgeneraattorista). */
export function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const tx = x - xi;
  const ty = y - yi;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const h = (a: number, b: number) => hash(a, b, seed);
  const top = lerp(h(xi, yi), h(xi + 1, yi), sx);
  const bottom = lerp(h(xi, yi + 1), h(xi + 1, yi + 1), sx);
  return lerp(top, bottom, sy);
}

function hash(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return ((h >>> 0) / 4294967295) * 2 - 1;
}

/**
 * Euklidinen etäisyysmuunnos (Felzenszwalb–Huttenlocher): jokaiselle
 * vesiruudulle etäisyys lähimpään maaruutuun metreinä.
 */
function distanceTransform(
  wet: Uint8Array,
  cols: number,
  rows: number,
  cell: number,
): Float32Array {
  const INF = 1e20;
  const f = new Float64Array(Math.max(cols, rows));
  const out = new Float64Array(cols * rows);
  for (let k = 0; k < wet.length; k++) out[k] = wet[k] ? INF : 0;
  const pass = (get: (i: number) => number, set: (i: number, v: number) => void, n: number) => {
    for (let i = 0; i < n; i++) f[i] = get(i);
    const d = edt1d(f, n);
    for (let i = 0; i < n; i++) set(i, d[i]!);
  };
  for (let j = 0; j < rows; j++)
    pass(
      (i) => out[j * cols + i]!,
      (i, v) => (out[j * cols + i] = v),
      cols,
    );
  for (let i = 0; i < cols; i++)
    pass(
      (j) => out[j * cols + i]!,
      (j, v) => (out[j * cols + i] = v),
      rows,
    );
  const res = new Float32Array(cols * rows);
  // Ruudun keskeltä rantaan on keskimäärin puoli ruutua vähemmän.
  for (let k = 0; k < res.length; k++)
    res[k] = wet[k] ? Math.max(0, Math.sqrt(out[k]!) - 0.5) * cell : 0;
  return res;
}

function edt1d(f: Float64Array, n: number): Float64Array {
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = (f[q]! + q * q - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!);
    while (s <= z[k]!) {
      k--;
      s = (f[q]! + q * q - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1]! < q) k++;
    d[q] = (q - v[k]!) * (q - v[k]!) + f[v[k]!]!;
  }
  return d;
}
