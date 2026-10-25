import * as THREE from 'three';
import {
  LandCover,
  signedArea,
  terrainHeightAt,
  valueNoise,
  type AreaKind,
  type LakeMap,
  type LakeSurroundings,
  type Vec2,
} from '@lunki/shared';
import { TREE_BAND } from './vegetation';

/** Maankäyttö, jossa rannalla ei kasva metsää. */
const OPEN_LAND = new Set<AreaKind>(['field', 'residential', 'beach', 'bare', 'water', 'reeds']);

/** Metsänreunan etäisyys rantaviivasta maalle (m) ja näytteenväli (m). Edessä on puuspritejä. */
const INLAND = TREE_BAND + 2;
const STEP = 4;

/**
 * Metsän massa siluettina POV-näkymää varten: rannan puuvyöhykkeen takana
 * rantaviivaa seuraava seinämä, jonka yläreuna vaihtelee kuin kuusikon ja koivikon latvat.
 * Ylhäältä katsottuna seinämä ei näy, joten se piilotetaan siinä tilassa.
 */
export function createShoreScenery(map: LakeMap, surroundings?: LakeSurroundings): THREE.Group {
  const group = new THREE.Group();
  group.name = 'shore-scenery';
  const cover = surroundings ? new LandCover(surroundings) : null;
  const terrain = surroundings?.terrain ?? null;
  group.add(treeLine(resample(map.shore, STEP), cover, terrain, INLAND, 1));
  // Saaret ovat kapeita: siluetti saaren sisään, ja luotojen puut ovat matalampia.
  for (const island of map.islands) {
    const inland = Math.min(INLAND, Math.sqrt(Math.abs(signedArea(island))) / 4);
    group.add(treeLine(resample(island, STEP / 2), cover, terrain, inland, 0.6));
  }
  return group;
}

function treeLine(
  ring: Vec2[],
  cover: LandCover | null,
  terrain: LakeSurroundings['terrain'],
  inland: number,
  heightScale: number,
): THREE.Mesh {
  const n = ring.length;
  const positions: number[] = [];
  const colors: number[] = [];
  const index: number[] = [];
  const dark = new THREE.Color(0x1f3d22);
  const mid = new THREE.Color(0x2d5a2c);
  const birch = new THREE.Color(0x4d7a3a);
  for (let i = 0; i < n; i++) {
    const prev = ring[(i - 1 + n) % n]!;
    const next = ring[(i + 1) % n]!;
    const p = ring[i]!;
    // Vasemmalle käännetty tangentti osoittaa maalle (järvi vastapäivään, saaret myötäpäivään).
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const len = Math.hypot(tx, ty) || 1;
    const nx = ty / len;
    const ny = -tx / len;
    const x = p.x + nx * inland;
    const y = p.y + ny * inland;
    // Latvojen korkeus: laaja vaihtelu (metsikkö) + terävä (yksittäiset puut).
    const broad = valueNoise(p.x / 90, p.y / 90, 21);
    const spike = Math.abs(valueNoise(p.x / 5, p.y / 5, 22));
    // Korostettu korkeus, jotta metsänreuna erottuu kilometrin päästä.
    // Pelloilla, pihoilla ja rannoilla ei ole metsänreunaa.
    const kind = cover?.kindAt({ x, y }) ?? null;
    const open = kind !== null && OPEN_LAND.has(kind);
    const base = Math.max(0, terrainHeightAt(terrain, { x, y })) - 0.5;
    const h = open ? 0.5 : (15 + broad * 6 + spike * 7) * heightScale;
    positions.push(x, base, -y, x, base + h, -y);
    const c = spike > 0.6 ? dark : broad > 0.3 ? birch : mid;
    colors.push(c.r * 0.7, c.g * 0.7, c.b * 0.7, c.r, c.g, c.b);
    const a = i * 2;
    const b = ((i + 1) % n) * 2;
    index.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(index);
  return new THREE.Mesh(
    g,
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }),
  );
}

/** Tasavälinen näytteistys suljetusta rantaviivasta. */
function resample(ring: readonly Vec2[], step: number): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const count = Math.max(1, Math.round(len / step));
    for (let k = 0; k < count; k++) {
      const t = k / count;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}
