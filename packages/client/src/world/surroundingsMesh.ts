import * as THREE from 'three';
import { LandCover, type AreaKind, type LakeSurroundings, type LineKind } from '@lunki/shared';
import type { Ground } from './ground';

/** Maankäytön värit (palettisävyjä). */
export const AREA_COLORS: Record<AreaKind, number> = {
  forest: 0x24502c,
  field: 0x6a9a3e,
  residential: 0x5f6b78,
  wetland: 0x3b7337,
  reeds: 0xa3c45a,
  scrub: 0x3b7337,
  beach: 0xe0cf9c,
  bare: 0x8e99a4,
  water: 0x1b5a84,
  building: 0x8c1c1c,
  pier: 0x8a6a42,
};

export const LINE_COLORS: Record<LineKind, number> = {
  road: 0xb99a68,
  track: 0x8a6a42,
  path: 0xe0cf9c,
  pier: 0x8a6a42,
  stream: 0x2b7aa6,
};

/** Maaston oletusväri, kun maankäyttöä ei tiedetä. */
export const DEFAULT_GROUND = 0x3b7337;

/**
 * Ylhäältä-näkymän ympäristö: maankäyttöalueet ja rakennukset litteinä
 * muotoina sekä tiet ja purot viivoina.
 */
export function createMapOverlay(s: LakeSurroundings): THREE.Group {
  const group = new THREE.Group();
  group.name = 'surroundings-map';
  // Isommat alueet ensin ja hieman alemmas, jotta pienemmät piirtyvät päälle.
  s.areas.forEach((a, i) => {
    const shape = new THREE.Shape(a.rings[0]!.map((p) => new THREE.Vector2(p.x, p.y)));
    for (const hole of a.rings.slice(1))
      shape.holes.push(new THREE.Path(hole.map((p) => new THREE.Vector2(p.x, p.y))));
    const mesh = new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      new THREE.MeshBasicMaterial({ color: AREA_COLORS[a.kind] }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = -0.045 + (i / Math.max(1, s.areas.length)) * 0.03;
    group.add(mesh);
  });
  for (const l of s.lines) {
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(
        l.points.map((p) => new THREE.Vector3(p.x, -0.01, -p.y)),
      ),
      new THREE.LineBasicMaterial({ color: LINE_COLORS[l.kind] }),
    );
    group.add(line);
  }
  return group;
}

/** Maaston ruohokuvion yhden toiston koko (m). */
const GRASS_TEXTURE_METERS = 8;

/**
 * POV-näkymän maasto: maanpinnasta (ks. Ground) matalapolygoninen pinta,
 * väritetty maankäytön mukaan ja kuvioitu pikseliruoholla, jotta rinteet
 * näyttävät maalta eivätkä tasaisilta seiniltä. Järven kohdalla pinta on
 * veden alla.
 */
export function createTerrainMesh(ground: Ground, s: LakeSurroundings): THREE.Mesh | null {
  if (!ground.terrain) return null;
  const { cols, rows, cell } = ground;
  const cover = new LandCover(s);
  const positions = new Float32Array(cols * rows * 3);
  const colors = new Float32Array(cols * rows * 3);
  const uvs = new Float32Array(cols * rows * 2);
  const color = new THREE.Color();
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const k = j * cols + i;
      const p = { x: ground.minX + i * cell, y: ground.minY + j * cell };
      const h = ground.heights[k]!;
      positions.set([p.x, h, -p.y], k * 3);
      uvs.set([p.x / GRASS_TEXTURE_METERS, p.y / GRASS_TEXTURE_METERS], k * 2);
      const kind = ground.water[k] ? null : cover.kindAt(p);
      color.setHex(kind ? AREA_COLORS[kind] : DEFAULT_GROUND);
      // Kevyt korkeusvarjostus, jotta mäet erottuvat.
      color.multiplyScalar(0.85 + Math.min(0.3, Math.max(0, h) / 120));
      colors.set([color.r, color.g, color.b], k * 3);
    }
  }
  const index: number[] = [];
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < cols - 1; i++) {
      const a = j * cols + i;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      // Vastapäivään ylhäältä katsottuna: normaali ylöspäin. Lävistäjä b–c
      // kuten Ground.heightAt.
      index.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(
    g,
    new THREE.MeshLambertMaterial({
      vertexColors: true,
      flatShading: true,
      map: createGrassTexture(),
    }),
  );
  mesh.name = 'terrain';
  return mesh;
}

/**
 * Harmaasävyinen ruohokuvio, joka kerrotaan maankäytön värillä: valkoisella
 * pohjalla tummia tupsuja ja korsia. Paletissa sävyt hyppäävät viereiseen
 * vihreään, mikä näkyy pikseliruohona.
 */
function createGrassTexture(): THREE.Texture {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  // Kiinteä siemen, jotta kuvio on aina sama.
  let seed = 13;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 150; i++) {
    const x = Math.floor(rand() * size);
    const y = Math.floor(rand() * size);
    ctx.fillStyle = rand() < 0.6 ? '#8c8c8c' : '#c8c8c8';
    ctx.fillRect(x, y, 1, 1 + Math.floor(rand() * 2));
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.NearestFilter;
  // Kaukaa katsottuna kuvio sulautuu keskisävyyn eikä välky.
  texture.minFilter = THREE.NearestMipmapLinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
