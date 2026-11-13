import * as THREE from 'three';
import { footprint, PIER_WIDTH, type LakeSurroundings, type Pier } from '@lunki/shared';
import type { Land } from './land';
import { box, mergeParts, mixColor, paint, paintedMaterial, seeded, solid } from './shapes';

/** Piirtolohkon sivu (m). */
const CHUNK = 300;
/** Seinät: punamulta yleisin, sitten keltainen ja vaalea. Katot: huopa ja tiili. */
const WALLS = [0xb5463a, 0xb5463a, 0xb5463a, 0xe3c268, 0xece6d2];
const ROOFS = [0x74707c, 0x5e5a70, 0x9a4a3a];
const TRIM = 0xf2efe6;
const TRIM_ON_LIGHT = 0x6a7a6a;
const PLINTH = 0x7a7872;
const GLASS = 0x2a3a4c;
const CHIMNEY = 0x8a4a3a;
/** Laiturin lankut, palkit ja paalut. */
const PLANKS = [0x9a8468, 0x8c7a60, 0xa58f72];
const BEAM = 0x6f5c46;
const POST = 0x6a5440;
/** Laiturin kannen yläpinta (m vedestä), sama kuin Retron laiturilla. */
const DECK = 0.525;

/**
 * Mökit ja muut rakennukset pohjapiirroksista (#650): sokkeli, laudoitettu
 * runko nurkkalautoineen, harjakatto räystäineen, ikkunat pitkillä sivuilla,
 * ovi päädyssä ja isoissa savupiippu. Mitat ovat samat kuin Retron
 * rakennuksilla (`world/buildings.ts`).
 */
export function createCottages(s: LakeSurroundings, land: Land): THREE.Group {
  const group = new THREE.Group();
  group.name = 'modern-buildings';
  const chunks = new Map<string, THREE.BufferGeometry[]>();
  s.areas
    .filter((a) => a.kind === 'building')
    .forEach((a, i) => {
      const ring = a.rings[0]!;
      const f = footprint(ring);
      const W = f.width;
      const L = f.length;
      // Sauna tai vaja matala, talot yksikerroksisia, isot rakennukset korkeampia.
      const wallH = f.area < 25 ? 2.4 : f.area < 150 ? 3 : 4.5;
      const rise = Math.min(4, W * 0.42);
      // Rinteessä sokkeli jatkuu alarinteen puolelle, jottei talo leiju.
      const heights = [f.center, ...ring].map((p) => land.heightAt(p));
      const base = Math.min(...heights) - 0.3;
      const eaves = Math.max(...heights) - base + wallH;
      const wall = WALLS[i % WALLS.length]!;
      const roof = ROOFS[(i * 7) % ROOFS.length]!;
      const trim = wall === WALLS[4] ? TRIM_ON_LIGHT : TRIM;
      const body = eaves - 0.5;
      const parts: THREE.BufferGeometry[] = [
        box(W + 0.16, 0.5, L + 0.16, 0, 0.25, 0, PLINTH),
        box(W, body, L, 0, 0.5 + body / 2, 0, wall),
      ];
      for (const sx of [-1, 1])
        for (const sz of [-1, 1])
          parts.push(box(0.14, body, 0.14, (sx * W) / 2, 0.5 + body / 2, (sz * L) / 2, trim));
      // Päätykolmiot ja katto räystäineen.
      const gable = new THREE.Shape([
        new THREE.Vector2(-W / 2, 0),
        new THREE.Vector2(W / 2, 0),
        new THREE.Vector2(0, rise),
      ]);
      parts.push(
        paint(
          solid(
            new THREE.ExtrudeGeometry(gable, { depth: L, bevelEnabled: false }).translate(
              0,
              eaves,
              -L / 2,
            ),
          ),
          () => wall,
        ),
      );
      const slope = Math.atan2(rise, W / 2);
      const pane = Math.hypot(rise, W / 2) + 0.45;
      for (const sx of [-1, 1])
        parts.push(
          paint(
            solid(
              new THREE.BoxGeometry(pane, 0.14, L + 0.8)
                .translate(-pane / 2 + 0.02, sx * 0.07, 0)
                .rotateZ(sx > 0 ? slope : Math.PI - slope)
                .translate(0, eaves + rise, 0)
                .toNonIndexed(),
            ),
            () => roof,
          ),
        );
      if (f.area > 30)
        parts.push(box(0.6, 1.3, 0.6, W * 0.18, eaves + rise * 0.7 + 0.3, L * 0.2, CHIMNEY));
      // Ikkunat pitkillä sivuilla: vuorilaudat, lasi ja puitteet ristinä.
      const windows = Math.max(1, Math.round(L / 3.2));
      const sill = 0.5 + body * 0.55;
      for (const sx of [-1, 1])
        for (let k = 0; k < windows; k++) {
          const z = -L / 2 + (k + 0.5) * (L / windows);
          const x = sx * (W / 2 + 0.02);
          parts.push(
            box(0.1, 1.15, 1.05, x, sill, z, trim),
            box(0.12, 0.9, 0.8, x + sx * 0.01, sill, z, GLASS),
            box(0.14, 0.9, 0.06, x + sx * 0.01, sill, z, trim),
            box(0.14, 0.06, 0.8, x + sx * 0.01, sill, z, trim),
          );
        }
      parts.push(
        box(1.0, 2.0, 0.1, 0, 1.5, L / 2 + 0.03, trim),
        box(0.8, 1.85, 0.12, 0, 1.45, L / 2 + 0.04, mixColor(wall, 0x000000, 0.45).getHex()),
      );
      // Paikallinen z-akseli pitkän sivun suuntaan; maailmassa z = −y.
      const turn = Math.atan2(Math.cos(f.angle), -Math.sin(f.angle));
      const key = `${Math.floor(f.center.x / CHUNK)},${Math.floor(f.center.y / CHUNK)}`;
      let list = chunks.get(key);
      if (!list) chunks.set(key, (list = []));
      for (const g of parts) {
        g.rotateY(turn);
        g.translate(f.center.x, base, -f.center.y);
        list.push(g);
      }
    });
  const material = paintedMaterial();
  for (const parts of chunks.values()) group.add(new THREE.Mesh(mergeParts(parts), material));
  return group;
}

/** Laiturit: kansi lankku kerrallaan, kannatinpalkit ja pyöreät paalut. */
export function createModernPiers(piers: readonly Pier[]): THREE.Mesh | null {
  const parts: THREE.BufferGeometry[] = [];
  const rand = seeded(7);
  for (const p of piers) {
    const len = Math.hypot(p.to.x - p.from.x, p.to.y - p.from.y);
    const angle = Math.atan2(p.to.x - p.from.x, -(p.to.y - p.from.y));
    const mid = { x: (p.from.x + p.to.x) / 2, y: (p.from.y + p.to.y) / 2 };
    const place = (g: THREE.BufferGeometry) => {
      g.rotateY(angle);
      g.translate(mid.x, 0, -mid.y);
      parts.push(g);
    };
    const board = 0.22;
    const count = Math.max(1, Math.floor(len / board));
    for (let k = 0; k < count; k++) {
      const tone = PLANKS[Math.floor(rand() * PLANKS.length)]!;
      const z = -len / 2 + (k + 0.5) * (len / count);
      place(box(PIER_WIDTH, 0.05, len / count - 0.02, 0, DECK - 0.025, z, tone));
    }
    for (const side of [-1, 1])
      place(box(0.1, 0.14, len, side * (PIER_WIDTH / 2 - 0.25), DECK - 0.12, 0, BEAM));
    for (let d = -len / 2 + 1; d <= len / 2; d += 2.5)
      for (const side of [-1, 1])
        place(
          paint(
            solid(
              new THREE.CylinderGeometry(0.075, 0.085, 1.5, 8)
                .translate(side * (PIER_WIDTH / 2 + 0.06), DECK - 0.65, d)
                .toNonIndexed(),
            ),
            () => POST,
          ),
        );
  }
  if (parts.length === 0) return null;
  const mesh = new THREE.Mesh(mergeParts(parts), paintedMaterial());
  mesh.name = 'modern-piers';
  return mesh;
}
