import * as THREE from 'three';
import {
  LandCover,
  type AreaKind,
  type LakeSurroundings,
  type LineKind,
  type Season,
  type Vec2,
} from '@lunki/shared';
import type { Ground } from './ground';
import { SEASON_COLORS } from './seasonColors';

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

/** Maankäytön väri vuodenajan mukaan (#427). */
export const areaColor = (kind: AreaKind, season: Season = 'summer') =>
  SEASON_COLORS[season].areas[kind] ?? AREA_COLORS[kind];

/**
 * Ylhäältä-näkymän ympäristö: maankäyttöalueet ja rakennukset litteinä
 * muotoina sekä tiet ja purot viivoina.
 */
export function createMapOverlay(s: LakeSurroundings, season: Season = 'summer'): THREE.Group {
  const group = new THREE.Group();
  group.name = 'surroundings-map';
  // Isommat alueet ensin ja hieman alemmas, jotta pienemmät piirtyvät päälle.
  s.areas.forEach((a, i) => {
    const shape = new THREE.Shape(a.rings[0]!.map((p) => new THREE.Vector2(p.x, p.y)));
    for (const hole of a.rings.slice(1))
      shape.holes.push(new THREE.Path(hole.map((p) => new THREE.Vector2(p.x, p.y))));
    const mesh = new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      new THREE.MeshBasicMaterial({ color: areaColor(a.kind, season) }),
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
/** Saarten kannen korkeus vedenpinnasta (m) POV-näkymässä. */
const ISLAND_CAP = 0.1;
/** Maastoverkon palan koko (ruutua): näkymän ulkopuoliset palat jätetään piirtämättä. */
const TERRAIN_CHUNK = 64;

/**
 * POV-näkymän maasto: maanpinnasta (ks. Ground) matalapolygoninen pinta,
 * väritetty maankäytön mukaan ja kuvioitu pikseliruoholla, jotta rinteet
 * näyttävät maalta eivätkä tasaisilta seiniltä. Järven kohdalla pinta on
 * veden alla, joten kokonaan järven sisällä olevia ruutuja ei piirretä.
 * Pinta on paloina, jotta kamera piirtää vain näkyvät palat.
 */
export function createTerrainMesh(
  ground: Ground,
  s: LakeSurroundings,
  islands: readonly (readonly Vec2[])[] = [],
  season: Season = 'summer',
): THREE.Group | null {
  if (!ground.terrain) return null;
  const bare = SEASON_COLORS[season].ground;
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
      color.setHex(kind ? areaColor(kind, season) : bare);
      // Kevyt korkeusvarjostus, jotta mäet erottuvat.
      color.multiplyScalar(0.85 + Math.min(0.3, Math.max(0, h) / 120));
      colors.set([color.r, color.g, color.b], k * 3);
    }
  }
  const material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    flatShading: true,
    map: createGrassTexture(),
  });
  const group = new THREE.Group();
  group.name = 'terrain';
  for (let j0 = 0; j0 < rows - 1; j0 += TERRAIN_CHUNK) {
    for (let i0 = 0; i0 < cols - 1; i0 += TERRAIN_CHUNK) {
      const chunk = terrainChunk(ground, positions, colors, uvs, i0, j0);
      if (chunk) group.add(new THREE.Mesh(chunk, material));
    }
  }
  // Pienet saaret eivät mahdu maastoverkon ruutuihin: matala, samalla
  // ruoholla kuvioitu kansi pitää ne näkyvissä. Rannasta sisämaahan maasto
  // nousee kannen yli.
  color.setHex(bare).multiplyScalar(0.85);
  for (const island of islands) {
    const cap = new THREE.ShapeGeometry(
      new THREE.Shape(island.map((p) => new THREE.Vector2(p.x, p.y))),
    );
    cap.rotateX(-Math.PI / 2);
    cap.translate(0, ISLAND_CAP, 0);
    const uv = cap.getAttribute('uv');
    for (let i = 0; i < uv.count; i++)
      uv.setXY(i, uv.getX(i) / GRASS_TEXTURE_METERS, uv.getY(i) / GRASS_TEXTURE_METERS);
    const capColors = new Float32Array(uv.count * 3);
    for (let i = 0; i < uv.count; i++) capColors.set([color.r, color.g, color.b], i * 3);
    cap.setAttribute('color', new THREE.BufferAttribute(capColors, 3));
    group.add(new THREE.Mesh(cap, material));
  }
  return group;
}

/**
 * Maastoverkon pala, jonka vasen alakulma on ruudussa (i0, j0). Null, jos
 * palan kaikki ruudut ovat kokonaan järven sisällä (läpinäkymättömän veden alla).
 */
function terrainChunk(
  ground: Ground,
  positions: Float32Array,
  colors: Float32Array,
  uvs: Float32Array,
  i0: number,
  j0: number,
): THREE.BufferGeometry | null {
  const { cols, rows, water } = ground;
  const i1 = Math.min(i0 + TERRAIN_CHUNK, cols - 1);
  const j1 = Math.min(j0 + TERRAIN_CHUNK, rows - 1);
  const w = i1 - i0 + 1;
  const local = (i: number, j: number) => (j - j0) * w + (i - i0);
  const index: number[] = [];
  for (let j = j0; j < j1; j++) {
    for (let i = i0; i < i1; i++) {
      const a = j * cols + i;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      if (water[a] && water[b] && water[c] && water[d]) continue;
      const la = local(i, j);
      const lc = la + w;
      // Vastapäivään ylhäältä katsottuna: normaali ylöspäin. Lävistäjä b–c
      // kuten Ground.heightAt.
      index.push(la, la + 1, lc, la + 1, lc + 1, lc);
    }
  }
  if (index.length === 0) return null;
  const n = w * (j1 - j0 + 1);
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const uv = new Float32Array(n * 2);
  for (let j = j0; j <= j1; j++) {
    const from = j * cols + i0;
    const to = local(i0, j);
    pos.set(positions.subarray(from * 3, (from + w) * 3), to * 3);
    col.set(colors.subarray(from * 3, (from + w) * 3), to * 3);
    uv.set(uvs.subarray(from * 2, (from + w) * 2), to * 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
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
