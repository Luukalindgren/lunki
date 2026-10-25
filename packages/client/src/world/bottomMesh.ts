import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { LakeBottom } from '@lunki/shared';
import { clipToSwellPatch, type WaterWaves } from './lakeMesh';

/** Syvyysvyöhykkeet pinnan sävyyn: matala ranta vaalea, syvänne tumma. */
const DEPTH_BANDS: [number, [number, number, number, number]][] = [
  [1, [120, 180, 165, 0.5]],
  [2, [95, 170, 160, 0.32]],
  [3.5, [60, 140, 170, 0.18]],
  [6, [0, 0, 0, 0]],
  [8, [10, 30, 70, 0.22]],
  [Infinity, [5, 15, 45, 0.4]],
];

/** Kuvan tarkkuus (m/pikseli): karkea, pikselimäinen sävytys. */
const SHADE_CELL = 4;

/**
 * Pohjan näkyvät osat ylhäältä: syvyyden mukainen sävy veden pinnassa sekä
 * kivikot ja kaatuneet puut.
 */
export function createBottomMesh(bottom: LakeBottom, waves?: WaterWaves): THREE.Group {
  const group = new THREE.Group();
  group.name = 'bottom';
  const shade = createDepthShade(bottom, bottom.bounds);
  group.add(shade);
  const structures = createStructures(bottom);
  if (structures) group.add(structures);
  if (waves) {
    // POV-näkymän aaltoileva lähivesi piirtää syvyyssävyn itse.
    const material = shade.material as THREE.MeshBasicMaterial;
    const w = Math.ceil((bottom.bounds.maxX - bottom.bounds.minX) / SHADE_CELL) * SHADE_CELL;
    const h = Math.ceil((bottom.bounds.maxY - bottom.bounds.minY) / SHADE_CELL) * SHADE_CELL;
    waves.uBottomShade.value = material.map;
    waves.uBottomShadeBounds.value.set(bottom.bounds.minX, bottom.bounds.maxY - h, w, h);
    clipToSwellPatch(material, waves);
    if (structures) clipToSwellPatch(structures.material as THREE.Material, waves);
  }
  return group;
}

function createDepthShade(bottom: LakeBottom, b: LakeBottom['bounds']): THREE.Mesh {
  const w = Math.ceil((b.maxX - b.minX) / SHADE_CELL);
  const h = Math.ceil((b.maxY - b.minY) / SHADE_CELL);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      // Kuvan ylärivi on pohjoisessa.
      const p = { x: b.minX + (i + 0.5) * SHADE_CELL, y: b.maxY - (j + 0.5) * SHADE_CELL };
      const d = bottom.depthAt(p);
      if (d <= 0) continue;
      const [, c] = DEPTH_BANDS.find(([max]) => d < max)!;
      const k = (j * w + i) * 4;
      img.data[k] = c[0];
      img.data[k + 1] = c[1];
      img.data[k + 2] = c[2];
      img.data[k + 3] = Math.round(c[3] * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w * SHADE_CELL, h * SHADE_CELL),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(b.minX + (w * SHADE_CELL) / 2, 0.01, -(b.maxY - (h * SHADE_CELL) / 2));
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
