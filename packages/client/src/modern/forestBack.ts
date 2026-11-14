import * as THREE from 'three';
import { LandCover, valueNoise, type Vec2 } from '@lunki/shared';
import type { StaticWorld } from '../world/staticWorld';
import { TREE_DENSITY, UNKNOWN_DENSITY } from '../world/vegetation';
import type { Land } from './land';
import type { SceneryColors } from './sceneryColors';
import { mixColor, paintedMaterial } from './shapes';
import { ShoreField } from './shoreField';
import { FOREST_DEPTH } from './trees';

/** Tausta seisoo näin paljon (m) metsän takareunan takana. */
const BEHIND = 4;
/** Ruutu (m), jolla takareunan käyrä haetaan, ja käyrän pätkän jako latvojen kumpuihin. */
const CELL = 8;
const PIECES = 4;
/** Taustan korkeus maasta (m): yltää latvusten alaosaan, ei latvojen yli. */
const HEIGHT = 12.5;
/** Tausta jatkuu näin paljon (m) maan alle, ettei rinteeseen jää rakoa. */
const BURY = 3;
/**
 * Tällä puuston tiheydellä tausta on täyskorkea: pihapiirinkin (0,15) takana
 * on metsää, ja vain puuton maa (pelto, ranta) jää avoimeksi.
 */
const FULL_DENSITY = 0.15;

/** Mäen laki haetaan taustan edestä näin tihein välein (m) koko metsän syvyydeltä. */
const CREST_STEP = 12;

const backField = (world: StaticWorld): ShoreField =>
  new ShoreField(world.map, FOREST_DEPTH + BEHIND + CELL * 2);

/** Yksi taustan pätkä: päätepisteet järveltä katsoen vasemmalta oikealle. */
export interface BackSegment {
  a: Vec2;
  b: Vec2;
}

/**
 * Metsän takareunan käyrä: `FOREST_DEPTH + BEHIND` metrin päässä rannasta
 * kulkeva tasa-arvokäyrä pätkinä. Kapealla niemellä ja saarilla käyrää ei
 * ole, joten niiden puiden välistä näkyy vastaranta kuten ennenkin.
 */
export function planForestBack(world: StaticWorld, shore = backField(world)): BackSegment[] {
  const depth = FOREST_DEPTH + BEHIND;
  const { minX, minY, maxX, maxY } = world.map.bounds;
  const x0 = minX - depth - CELL * 2;
  const y0 = minY - depth - CELL * 2;
  const cols = Math.ceil((maxX - minX + (depth + CELL * 2) * 2) / CELL) + 1;
  const rows = Math.ceil((maxY - minY + (depth + CELL * 2) * 2) / CELL) + 1;
  // Arvo on positiivinen metsän takana ja negatiivinen metsässä ja järvellä.
  const value = new Float32Array(cols * rows);
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++)
      value[j * cols + i] = shore.signed(x0 + i * CELL, y0 + j * CELL) - depth;

  const segments: BackSegment[] = [];
  const cross = (i0: number, j0: number, i1: number, j1: number): Vec2 => {
    const v0 = value[j0 * cols + i0]!;
    const v1 = value[j1 * cols + i1]!;
    const t = v0 / (v0 - v1);
    return { x: x0 + (i0 + (i1 - i0) * t) * CELL, y: y0 + (j0 + (j1 - j0) * t) * CELL };
  };
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < cols - 1; i++) {
      // Ruudun kulmat vastapäivään vasemmasta alakulmasta.
      const corners: readonly (readonly [number, number])[] = [
        [i, j],
        [i + 1, j],
        [i + 1, j + 1],
        [i, j + 1],
      ];
      const inside = corners.map(([ci, cj]) => value[cj * cols + ci]! > 0);
      const cuts: Vec2[] = [];
      for (let k = 0; k < 4; k++) {
        const [ai, aj] = corners[k]!;
        const [bi, bj] = corners[(k + 1) % 4]!;
        if (inside[k] !== inside[(k + 1) % 4]) cuts.push(cross(ai, aj, bi, bj));
      }
      // Satulassa (neljä leikkausta) pätkät yhdistetään järjestyksessä: rako jää ruudun sisään.
      for (let k = 0; k + 1 < cuts.length; k += 2) {
        const a = cuts[k]!;
        const b = cuts[k + 1]!;
        // Järvi on katsojan takana: metsän puoli (pienempi arvo) jää pätkän eteen.
        const nx = b.y - a.y;
        const ny = a.x - b.x;
        const len = Math.hypot(nx, ny);
        if (len < 0.01) continue;
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const ox = (nx / len) * 4;
        const oy = (ny / len) * 4;
        const front = shore.signed(mx + ox, my + oy) < shore.signed(mx - ox, my - oy);
        segments.push(front ? { a, b } : { a: b, b: a });
      }
    }
  }
  return segments;
}

/** Taustan korkeus (m) pisteessä: metsässä latvusten alaosaan, aukealla nolla. */
export function backHeight(cover: LandCover | null, p: Vec2): number {
  const kind = cover?.kindAt(p) ?? null;
  const density = kind === null ? UNKNOWN_DENSITY : (TREE_DENSITY[kind] ?? 0);
  const full = Math.min(1, density / FULL_DENSITY);
  if (full <= 0) return 0;
  // Laaja vaihtelu metsiköittäin ja kumpuileva yläreuna kuin latvojen rivi.
  const broad = valueNoise(p.x / 70, p.y / 70, 61) * 2.5;
  const crowns = Math.abs(valueNoise(p.x / 5, p.y / 5, 62)) * 3;
  return full * (HEIGHT + broad + crowns);
}

/**
 * Taustan alareunan korkeus (m): maan pinta taustan kohdalla tai sen edessä
 * olevan mäen laki, jos se on korkeammalla. Mäen takana maa laskee, ja ilman
 * tätä laella seisovien puiden rungot jäisivät taivasta vasten.
 */
export function backBase(land: Land, shore: ShoreField, p: Vec2): number {
  // Rannan suunta on etäisyyden laskusuunta.
  const gx = shore.signed(p.x + 2, p.y) - shore.signed(p.x - 2, p.y);
  const gy = shore.signed(p.x, p.y + 2) - shore.signed(p.x, p.y - 2);
  const len = Math.hypot(gx, gy);
  let base = land.heightAt(p);
  if (len < 0.01) return base;
  for (let d = CREST_STEP; d < FOREST_DEPTH; d += CREST_STEP)
    base = Math.max(base, land.heightAt({ x: p.x - (gx / len) * d, y: p.y - (gy / len) * d }));
  return base;
}

/**
 * Metsän tausta (Luukan palaute 14.11.2026): metsän takareunassa kulkeva
 * tumma seinämä, joka näkyy runkojen välistä metsän hämäränä. Ilman sitä
 * mäntyjen ja koivujen runkojen välistä paistoi taivas, ja kaukainen metsä
 * näytti riviltä tikkuja. Seinämä yltää latvusten alaosaan, joten latvat
 * piirtyvät edelleen taivasta vasten. Ylhäältä pystysuora seinämä ei näy.
 */
export function createForestBack(
  world: StaticWorld,
  land: Land,
  colors: SceneryColors,
): THREE.Mesh {
  const cover = world.surroundings ? new LandCover(world.surroundings) : null;
  const positions: number[] = [];
  const tints: number[] = [];
  const dark = new THREE.Color();
  const light = new THREE.Color();
  const corner = (p: Vec2, h: number, c: THREE.Color) => {
    positions.push(p.x, h, -p.y);
    tints.push(c.r, c.g, c.b);
  };
  const shore = backField(world);
  for (const { a, b } of planForestBack(world, shore)) {
    for (let k = 0; k < PIECES; k++) {
      const p = lerp(a, b, k / PIECES);
      const q = lerp(a, b, (k + 1) / PIECES);
      const hp = backHeight(cover, p);
      const hq = backHeight(cover, q);
      if (hp <= 0 && hq <= 0) continue;
      const gp = backBase(land, shore, p);
      const gq = backBase(land, shore, q);
      // Havujen varjon sävy: alhaalla lähes musta vihreä, ylhäällä latvusten alapinta.
      const mix = valueNoise(p.x / 45, p.y / 45, 63) * 0.5 + 0.5;
      const tone = mixColor(colors.spruce[3], colors.pine[3], mix * 0.6);
      dark.copy(tone).multiplyScalar(0.55);
      light.copy(tone).multiplyScalar(0.85);
      corner(p, land.heightAt(p) - BURY, dark);
      corner(q, land.heightAt(q) - BURY, dark);
      corner(q, gq + hq, light);
      corner(p, land.heightAt(p) - BURY, dark);
      corner(q, gq + hq, light);
      corner(p, gp + hp, light);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(tints, 3));
  // Valo osuu seinämään kuin maahan: pystypinnan oma normaali kirkastaisi sen
  // auringon puolelta ja tekisi metsän hämärästä vihreän aidan.
  const normals = new Float32Array(positions.length);
  for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  const mesh = new THREE.Mesh(geo, paintedMaterial());
  mesh.name = 'modern-forest-back';
  return mesh;
}

const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
