import * as THREE from 'three';
import type { BottomSource } from '../world/bottomMesh';
import { clipToSwellPatch } from '../world/lakeMesh';
import { coverVisibility, submerge } from '../world/submerged';
import { blob, mergeParts, mixColor, paint, paintedMaterial, seeded, solid } from './shapes';

const ROCK = [0x6f8388, 0x8a9a9a] as const;
const ROCK_SHADE = 0x1c3a44;
const TRUNK = 0x5a5244;
const WEED = [0x3f7a3a, 0x559048] as const;
const BRUSH = 0x5a4630;
/** Kivikot ja rungot ovat aivan pinnassa (m), kuten Retron laikut. */
const SURFACE = 0.03;
/** Matalan veden rakenteen laki on vähintään näin syvällä (m): se ei riko pintaa. */
const TOP_MIN = 0.1;

/**
 * Pohjan rakenteet modernilla ilmeellä (#650): kivikot ja kaatuneet puut
 * pyöreinä muotoina veden pinnassa (`rocks`), ja matalassa kuultavat kivet,
 * kasvustot ja risukot (`shallow`). Ne ovat pohjassa oikealla syvyydellään
 * ja näkyvät veden läpi kaikissa näkymissä sitä heikommin, mitä syvemmällä
 * ne ovat (`submerge`). Paikat ja määrät ovat samat kuin Retrossa
 * (`world/bottomMesh.ts`).
 */
export function createLakeBed({ bottom, waves }: BottomSource): {
  rocks: THREE.Mesh | null;
  shallow: THREE.Mesh | null;
} {
  const rand = seeded(11);
  const rocks: THREE.BufferGeometry[] = [];
  const shallow: THREE.BufferGeometry[] = [];
  const stone = (
    x: number,
    y: number,
    size: number,
    tone: number,
    detail: number,
    height = SURFACE,
    flat = 0.3,
  ) => {
    const geo = blob(rand, size, flat, 0.2, 1.5, [x, height, -y], detail);
    const shade = mixColor(tone, ROCK_SHADE, 0.5).getHex();
    return paint(geo, (_x, _y, _z, upward) => mixColor(shade, tone, upward));
  };
  const log = (
    ax: number,
    ay: number,
    bx: number,
    by: number,
    r0: number,
    r1: number,
    tone: number,
    height = SURFACE,
  ) => {
    const len = Math.hypot(bx - ax, by - ay);
    return paint(
      solid(
        new THREE.CylinderGeometry(r1, r0, len, 8)
          .rotateZ(Math.PI / 2)
          .rotateY(Math.atan2(by - ay, bx - ax))
          .translate((ax + bx) / 2, height, -(ay + by) / 2),
      ),
      () => tone,
    );
  };
  for (const s of bottom.structures) {
    if (s.kind === 'rocks') {
      const n = Math.round(s.radius * 1.4);
      for (let i = 0; i < n; i++) {
        const r = s.radius * Math.sqrt(rand());
        const a = rand() * Math.PI * 2;
        const tone = ROCK[rand() < 0.5 ? 0 : 1];
        rocks.push(
          stone(s.pos.x + Math.cos(a) * r, s.pos.y + Math.sin(a) * r, 0.35 + rand() * 0.6, tone, 1),
        );
      }
    } else if (s.trunk) {
      const [base, top] = s.trunk;
      rocks.push(log(base.x, base.y, top.x, top.y, 0.3, 0.12, TRUNK));
      // Oksantynkät molemmin puolin runkoa.
      const len = Math.hypot(top.x - base.x, top.y - base.y);
      const angle = Math.atan2(top.y - base.y, top.x - base.x);
      for (let t = 2; t < len - 0.5; t += 1.6) {
        const side = (t / 1.6) % 2 < 1 ? 1 : -1;
        const x = base.x + Math.cos(angle) * t;
        const y = base.y + Math.sin(angle) * t;
        const reach = angle + side * 0.7;
        rocks.push(
          log(x, y, x + Math.cos(reach) * 1.6, y + Math.sin(reach) * 1.6, 0.08, 0.04, TRUNK),
        );
      }
    } else if (s.kind === 'boulder' || s.kind === 'weed' || s.kind === 'brush') {
      // Rakenteen laki pinnasta (m): syvemmällä kuin näkyvyys sitä ei tehdä.
      const top = Math.max(TOP_MIN, bottom.depthAt(s.pos) - (s.height ?? 0));
      if (coverVisibility(top) <= 0) continue;
      if (s.kind === 'boulder') {
        // Pyöreähkö kivi, jonka laki on rakenteen korkeudella pohjasta.
        const size = s.radius * 0.9;
        shallow.push(stone(s.pos.x, s.pos.y, size, 0x7d8f8c, 2, -top - size * 0.6, 0.6));
      } else if (s.kind === 'weed') {
        const n = Math.round(s.radius * s.radius * 0.2 * (s.density ?? 1));
        for (let i = 0; i < n; i++) {
          const r = s.radius * Math.sqrt(rand());
          const a = rand() * Math.PI * 2;
          const tone = WEED[rand() < 0.5 ? 0 : 1];
          const geo = blob(
            rand,
            0.3 + rand() * 0.4,
            0.5,
            0.3,
            2,
            [s.pos.x + Math.cos(a) * r, -top - 0.15, -(s.pos.y + Math.sin(a) * r)],
            1,
          );
          shallow.push(paint(geo, () => tone));
        }
      } else {
        for (let i = 0; i < 6; i++) {
          const a = rand() * Math.PI;
          const half = (s.radius * (0.8 + rand() * 0.6)) / 2;
          const x = s.pos.x + (rand() - 0.5) * s.radius;
          const y = s.pos.y + (rand() - 0.5) * s.radius;
          shallow.push(
            log(
              x - Math.cos(a) * half,
              y - Math.sin(a) * half,
              x + Math.cos(a) * half,
              y + Math.sin(a) * half,
              0.07,
              0.05,
              BRUSH,
              -top - 0.07,
            ),
          );
        }
      }
    }
  }
  // Pinnassa makaavat kappaleet jätetään lähiveden aallokon kohdalla
  // piirtämättä, kuten Retron laikut; pohjassa olevat näkyvät veden läpi.
  const mesh = (parts: THREE.BufferGeometry[], name: string, sunk: boolean) => {
    if (parts.length === 0) return null;
    const material = paintedMaterial();
    if (sunk) submerge(material);
    else clipToSwellPatch(material, waves);
    const m = new THREE.Mesh(mergeParts(parts), material);
    m.name = name;
    return m;
  };
  return {
    rocks: mesh(rocks, 'modern-structures', false),
    shallow: mesh(shallow, 'modern-shallow', true),
  };
}
