import * as THREE from 'three';
import { coverVisibility, type BottomSource } from '../world/bottomMesh';
import { clipToSwellPatch } from '../world/lakeMesh';
import { blob, mergeParts, mixColor, paint, paintedMaterial, seeded, solid } from './shapes';

/** Veden sävy, johon syvemmällä oleva kivi tai kasvi hiipuu. */
const WATER_TINT = 0x2f6f84;
const ROCK = [0x6f8388, 0x8a9a9a] as const;
const ROCK_SHADE = 0x1c3a44;
const TRUNK = 0x5a5244;
const WEED = [0x3f7a3a, 0x559048] as const;
const BRUSH = 0x5a4630;
/** Kappaleet ovat aivan pinnassa (m), kuten Retron laikut. */
const SURFACE = 0.03;

/**
 * Pohjan rakenteet modernilla ilmeellä (#650): kivikot ja kaatuneet puut
 * pyöreinä muotoina veden pinnassa (`rocks`), ja matalassa kuultavat kivet,
 * kasvustot ja risukot (`shallow`), jotka näkyvät vain ylhäältä ja hiipuvat
 * veden sävyyn syvyyden mukaan. Paikat ja määrät ovat samat kuin Retrossa
 * (`world/bottomMesh.ts`).
 */
export function createLakeBed({ bottom, waves }: BottomSource): {
  rocks: THREE.Mesh | null;
  shallow: THREE.Mesh | null;
} {
  const rand = seeded(11);
  const rocks: THREE.BufferGeometry[] = [];
  const shallow: THREE.BufferGeometry[] = [];
  const stone = (x: number, y: number, size: number, tone: number, detail: number) => {
    const geo = blob(rand, size, 0.3, 0.2, 1.5, [x, SURFACE, -y], detail);
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
  ) => {
    const len = Math.hypot(bx - ax, by - ay);
    return paint(
      solid(
        new THREE.CylinderGeometry(r1, r0, len, 8)
          .rotateZ(Math.PI / 2)
          .rotateY(Math.atan2(by - ay, bx - ax))
          .translate((ax + bx) / 2, SURFACE, -(ay + by) / 2),
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
      const seen = coverVisibility(bottom.depthAt(s.pos) - (s.height ?? 0));
      if (seen <= 0) continue;
      const fade = 1 - seen;
      if (s.kind === 'boulder') {
        shallow.push(
          stone(s.pos.x, s.pos.y, s.radius * 0.9, mixColor(0x7d8f8c, WATER_TINT, fade).getHex(), 2),
        );
      } else if (s.kind === 'weed') {
        const n = Math.round(s.radius * s.radius * 0.2 * (s.density ?? 1));
        for (let i = 0; i < n; i++) {
          const r = s.radius * Math.sqrt(rand());
          const a = rand() * Math.PI * 2;
          const tone = mixColor(WEED[rand() < 0.5 ? 0 : 1], WATER_TINT, fade * 0.8).getHex();
          const geo = blob(
            rand,
            0.3 + rand() * 0.4,
            0.15,
            0.3,
            2,
            [s.pos.x + Math.cos(a) * r, SURFACE, -(s.pos.y + Math.sin(a) * r)],
            1,
          );
          shallow.push(paint(geo, () => tone));
        }
      } else {
        const tone = mixColor(BRUSH, WATER_TINT, fade * 0.8).getHex();
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
              tone,
            ),
          );
        }
      }
    }
  }
  // Lähiveden aallokon kohdalla kappaleet jätetään piirtämättä, kuten Retron laikut.
  const mesh = (parts: THREE.BufferGeometry[], name: string) => {
    if (parts.length === 0) return null;
    const material = paintedMaterial();
    clipToSwellPatch(material, waves);
    const m = new THREE.Mesh(mergeParts(parts), material);
    m.name = name;
    return m;
  };
  return { rocks: mesh(rocks, 'modern-structures'), shallow: mesh(shallow, 'modern-shallow') };
}
