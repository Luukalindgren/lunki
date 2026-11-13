import * as THREE from 'three';
import { LandCover, valueNoise, type Vec2 } from '@lunki/shared';
import type { StaticWorld } from '../world/staticWorld';
import type { SceneryColors } from './sceneryColors';
import { paintedMaterial, sstep } from './shapes';
import { ShoreField } from './shoreField';

/** Rantakaistan ruutu (m): tällä tarkkuudella penkka seuraa rantaviivaa. */
const BAND_STEP = 1.5;
/** Rantakaista ulottuu vedestä näin kauas maalle (m) ja näin kauas veteen. */
const BAND_INLAND = 22;
const BAND_WATER = 2.5;
/** Tältä väliltä (m rannasta) kaista laskeutuu karkean maaston alle. */
const BAND_BLEND: readonly [number, number] = [14, 22];
/** Piirtolohkon sivu ruutuina: näkymän ulkopuoliset lohkot jäävät piirtämättä. */
const BAND_CHUNK = 64;
const TERRAIN_CHUNK = 48;
/** Tien, kärrypolun, polun ja puron leveys maastossa (m). */
const LINE_WIDTH = { road: 4, track: 2.6, path: 1.1, stream: 2 } as const;
const LINE_STEP = 4;

/**
 * Penkan korkeus (m) etäisyydellä rannasta: vesirajassa hieman pinnan yllä,
 * jotta hiekka peittää veden reunan, ja kuudessa metrissä reilun metrin
 * korkuinen. Vedessä pohja laskee pinnan alle.
 */
export function bankHeight(d: number, x: number, y: number): number {
  if (d <= 0) return Math.max(-0.45, 0.12 + 0.45 * d);
  return 0.12 + 1.25 * sstep(0, 6, d) + 0.18 * valueNoise(x * 0.25, y * 0.25, 3) * sstep(1, 4, d);
}

/**
 * Modernin ilmeen maanpinta (#650): pelin korkeusmalli (`Ground`) pehmeästi
 * varjostettuna ja rannassa tarkka kaista, jossa maa nousee vedestä penkkana
 * hiekasta nurmeen. Puut, kivet ja rakennukset lukevat korkeuden täältä,
 * jotta ne seisovat penkan päällä.
 */
export class Land {
  readonly shore: ShoreField;
  /** Karkean maaston korkeus ja väri pelin maastoruudukon pisteissä. */
  private readonly heights: Float32Array;
  private readonly tints: Float32Array;

  constructor(
    private readonly world: StaticWorld,
    private readonly colors: SceneryColors,
  ) {
    this.shore = new ShoreField(world.map);
    const g = world.ground;
    const cover = world.surroundings ? new LandCover(world.surroundings) : null;
    this.heights = new Float32Array(g.cols * g.rows);
    this.tints = new Float32Array(g.cols * g.rows * 3);
    const c = new THREE.Color();
    for (let j = 0; j < g.rows; j++) {
      for (let i = 0; i < g.cols; i++) {
        const k = j * g.cols + i;
        const x = g.minX + i * g.cell;
        const y = g.minY + j * g.cell;
        const h = g.heights[k]!;
        if (g.water[k]) {
          this.heights[k] = h;
          c.set(colors.shore[0]);
        } else {
          // Penkka nostaa matalaa rantamaata, mutta aivan rannassa karkea
          // maasto pysyy kaistan alla (sama rinne kuin Ground).
          const d = this.shore.distance(x, y);
          this.heights[k] = Math.max(h, Math.min(bankHeight(d, x, y), -0.4 + d * 0.5));
          const kind = cover?.kindAt({ x, y }) ?? null;
          c.set((kind && colors.areas[kind]) ?? colors.ground);
          // Laikut ja korkeus keventävät tasaista väriä kuin siveltimen jälki.
          const patch =
            valueNoise(x / 55, y / 55, 51) * 0.035 + valueNoise(x / 14, y / 14, 52) * 0.02;
          c.offsetHSL(0, 0, patch + Math.min(0.05, Math.max(0, h) / 600));
        }
        this.tints.set([c.r, c.g, c.b], k * 3);
      }
    }
  }

  /** Maanpinnan korkeus (m): rannassa penkka, kauempana korkeusmalli. */
  heightAt(p: Vec2): number {
    const d = this.shore.signed(p.x, p.y);
    return d >= BAND_INLAND ? this.coarse(p) : this.bandHeight(p.x, p.y, d);
  }

  private coarse(p: Vec2): number {
    return this.world.ground.sample(this.heights, p);
  }

  private bandHeight(x: number, y: number, d: number): number {
    if (d <= 0) return bankHeight(d, x, y);
    const c = this.coarse({ x, y });
    const top = Math.max(bankHeight(d, x, y), c) + 0.04;
    const t = sstep(BAND_BLEND[0], BAND_BLEND[1], d);
    return top + (c - 0.15 - top) * t;
  }

  /** Kaistan väri: hiekka vesirajassa, sitten rantaniitty ja nurmi, lopuksi maankäytön väri. */
  private bandColor(x: number, y: number, d: number, out: THREE.Color): THREE.Color {
    const s = this.colors.shore;
    if (d < 0.5) out.set(s[0]);
    else if (d < 2.2) out.set(s[0]).lerp(tmp.set(s[1]), sstep(0.5, 1.6, d));
    else {
      const n = valueNoise(x * 0.4, y * 0.4, 7) * 0.5 + 0.5;
      out
        .set(s[1])
        .lerp(tmp.set(s[2]), sstep(2, 6, d))
        .lerp(tmp.set(s[3]), n * sstep(4, 12, d));
    }
    const g = this.world.ground;
    if (g.terrain && d > 8) {
      const p = { x, y };
      tmp.setRGB(
        g.sample(this.tints, p, 3, 0),
        g.sample(this.tints, p, 3, 1),
        g.sample(this.tints, p, 3, 2),
      );
      out.lerp(tmp, sstep(8, 16, d));
    }
    return out.offsetHSL(0, 0, valueNoise(x * 1.3, y * 1.3, 1) * 0.03);
  }

  /** Maaston, rantakaistan ja teiden verkot. */
  build(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'modern-land';
    const material = paintedMaterial();
    for (const g of [...this.terrainChunks(), ...this.bandChunks()])
      group.add(new THREE.Mesh(g, material));
    const lines = this.lineMesh();
    if (lines) group.add(lines);
    return group;
  }

  private terrainChunks(): THREE.BufferGeometry[] {
    const g = this.world.ground;
    if (!g.terrain) return [];
    const { cols, rows, cell } = g;
    const n = cols * rows;
    const positions = new Float32Array(n * 3);
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++) {
        const k = j * cols + i;
        positions.set([g.minX + i * cell, this.heights[k]!, -(g.minY + j * cell)], k * 3);
      }
    const id = (i: number, j: number) => j * cols + i;
    return gridChunks(
      cols,
      rows,
      TERRAIN_CHUNK,
      id,
      // Kokonaan järven sisällä olevat ruudut ovat veden alla.
      (i, j) =>
        !(
          g.water[id(i, j)] &&
          g.water[id(i + 1, j)] &&
          g.water[id(i, j + 1)] &&
          g.water[id(i + 1, j + 1)]
        ),
      positions,
      this.tints,
      gridNormals(cols, rows, cell, id, this.heights),
    );
  }

  private bandChunks(): THREE.BufferGeometry[] {
    const { minX, minY, maxX, maxY } = this.world.map.bounds;
    const x0 = minX - BAND_INLAND - BAND_STEP;
    const y0 = minY - BAND_INLAND - BAND_STEP;
    const nx = Math.ceil((maxX - x0 + BAND_INLAND) / BAND_STEP) + 2;
    const ny = Math.ceil((maxY - y0 + BAND_INLAND) / BAND_STEP) + 2;
    const ids = new Int32Array(nx * ny).fill(-1);
    const positions: number[] = [];
    const tints: number[] = [];
    const heights: number[] = [];
    const c = new THREE.Color();
    for (let j = 0; j < ny; j++) {
      const y = y0 + j * BAND_STEP;
      for (let i = 0; i < nx; i++) {
        const x = x0 + i * BAND_STEP;
        if (!this.shore.near(x, y)) continue;
        const d = this.shore.signed(x, y);
        if (d >= BAND_INLAND || d < -BAND_WATER) continue;
        const h = this.bandHeight(x, y, d);
        ids[j * nx + i] = heights.length;
        heights.push(h);
        positions.push(x, h, -y);
        this.bandColor(x, y, d, c);
        tints.push(c.r, c.g, c.b);
      }
    }
    const id = (i: number, j: number) => ids[j * nx + i]!;
    return gridChunks(
      nx,
      ny,
      BAND_CHUNK,
      id,
      (i, j) => id(i, j) >= 0 && id(i + 1, j) >= 0 && id(i, j + 1) >= 0 && id(i + 1, j + 1) >= 0,
      positions,
      tints,
      gridNormals(nx, ny, BAND_STEP, id, heights),
    );
  }

  /** Tiet, polut ja purot nauhoina maaston päällä. */
  private lineMesh(): THREE.Mesh | null {
    const positions: number[] = [];
    const tints: number[] = [];
    const index: number[] = [];
    const c = new THREE.Color();
    for (const line of this.world.surroundings?.lines ?? []) {
      if (line.kind === 'pier') continue;
      const half = LINE_WIDTH[line.kind] / 2;
      c.set(this.colors.lines[line.kind]);
      let open = false;
      for (const { p, nx, ny } of alongLine(line.points, LINE_STEP)) {
        if (this.shore.isWater(p)) {
          open = false;
          continue;
        }
        const at = positions.length / 3;
        for (const side of [-1, 1]) {
          const q = { x: p.x + nx * half * side, y: p.y + ny * half * side };
          positions.push(q.x, this.heightAt(q) + 0.05, -q.y);
          tints.push(c.r, c.g, c.b);
        }
        if (open) index.push(at - 2, at - 1, at, at - 1, at + 1, at);
        open = true;
      }
    }
    if (index.length === 0) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(tints, 3));
    geo.setIndex(index);
    geo.computeVertexNormals();
    // Nauha on aivan maan pinnassa: syvyyssiirto pitää sen näkyvissä kumpareillakin.
    const mesh = new THREE.Mesh(
      geo,
      paintedMaterial({ polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    );
    mesh.name = 'modern-lines';
    return mesh;
  }
}

const tmp = new THREE.Color();

/** Viivan näytteet tasavälein: piste ja vasemmalle osoittava normaali. */
function* alongLine(points: readonly Vec2[], step: number) {
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len === 0) continue;
    const nx = -(b.y - a.y) / len;
    const ny = (b.x - a.x) / len;
    const count = Math.max(1, Math.round(len / step));
    for (let k = 0; k < count; k++) {
      const t = k / count;
      yield { p: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, nx, ny };
    }
    if (i + 2 === points.length) yield { p: b, nx, ny };
  }
}

/**
 * Ruudukon pisteiden normaalit korkeuseroista. Lasketaan koko ruudukolle
 * kerralla, jotta piirtolohkojen saumat eivät näy varjostuksessa.
 */
function gridNormals(
  nx: number,
  ny: number,
  step: number,
  id: (i: number, j: number) => number,
  heights: ArrayLike<number>,
): Float32Array {
  const out = new Float32Array(heights.length * 3);
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const k = id(i, j);
      if (k < 0) continue;
      const at = (a: number, b: number) => {
        const n = a < 0 || b < 0 || a >= nx || b >= ny ? -1 : id(a, b);
        return n < 0 ? heights[k]! : heights[n]!;
      };
      // Pinta on (x, h, −y): normaali on (−dh/dx, 1, dh/dy).
      const hx = (at(i + 1, j) - at(i - 1, j)) / (2 * step);
      const hy = (at(i, j + 1) - at(i, j - 1)) / (2 * step);
      const len = Math.hypot(hx, 1, hy);
      out.set([-hx / len, 1 / len, hy / len], k * 3);
    }
  return out;
}

/**
 * Jakaa ruudukon pinnan piirtolohkoiksi. `id` antaa ruudukon pisteen paikan
 * taulukoissa (tai −1) ja `keep` kertoo, piirretäänkö ruutu, jonka vasen
 * alakulma on (i, j). Lävistäjä on sama kuin `Ground.sample`issa.
 */
function gridChunks(
  nx: number,
  ny: number,
  chunk: number,
  id: (i: number, j: number) => number,
  keep: (i: number, j: number) => boolean,
  positions: ArrayLike<number>,
  tints: ArrayLike<number>,
  normals: ArrayLike<number>,
): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (let j0 = 0; j0 < ny - 1; j0 += chunk) {
    for (let i0 = 0; i0 < nx - 1; i0 += chunk) {
      const local = new Map<number, number>();
      const pos: number[] = [];
      const col: number[] = [];
      const nor: number[] = [];
      const index: number[] = [];
      const vertex = (i: number, j: number): number => {
        const k = id(i, j);
        let v = local.get(k);
        if (v === undefined) {
          v = local.size;
          local.set(k, v);
          for (let n = 0; n < 3; n++) {
            pos.push(positions[k * 3 + n]!);
            col.push(tints[k * 3 + n]!);
            nor.push(normals[k * 3 + n]!);
          }
        }
        return v;
      };
      const i1 = Math.min(i0 + chunk, nx - 1);
      const j1 = Math.min(j0 + chunk, ny - 1);
      for (let j = j0; j < j1; j++)
        for (let i = i0; i < i1; i++) {
          if (!keep(i, j)) continue;
          const a = vertex(i, j);
          const b = vertex(i + 1, j);
          const c = vertex(i, j + 1);
          const d = vertex(i + 1, j + 1);
          // Vastapäivään ylhäältä katsottuna: pinta näkyy ylhäältä.
          index.push(a, b, c, b, d, c);
        }
      if (index.length === 0) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      geo.setIndex(index);
      out.push(geo);
    }
  }
  return out;
}
