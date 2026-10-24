import * as THREE from 'three';
import { valueNoise, type LakeMap, type Vec2 } from '@lunki/shared';

/** Metsänreunan etäisyys rantaviivasta maalle (m) ja näytteenväli (m). */
const INLAND = 7;
const STEP = 4;

/**
 * Rannan metsänreuna siluettina POV-näkymää varten: rantaviivaa seuraava
 * seinämä, jonka yläreuna vaihtelee kuin kuusikon ja koivikon latvat.
 * Ylhäältä katsottuna seinämä ei näy, joten se piilotetaan siinä tilassa.
 */
export function createShoreScenery(map: LakeMap): THREE.Group {
  const group = new THREE.Group();
  group.name = 'shore-scenery';
  for (const ring of [map.shore, ...map.islands]) group.add(treeLine(resample(ring, STEP)));
  return group;
}

function treeLine(ring: Vec2[]): THREE.Mesh {
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
    const x = p.x + nx * INLAND;
    const y = p.y + ny * INLAND;
    // Latvojen korkeus: laaja vaihtelu (metsikkö) + terävä (yksittäiset puut).
    const broad = valueNoise(p.x / 90, p.y / 90, 21);
    const spike = Math.abs(valueNoise(p.x / 5, p.y / 5, 22));
    // Korostettu korkeus, jotta metsänreuna erottuu kilometrin päästä.
    const h = 22 + broad * 8 + spike * 10;
    positions.push(x, -0.5, -y, x, h, -y);
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
