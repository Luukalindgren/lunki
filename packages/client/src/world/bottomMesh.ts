import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { LakeBottom } from '@lunki/shared';
import { createDepthTexture } from './depthShade';
import { clipToSwellPatch, type WaterWaves } from './lakeMesh';

/**
 * Pohjan näkyvät osat ylhäältä: kivikot ja kaatuneet puut. Syvyyden mukaisen
 * sävyn piirtää vesishaderi syvyystekstuurista (ks. depthShade).
 */
export function createBottomMesh(bottom: LakeBottom, waves: WaterWaves): THREE.Group {
  const group = new THREE.Group();
  group.name = 'bottom';
  const depth = createDepthTexture(bottom);
  waves.uDepthTex.value = depth.texture;
  waves.uDepthBounds.value.copy(depth.bounds);
  waves.uBottomShadeOn.value = 1;
  const structures = createStructures(bottom);
  if (structures) {
    clipToSwellPatch(structures.material as THREE.Material, waves);
    group.add(structures);
  }
  return group;
}

/** Kivet ja puut yhdeksi verkoksi (yksi piirtokutsu). */
function createStructures(bottom: LakeBottom): THREE.Mesh | null {
  const parts: THREE.BufferGeometry[] = [];
  // Kiinteä siemen: sama järvi näyttää aina samalta.
  let seed = 11;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const piece = (x: number, y: number, w: number, l: number, angle: number, color: number) => {
    const g = new THREE.PlaneGeometry(l, w);
    g.rotateZ(angle);
    g.rotateX(-Math.PI / 2);
    g.translate(x, 0.015, -y);
    const c = new THREE.Color(color);
    const colors = new Float32Array(g.getAttribute('position').count * 3);
    for (let i = 0; i < colors.length; i += 3) colors.set([c.r, c.g, c.b], i);
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.deleteAttribute('uv');
    g.deleteAttribute('normal');
    parts.push(g);
  };
  for (const s of bottom.structures) {
    if (s.kind === 'rocks') {
      const n = Math.round(s.radius * 1.4);
      for (let i = 0; i < n; i++) {
        const r = s.radius * Math.sqrt(rand());
        const a = rand() * Math.PI * 2;
        const size = 0.6 + rand() * 1.1;
        piece(
          s.pos.x + Math.cos(a) * r,
          s.pos.y + Math.sin(a) * r,
          size,
          size * (0.8 + rand() * 0.6),
          rand() * Math.PI,
          rand() < 0.5 ? 0x4b524f : 0x6f7468,
        );
      }
    } else if (s.trunk) {
      const [base, top] = s.trunk;
      const len = Math.hypot(top.x - base.x, top.y - base.y);
      const angle = Math.atan2(top.y - base.y, top.x - base.x);
      piece((base.x + top.x) / 2, (base.y + top.y) / 2, 0.6, len, angle, 0x5a3d22);
      // Oksantynkät molemmin puolin runkoa.
      for (let t = 2; t < len - 0.5; t += 1.6) {
        const side = (t / 1.6) % 2 < 1 ? 1 : -1;
        const ba = angle + side * 0.7;
        const bx = base.x + Math.cos(angle) * t + Math.cos(ba) * 0.8;
        const by = base.y + Math.sin(angle) * t + Math.sin(ba) * 0.8;
        piece(bx, by, 0.3, 1.8, ba, 0x6b4a2b);
      }
    }
  }
  if (parts.length === 0) return null;
  const geometry = mergeGeometries(parts);
  parts.forEach((g) => g.dispose());
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true }));
  mesh.name = 'structures';
  return mesh;
}
