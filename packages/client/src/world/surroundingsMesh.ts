import * as THREE from 'three';
import {
  LandCover,
  pointInRing,
  type AreaKind,
  type LakeMap,
  type LakeSurroundings,
  type LineKind,
} from '@lunki/shared';

/** Maankäytön värit (palettisävyjä). */
const AREA_COLORS: Record<AreaKind, number> = {
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

const LINE_COLORS: Record<LineKind, number> = {
  road: 0xb99a68,
  track: 0x8a6a42,
  path: 0xe0cf9c,
  pier: 0x8a6a42,
  stream: 0x2b7aa6,
};

/** Maaston oletusväri, kun maankäyttöä ei tiedetä. */
const DEFAULT_GROUND = 0x3b7337;

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

/**
 * POV-näkymän maasto: korkeusmallista matalapolygoninen pinta, väritetty
 * maankäytön mukaan. Järven kohdalla pinta painetaan veden alle, ja rannassa
 * maa nousee hieman pinnan yläpuolelle.
 */
export function createTerrainMesh(map: LakeMap, s: LakeSurroundings): THREE.Mesh | null {
  const t = s.terrain;
  if (!t) return null;
  const cover = new LandCover(s);
  const positions = new Float32Array(t.cols * t.rows * 3);
  const colors = new Float32Array(t.cols * t.rows * 3);
  const color = new THREE.Color();
  for (let j = 0; j < t.rows; j++) {
    for (let i = 0; i < t.cols; i++) {
      const k = j * t.cols + i;
      const p = { x: t.minX + i * t.cell, y: t.minY + j * t.cell };
      const inLake = pointInRing(p, map.shore) && !map.islands.some((isl) => pointInRing(p, isl));
      const h = inLake ? -3 : Math.max(0.4, t.heights[k]!);
      positions.set([p.x, h, -p.y], k * 3);
      const kind = inLake ? null : cover.kindAt(p);
      color.setHex(kind ? AREA_COLORS[kind] : DEFAULT_GROUND);
      // Kevyt korkeusvarjostus, jotta mäet erottuvat.
      color.multiplyScalar(0.85 + Math.min(0.3, h / 120));
      colors.set([color.r, color.g, color.b], k * 3);
    }
  }
  const index: number[] = [];
  for (let j = 0; j < t.rows - 1; j++) {
    for (let i = 0; i < t.cols - 1; i++) {
      const a = j * t.cols + i;
      const b = a + 1;
      const c = a + t.cols;
      const d = c + 1;
      // Vastapäivään ylhäältä katsottuna: normaali ylöspäin.
      index.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(
    g,
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  );
  mesh.name = 'terrain';
  return mesh;
}
