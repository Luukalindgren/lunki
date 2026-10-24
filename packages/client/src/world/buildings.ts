import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  pointInRing,
  signedArea,
  terrainHeightAt,
  type LakeMap,
  type LakeSurroundings,
  type Vec2,
} from '@lunki/shared';

/** Seinien värit: punamulta yleisin, sitten keltainen ja vaalea. */
const WALLS = [0x8c1c1c, 0x8c1c1c, 0x8c1c1c, 0xc9a54a, 0xd8d4c4];
const ROOFS = [0x3a3a3a, 0x2a2420, 0x6a1a1a];

interface Footprint {
  center: Vec2;
  /** Pitkän sivun suunta (rad, peli-koordinaateissa). */
  angle: number;
  length: number;
  width: number;
  area: number;
}

/**
 * Rakennukset OSM-pohjapiirroksista POV-näkymää varten: suorakaiderunko ja
 * harjakatto pitkän sivun suuntaan. Kaikki yhdeksi verkoksi.
 */
export function createBuildings(s: LakeSurroundings): THREE.Mesh | null {
  const parts: THREE.BufferGeometry[] = [];
  s.areas
    .filter((a) => a.kind === 'building')
    .forEach((a, i) => {
      const f = footprint(a.rings[0]!);
      // Sauna tai vaja matala, talot yksikerroksisia, isot rakennukset korkeampia.
      const wallH = f.area < 25 ? 2.4 : f.area < 150 ? 3 : 4.5;
      const rise = Math.min(4, f.width * 0.35);
      const base = Math.max(0, terrainHeightAt(s.terrain, f.center)) - 0.6;
      const walls = new THREE.BoxGeometry(f.width, wallH + 0.6, f.length).toNonIndexed();
      walls.translate(0, (wallH + 0.6) / 2, 0);
      const roofShape = new THREE.Shape([
        new THREE.Vector2(-f.width / 2 - 0.3, 0),
        new THREE.Vector2(f.width / 2 + 0.3, 0),
        new THREE.Vector2(0, rise),
      ]);
      const roof = new THREE.ExtrudeGeometry(roofShape, {
        depth: f.length + 0.4,
        bevelEnabled: false,
      });
      roof.translate(0, wallH + 0.6, -(f.length + 0.4) / 2);
      paint(walls, WALLS[i % WALLS.length]!);
      paint(roof, ROOFS[(i * 7) % ROOFS.length]!);
      for (const g of [walls, roof]) {
        // Paikallinen z-akseli pitkän sivun suuntaan; maailmassa z = -y.
        g.rotateY(Math.atan2(Math.cos(f.angle), -Math.sin(f.angle)));
        g.translate(f.center.x, base, -f.center.y);
        g.deleteAttribute('uv');
        parts.push(g);
      }
    });
  if (parts.length === 0) return null;
  const geometry = mergeGeometries(parts);
  parts.forEach((g) => g.dispose());
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  );
  mesh.name = 'buildings';
  return mesh;
}

export interface Pier {
  /** Rannasta järvelle. */
  from: Vec2;
  to: Vec2;
}

/** Laiturin pituus (m) ja suurin rakennuksen etäisyys rannasta (m). */
const PIER_LENGTH = { min: 7, max: 13 };
const PIER_REACH = 45;
const PIER_SPACING = 50;

/**
 * Laiturit: OSM:ssä niitä ei tältä järveltä ole, joten rannan mökeille
 * päätellään laituri lähimpään rantaan. Kahden laiturin väli on vähintään
 * PIER_SPACING, ja laiturin pitää olla koko matkaltaan vedessä.
 */
export function planPiers(map: LakeMap, s: LakeSurroundings): Pier[] {
  const piers: Pier[] = [];
  const isWater = (p: Vec2) =>
    pointInRing(p, map.shore) && !map.islands.some((isl) => pointInRing(p, isl));
  for (const a of s.areas) {
    if (a.kind !== 'building') continue;
    const f = footprint(a.rings[0]!);
    if (f.area > 200) continue;
    const q = closestOnRing(f.center, map.shore);
    const dist = Math.hypot(q.x - f.center.x, q.y - f.center.y);
    if (dist > PIER_REACH || dist < 1) continue;
    if (piers.some((p) => Math.hypot(p.from.x - q.x, p.from.y - q.y) < PIER_SPACING)) continue;
    const dir = { x: (q.x - f.center.x) / dist, y: (q.y - f.center.y) / dist };
    // Pituus vaihtelee rakennuksen paikan mukaan, mutta on aina sama.
    const len =
      PIER_LENGTH.min +
      ((Math.abs(f.center.x * 7 + f.center.y * 13) % 100) / 100) *
        (PIER_LENGTH.max - PIER_LENGTH.min);
    const at = (d: number) => ({ x: q.x + dir.x * d, y: q.y + dir.y * d });
    let ok = true;
    for (let d = 1; d <= len; d += 1) if (!isWater(at(d))) ok = false;
    if (ok) piers.push({ from: at(-1.5), to: at(len) });
  }
  return piers;
}

/** Laiturit kansilankkuineen ja paaluineen; näkyvät kummassakin näkymässä. */
export function createPiers(piers: readonly Pier[]): THREE.Mesh | null {
  const parts: THREE.BufferGeometry[] = [];
  for (const p of piers) {
    const len = Math.hypot(p.to.x - p.from.x, p.to.y - p.from.y);
    const angle = Math.atan2(p.to.x - p.from.x, -(p.to.y - p.from.y));
    const mid = { x: (p.from.x + p.to.x) / 2, y: (p.from.y + p.to.y) / 2 };
    const piece = (g: THREE.BufferGeometry, color: number) => {
      paint(g, color);
      g.rotateY(angle);
      g.translate(mid.x, 0, -mid.y);
      g.deleteAttribute('uv');
      parts.push(g);
    };
    piece(new THREE.BoxGeometry(1.6, 0.15, len).translate(0, 0.45, 0).toNonIndexed(), 0x8a6a42);
    for (let d = -len / 2 + 1; d <= len / 2; d += 2.5)
      for (const side of [-0.7, 0.7])
        piece(
          new THREE.BoxGeometry(0.15, 1.2, 0.15).translate(side, -0.2, d).toNonIndexed(),
          0x5a3d22,
        );
  }
  if (parts.length === 0) return null;
  const geometry = mergeGeometries(parts);
  parts.forEach((g) => g.dispose());
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  );
  mesh.name = 'piers';
  return mesh;
}

/** Pohjapiirroksen suorakaide: pisimmän sivun suunta ja laajuus sen mukaan. */
export function footprint(ring: readonly Vec2[]): Footprint {
  let angle = 0;
  let longest = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len > longest) {
      longest = len;
      angle = Math.atan2(b.y - a.y, b.x - a.x);
    }
  }
  const u = { x: Math.cos(angle), y: Math.sin(angle) };
  const v = { x: -u.y, y: u.x };
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (const p of ring) {
    const pu = p.x * u.x + p.y * u.y;
    const pv = p.x * v.x + p.y * v.y;
    minU = Math.min(minU, pu);
    maxU = Math.max(maxU, pu);
    minV = Math.min(minV, pv);
    maxV = Math.max(maxV, pv);
  }
  const cu = (minU + maxU) / 2;
  const cv = (minV + maxV) / 2;
  let length = maxU - minU;
  let width = maxV - minV;
  if (width > length) {
    [length, width] = [width, length];
    angle += Math.PI / 2;
  }
  return {
    center: { x: u.x * cu + v.x * cv, y: u.y * cu + v.y * cv },
    angle,
    length: Math.max(2, length),
    width: Math.max(2, width),
    area: Math.abs(signedArea(ring as Vec2[])),
  };
}

function closestOnRing(p: Vec2, ring: readonly Vec2[]): Vec2 {
  let best = ring[0]!;
  let bestD = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.max(
      0,
      Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)),
    );
    const q = { x: a.x + dx * t, y: a.y + dy * t };
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < bestD) {
      bestD = d;
      best = q;
    }
  }
  return best;
}

function paint(g: THREE.BufferGeometry, hex: number): void {
  const c = new THREE.Color(hex);
  const colors = new Float32Array(g.getAttribute('position').count * 3);
  for (let i = 0; i < colors.length; i += 3) colors.set([c.r, c.g, c.b], i);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}
