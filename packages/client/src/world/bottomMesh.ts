import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { LakeBottom } from '@lunki/shared';
import { depthTextureFor } from './depthShade';
import { clipToSwellPatch, type WaterWaves } from './lakeMesh';

/**
 * Pohjan näkyvät osat ylhäältä: kivikot ja kaatuneet puut sekä matalassa
 * veden läpi kuultavat kivet, kasvustot ja risukot. Syvyyden mukaisen sävyn
 * piirtää vesishaderi syvyystekstuurista (ks. depthShade).
 */
export function createBottomMesh(bottom: LakeBottom, waves: WaterWaves): THREE.Group {
  const group = new THREE.Group();
  group.name = 'bottom';
  const depth = depthTextureFor(bottom);
  waves.uDepthTex.value = depth.texture;
  waves.uDepthBounds.value.copy(depth.bounds);
  waves.uBottomShadeOn.value = 1;
  const structures = createStructures(bottom);
  if (structures) {
    clipToSwellPatch(structures.material as THREE.Material, waves);
    group.add(structures);
  }
  const shallow = createShallowCover(bottom);
  if (shallow) {
    clipToSwellPatch(shallow.material as THREE.Material, waves);
    group.add(shallow);
  }
  return group;
}

/** Näin matalalla (m pinnasta) olevat kivet ja kasvustot kuultavat veden läpi. */
export const SEE_THROUGH_DEPTH = 1.5;

/**
 * Kuinka selvästi pohjan rakenne näkyy pinnalle: 1 pintaan asti ulottuvalla,
 * hiipuu nollaan SEE_THROUGH_DEPTH-syvyydessä.
 */
export function coverVisibility(topDepth: number): number {
  return Math.max(0, Math.min(1, 1 - topDepth / SEE_THROUGH_DEPTH));
}

/**
 * Siroitellut kivet, kasvustot ja risukot (#226) läpikuultavina laikkuina,
 * vain matalassa: syvemmällä niitä ei näe pinnalta, kuten ei oikeastikaan.
 */
function createShallowCover(bottom: LakeBottom): THREE.Mesh | null {
  const parts: THREE.BufferGeometry[] = [];
  let seed = 29;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const piece = (
    x: number,
    y: number,
    w: number,
    l: number,
    angle: number,
    color: number,
    alpha: number,
  ) => {
    const g = new THREE.PlaneGeometry(l, w);
    g.rotateZ(angle);
    g.rotateX(-Math.PI / 2);
    g.translate(x, 0.012, -y);
    const c = new THREE.Color(color);
    const colors = new Float32Array(g.getAttribute('position').count * 4);
    for (let i = 0; i < colors.length; i += 4) colors.set([c.r, c.g, c.b, alpha], i);
    g.setAttribute('color', new THREE.BufferAttribute(colors, 4));
    g.deleteAttribute('uv');
    g.deleteAttribute('normal');
    parts.push(g);
  };
  for (const s of bottom.structures) {
    if (s.kind !== 'boulder' && s.kind !== 'weed' && s.kind !== 'brush') continue;
    const depth = bottom.depthAt(s.pos);
    const alpha = coverVisibility(depth - (s.height ?? 0));
    if (alpha <= 0) continue;
    if (s.kind === 'boulder') {
      const size = s.radius * 1.6;
      piece(s.pos.x, s.pos.y, size, size * (0.8 + rand() * 0.4), rand() * Math.PI, 0x4b524f, alpha);
    } else if (s.kind === 'weed') {
      // Kasvusto: tiheydestä riippuva määrä tummanvihreitä tupsuja.
      const n = Math.round(s.radius * s.radius * 0.25 * (s.density ?? 1));
      for (let i = 0; i < n; i++) {
        const r = s.radius * Math.sqrt(rand());
        const a = rand() * Math.PI * 2;
        const size = 0.5 + rand() * 0.9;
        piece(
          s.pos.x + Math.cos(a) * r,
          s.pos.y + Math.sin(a) * r,
          size,
          size * (1 + rand()),
          rand() * Math.PI,
          rand() < 0.5 ? 0x2f5a2a : 0x41702f,
          alpha * 0.85,
        );
      }
    } else {
      // Risukko: ristikkäisiä keppejä.
      for (let i = 0; i < 6; i++) {
        const a = rand() * Math.PI;
        piece(
          s.pos.x + (rand() - 0.5) * s.radius,
          s.pos.y + (rand() - 0.5) * s.radius,
          0.15,
          s.radius * (0.8 + rand() * 0.6),
          a,
          0x4a3420,
          alpha,
        );
      }
    }
  }
  if (parts.length === 0) return null;
  const geometry = mergeGeometries(parts);
  parts.forEach((g) => g.dispose());
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }),
  );
  mesh.name = 'shallow-cover';
  return mesh;
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
