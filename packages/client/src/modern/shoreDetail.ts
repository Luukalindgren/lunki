import * as THREE from 'three';
import { PIER_WIDTH, type LakeMap, type Pier, type Vec2 } from '@lunki/shared';
import { clearSightLine } from '../world/sightLine';
import type { Plant } from '../world/vegetation';
import type { Land } from './land';
import type { SceneryColors } from './sceneryColors';
import {
  blob,
  DetailLevels,
  mergeParts,
  mixColor,
  paint,
  paintedMaterial,
  scatter,
  seeded,
  solid,
  type Placement,
} from './shapes';

/** Rantakivien piirtolohkon sivu (m). */
const CHUNK = 150;
/** Kaislojen ja heinän piirtolohkon sivu (m): pieni, koska ne piirretään vain läheltä. */
const TUFT_CHUNK = 60;
/** Kaislikon kuvion yhden toiston koko ylhäältä (m). */
const BED_TEXTURE_METERS = 9;
/** Rantakivien ja heinätuppaiden väli rantaviivaa pitkin (m): pienin ja vaihtelu. */
const SHORE_SPACING: readonly [number, number] = [1.2, 2.5];
/** Näin suuri osa rannan pisteistä saa kiven. */
const ROCK_SHARE = 0.55;
/** Tarkat kaislat ja rantaheinä piirretään tähän kerrannaiseen asti laadun matkasta. */
const REED_RANGE = 2;
const GRASS_RANGE = 1.5;
/** Rantakivet piirretään tämän matkan (m) päähän. */
const ROCK_RANGE = 600;

/**
 * Lehden pinta: näkyy molemmilta puolilta ja valaistuu kummaltakin samoin
 * (normaalia ei käännetä takapuolella), jotta tupas ei tummu vastavaloon.
 */
function leafMaterial(): THREE.Material {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      '#include <normal_fragment_begin>\n\tnormal = normalize( vNormal );',
    );
  };
  material.customProgramCacheKey = () => 'modern-leaf';
  return material;
}

/**
 * Tupas yksittäisiä lehtiä: kaislat ja rantaheinä. Malli on yhden yksikön
 * korkuinen ja 0,84 leveä; `steps` on lehden taitteiden määrä. Normaalit
 * osoittavat ylös ja lehden kallistuksen suuntaan.
 */
function tuft(
  rand: () => number,
  blades: number,
  width: number,
  colors: readonly [number, number],
  heads: number,
  steps = 4,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const tints: number[] = [];
  const index: number[] = [];
  const c = new THREE.Color();
  for (let b = 0; b < blades; b++) {
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand()) * 0.42;
    const height = 0.55 + rand() * 0.45;
    const lean = rand() * Math.PI * 2;
    const bend = 0.05 + rand() * 0.25;
    const w = width + rand() * 0.008;
    const side = [-Math.sin(lean), Math.cos(lean)] as const;
    const base = positions.length / 3;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = Math.cos(a) * d + Math.cos(lean) * bend * t * t;
      const z = Math.sin(a) * d + Math.sin(lean) * bend * t * t;
      const half = w * (1 - t * 0.85);
      c.copy(mixColor(colors[0], colors[1], t));
      for (const s of [-1, 1]) {
        positions.push(x + side[0] * half * s, height * t, z + side[1] * half * s);
        normals.push(Math.cos(lean) * 0.4, 0.9, Math.sin(lean) * 0.4);
        tints.push(c.r, c.g, c.b);
      }
      if (i === steps) continue;
      const k = base + i * 2;
      index.push(k, k + 1, k + 3, k, k + 3, k + 2);
    }
    if (rand() >= heads) continue;
    // Ruskea tähkä lehden kärjessä.
    const head = solid(
      new THREE.CylinderGeometry(0.014, 0.014, 0.1, 5, 1).translate(
        Math.cos(a) * d + Math.cos(lean) * bend,
        height - 0.02,
        Math.sin(a) * d + Math.sin(lean) * bend,
      ),
    );
    const hp = head.getAttribute('position');
    const hn = head.getAttribute('normal');
    const at = positions.length / 3;
    for (let i = 0; i < hp.count; i++) {
      positions.push(hp.getX(i), hp.getY(i), hp.getZ(i));
      normals.push(hn.getX(i), hn.getY(i), hn.getZ(i));
      tints.push(0.36, 0.25, 0.16);
    }
    for (const i of head.getIndex()!.array) index.push(at + i);
    head.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(tints, 3));
  geo.setIndex(index);
  return geo;
}

/** Maiseman osa, jonka tarkkuus riippuu kameran etäisyydestä (`QUALITY.detailRange`). */
export interface Detailed {
  group: THREE.Group;
  update(camera: THREE.Camera, range: number): void;
}

/**
 * Kaislikot: tuppaat samoilla paikoilla kuin Retron kaislakuvat ja niiden
 * alla ylhäältä näkyvä kuvio (`bed`), jonka välistä vesi näkyy. Kaukaa tupas
 * on harvempi ja leveälehtisempi.
 */
export function createReeds(
  plants: readonly Plant[],
  map: LakeMap,
  colors: SceneryColors,
): Detailed & { bed: THREE.Group } {
  const rand = seeded(31);
  const group = new THREE.Group();
  group.name = 'modern-reeds';
  const levels = new DetailLevels();
  const items: Placement[] = plants
    .filter((p) => p.kind === 'reeds')
    .map((p) => ({
      x: p.pos.x,
      y: -0.3,
      z: -p.pos.y,
      angle: p.angle * 2,
      width: p.height * 1.05,
      height: p.height + 0.3,
      shade: p.shade,
    }));
  if (items.length) {
    const material = leafMaterial();
    // Takaa-näkymässä (#691) kameran ja kalastajan väliin jäävät tuppaat jäävät
    // piirtämättä: tupas on 0,84 leveä kappaleen mitasta.
    clearSightLine(material, 0.42);
    const near = scatter(tuft(rand, 24, 0.02, colors.reed, 0.3), material, items, TUFT_CHUNK);
    const far = scatter(tuft(rand, 9, 0.045, colors.reed, 0, 2), material, items, TUFT_CHUNK);
    near.forEach((mesh, i) => {
      far[i]!.visible = false;
      levels.add(mesh.boundingSphere!, [mesh, far[i]!]);
      group.add(mesh, far[i]!);
    });
  }

  const bed = new THREE.Group();
  bed.name = 'modern-reed-bed';
  const material = new THREE.MeshBasicMaterial({
    map: bedTexture(rand, colors.reedBed),
    transparent: true,
    depthWrite: false,
  });
  for (const patch of map.reeds ?? []) {
    const mesh = new THREE.Mesh(
      new THREE.ShapeGeometry(new THREE.Shape(patch.ring.map((p) => new THREE.Vector2(p.x, p.y)))),
      material,
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.015;
    bed.add(mesh);
  }
  return { group, bed, update: (camera, range) => levels.update(camera, [range * REED_RANGE]) };
}

/** Kaislikko ylhäältä: tuppaita, joiden korret kaartuvat keskeltä ulos; välistä näkyy vesi. */
function bedTexture(rand: () => number, tones: readonly string[]): THREE.Texture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.lineCap = 'round';
  for (let i = 0; i < 64; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const stems = 5 + Math.floor(rand() * 5);
    for (let k = 0; k < stems; k++) {
      const a = rand() * Math.PI * 2;
      const len = 9 + rand() * 14;
      const bend = (rand() - 0.5) * 9;
      const tone = tones[Math.floor(rand() * tones.length)]!;
      const width = 1.6 + rand() * 1.6;
      // Reunan yli menevä korsi piirretään myös vastakkaiselle reunalle.
      for (const ox of [-size, 0, size])
        for (const oy of [-size, 0, size]) {
          const ex = x + ox + Math.cos(a) * len;
          const ey = y + oy + Math.sin(a) * len;
          const fade = ctx.createLinearGradient(x + ox, y + oy, ex, ey);
          fade.addColorStop(0, tones[2]!);
          fade.addColorStop(1, tone);
          ctx.strokeStyle = fade;
          ctx.lineWidth = width;
          ctx.beginPath();
          ctx.moveTo(x + ox, y + oy);
          ctx.quadraticCurveTo(
            x + ox + Math.cos(a) * len * 0.5 - Math.sin(a) * bend,
            y + oy + Math.sin(a) * len * 0.5 + Math.cos(a) * bend,
            ex,
            ey,
          );
          ctx.stroke();
        }
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1 / BED_TEXTURE_METERS, 1 / BED_TEXTURE_METERS);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** Rantaviivan pisteet satunnaisin välein: paikka ja maalle osoittava normaali. */
function* alongShore(map: LakeMap, rand: () => number) {
  for (const ring of [map.shore, ...map.islands]) {
    let next = rand() * 2;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!;
      const b = ring[(i + 1) % ring.length]!;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len === 0) continue;
      const tx = (b.x - a.x) / len;
      const ty = (b.y - a.y) / len;
      for (; next < len; next += SHORE_SPACING[0] + rand() * SHORE_SPACING[1])
        yield { x: a.x + tx * next, y: a.y + ty * next, nx: ty, ny: -tx };
      next -= len;
    }
  }
}

const pierDistance = (p: Vec2, pier: Pier): number => {
  const dx = pier.to.x - pier.from.x;
  const dy = pier.to.y - pier.from.y;
  const t = Math.max(
    0,
    Math.min(1, ((p.x - pier.from.x) * dx + (p.y - pier.from.y) * dy) / (dx * dx + dy * dy || 1)),
  );
  return Math.hypot(p.x - pier.from.x - dx * t, p.y - pier.from.y - dy * t);
};

/**
 * Rantaviivan kivet ja heinätuppaat: pyöreät kivet puoliksi maassa tai
 * vedessä ja heinää niiden välissä penkalla. Laiturin juuri jää vapaaksi.
 */
export function createShoreDetail(map: LakeMap, land: Land, colors: SceneryColors): Detailed {
  const group = new THREE.Group();
  group.name = 'modern-shore';
  const rand = seeded(19);
  const piers = map.piers ?? [];
  const clear = PIER_WIDTH / 2 + 0.8;
  const rocks = new Map<string, THREE.BufferGeometry[]>();
  const grass: Placement[] = [];
  for (const s of alongShore(map, rand)) {
    const offset = (rand() - 0.5) * 2.4;
    const p = { x: s.x + s.nx * offset, y: s.y + s.ny * offset };
    const rock = rand() < ROCK_SHARE;
    const size = 0.18 + rand() ** 2 * 0.75;
    const flat = 0.55 + rand() * 0.25;
    const tone = colors.rock[Math.floor(rand() * colors.rock.length)]!;
    const spots = [0, 1].map(() => ({
      x: p.x + (rand() - 0.5) * 3,
      y: p.y + (rand() - 0.5) * 3,
      size: 0.35 + rand() * 0.5,
      angle: rand() * Math.PI * 2,
    }));
    if (piers.some((pier) => pierDistance(p, pier) < clear + size)) continue;
    if (rock) {
      const geo = blob(rand, size, flat, 0.22, 1.6, [p.x, land.heightAt(p) + size * 0.12, -p.y], 1);
      const dark = mixColor(tone, 0x202020, 0.35).getHex();
      paint(geo, (_x, _y, _z, upward) => mixColor(dark, tone, 0.5 + upward * 0.5));
      const key = `${Math.floor(p.x / CHUNK)},${Math.floor(p.y / CHUNK)}`;
      const list = rocks.get(key);
      if (list) list.push(geo);
      else rocks.set(key, [geo]);
    }
    for (const t of spots) {
      if (land.shore.isWater(t)) continue;
      grass.push({
        x: t.x,
        y: land.heightAt(t) - 0.03,
        z: -t.y,
        angle: t.angle,
        width: t.size * 1.2,
        height: t.size,
      });
    }
  }
  const levels = new DetailLevels();
  const stone = paintedMaterial();
  for (const parts of rocks.values()) {
    const mesh = new THREE.Mesh(mergeParts(parts), stone);
    mesh.geometry.computeBoundingSphere();
    levels.add(mesh.geometry.boundingSphere!, [mesh, mesh, null]);
    group.add(mesh);
  }
  if (grass.length)
    for (const mesh of scatter(
      tuft(rand, 11, 0.026, colors.grass, 0, 3),
      leafMaterial(),
      grass,
      TUFT_CHUNK,
    )) {
      levels.add(mesh.boundingSphere!, [mesh, null, null]);
      group.add(mesh);
    }
  // Heinä näkyy vain läheltä ja kivet vastarannalle asti.
  return {
    group,
    update: (camera, range) => levels.update(camera, [range * GRASS_RANGE, ROCK_RANGE]),
  };
}
