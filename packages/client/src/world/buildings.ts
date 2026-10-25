import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { footprint, terrainHeightAt, type LakeSurroundings, type Pier } from '@lunki/shared';

/** Seinien värit: punamulta yleisin, sitten keltainen ja vaalea. */
const WALLS = [0x8c1c1c, 0x8c1c1c, 0x8c1c1c, 0xc9a54a, 0xd8d4c4];
const ROOFS = [0x3a3a3a, 0x2a2420, 0x6a1a1a];

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

function paint(g: THREE.BufferGeometry, hex: number): void {
  const c = new THREE.Color(hex);
  const colors = new Float32Array(g.getAttribute('position').count * 3);
  for (let i = 0; i < colors.length; i += 3) colors.set([c.r, c.g, c.b], i);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}
