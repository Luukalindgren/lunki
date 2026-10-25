import * as THREE from 'three';
import {
  LandCover,
  pointInRing,
  valueNoise,
  type AreaKind,
  type LakeMap,
  type LakeSurroundings,
  type Vec2,
} from '@lunki/shared';
import { spriteMipmaps } from '../engine/pixelMipmaps';
import { Ground } from './ground';

/** Spritet kuvakartassa vasemmalta oikealle. */
type SpriteKind = 'spruce' | 'pine' | 'birch' | 'reeds';
const SPRITES: SpriteKind[] = ['spruce', 'pine', 'birch', 'reeds'];
const CELL_W = 16;
const CELL_H = 32;

/** Piirtolohkon koko (m). */
const CHUNK = 300;
/** Puiden vyöhyke rannasta maalle (m); sen takana on metsänreunan siluetti. */
export const TREE_BAND = 48;
/** Puuston tiheys maankäytön mukaan (todennäköisyys näytepistettä kohden). */
const TREE_DENSITY: Partial<Record<AreaKind, number>> = {
  forest: 0.85,
  scrub: 0.5,
  wetland: 0.35,
  residential: 0.15,
};
/** Tuntematon maa on Suomessa useimmiten metsää. */
const UNKNOWN_DENSITY = 0.6;
/** Rakennusten ympärille jätetty piha (m). */
const YARD = 9;
/** Kaislojen väli kaislikossa (m) ja osuus, joka jää aukoiksi: vesi näkyy tupsujen välistä. */
const REED_SPACING = 2.6;
const REED_GAPS = 0.45;

/** Kuusen, männyn ja koivun korkeus (m) ja leveys suhteessa korkeuteen. */
const SIZES: Record<SpriteKind, { min: number; max: number; aspect: number }> = {
  spruce: { min: 14, max: 22, aspect: 0.45 },
  pine: { min: 16, max: 24, aspect: 0.5 },
  birch: { min: 10, max: 17, aspect: 0.55 },
  reeds: { min: 1.2, max: 2, aspect: 0.8 },
};

export interface Plant {
  kind: SpriteKind;
  pos: Vec2;
  base: number;
  height: number;
  /** Kiertokulma ja sävy, jotta vierekkäiset puut eivät näytä samoilta. */
  angle: number;
  shade: number;
}

/**
 * Rannan puut ja kaislikot ristikkäisinä spritelevyinä (yksi piirtokutsu
 * lajia kohden). Puut sijoitetaan rantaviivalta maalle maankäytön mukaan,
 * kaislat kartan kaislikoihin (ilmakuvista rajatut, ks. lunkinjarvi-reeds.json).
 */
export function createVegetation(
  map: LakeMap,
  surroundings?: LakeSurroundings,
  ground?: Ground,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'vegetation';
  const plants = planVegetation(map, surroundings, ground);
  const texture = createAtlas();
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
  });
  // Lohkoittain, jotta kameran takana olevat lohkot karsiutuvat piirrosta.
  const chunks = new Map<string, Plant[]>();
  for (const p of plants) {
    const key = `${p.kind},${Math.floor(p.pos.x / CHUNK)},${Math.floor(p.pos.y / CHUNK)}`;
    const list = chunks.get(key);
    if (list) list.push(p);
    else chunks.set(key, [p]);
  }
  const geometries = SPRITES.map((_, k) => crossedQuads(k));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const color = new THREE.Color();
  for (const list of chunks.values()) {
    const kind = list[0]!.kind;
    const mesh = new THREE.InstancedMesh(geometries[SPRITES.indexOf(kind)]!, material, list.length);
    mesh.name = kind;
    list.forEach((p, i) => {
      const w = p.height * SIZES[kind].aspect;
      m.compose(
        new THREE.Vector3(p.pos.x, p.base, -p.pos.y),
        q.setFromAxisAngle(up, p.angle),
        new THREE.Vector3(w, p.height, w),
      );
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, color.setScalar(p.shade));
    });
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  return group;
}

/** Kasvien paikat; erillään piirrosta, jotta sijoittelua voi testata. */
export function planVegetation(
  map: LakeMap,
  surroundings?: LakeSurroundings,
  ground = new Ground(map, surroundings?.terrain ?? null),
): Plant[] {
  // Kiinteä siemen: sama järvi näyttää aina samalta.
  let seed = 23;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const cover = surroundings ? new LandCover(surroundings) : null;
  const yards = new BuildingIndex(surroundings);
  const isWater = (p: Vec2) =>
    pointInRing(p, map.shore) && !map.islands.some((isl) => pointInRing(p, isl));
  const plants: Plant[] = [];
  const add = (kind: SpriteKind, pos: Vec2, base: number) => {
    const { min, max } = SIZES[kind];
    plants.push({
      kind,
      pos,
      base,
      height: min + (max - min) * rand(),
      angle: rand() * Math.PI,
      shade: 0.8 + rand() * 0.3,
    });
  };

  for (const ring of [map.shore, ...map.islands]) {
    for (const { p, n, t } of shoreSamples(ring, 3.5)) {
      for (let d = 4 + rand() * 3; d < TREE_BAND; d += 4 + rand() * 3) {
        const side = (rand() - 0.5) * 3.4;
        const pos = { x: p.x + n.x * d + t.x * side, y: p.y + n.y * d + t.y * side };
        if (isWater(pos) || yards.near(pos, YARD)) continue;
        const kind = cover?.kindAt(pos) ?? null;
        let density = kind === null ? UNKNOWN_DENSITY : (TREE_DENSITY[kind] ?? 0);
        // Aukiot ja harvemmat kohdat metsässä.
        if (valueNoise(pos.x / 40, pos.y / 40, 41) < -0.45) density *= 0.2;
        if (rand() > density) continue;
        const h = Math.max(0, ground.heightAt(pos));
        const mix = valueNoise(pos.x / 60, pos.y / 60, 42);
        // Koivuja rannassa ja lehtimetsälaikuissa, mäntyjä kankailla, muuten kuusta.
        const species: SpriteKind =
          (d < 12 && rand() < 0.5) || mix > 0.3
            ? 'birch'
            : h > 8 || mix < -0.35
              ? 'pine'
              : 'spruce';
        add(species, pos, h - 0.3);
      }
    }
  }

  // Kaislikot: harvoina tuppaina kaislikon sisällä, välissä avovettä.
  for (const bed of map.reeds ?? []) {
    const xs = bed.ring.map((p) => p.x);
    const ys = bed.ring.map((p) => p.y);
    for (let y = Math.min(...ys); y < Math.max(...ys); y += REED_SPACING) {
      for (let x = Math.min(...xs); x < Math.max(...xs); x += REED_SPACING) {
        const pos = {
          x: x + (rand() - 0.5) * REED_SPACING,
          y: y + (rand() - 0.5) * REED_SPACING,
        };
        if (!pointInRing(pos, bed.ring) || !isWater(pos)) continue;
        if (valueNoise(pos.x / 6, pos.y / 6, 31) < REED_GAPS * 2 - 1) continue;
        add('reeds', pos, -0.4);
      }
    }
  }
  return plants;
}

/** Rantaviivan näytteet: piste, maalle osoittava normaali ja tangentti. */
function* shoreSamples(ring: readonly Vec2[], step: number) {
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len === 0) continue;
    const t = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    // Vasemmalle käännetty tangentti osoittaa maalle (järvi vastapäivään, saaret myötäpäivään).
    const n = { x: t.y, y: -t.x };
    for (let s = 0; s < len; s += step) yield { p: { x: a.x + t.x * s, y: a.y + t.y * s }, n, t };
  }
}

/** Rakennusten keskipisteet ruudukossa pihojen tarkistusta varten. */
class BuildingIndex {
  private readonly cells = new Map<string, Vec2[]>();
  private static readonly CELL = 25;

  constructor(surroundings?: LakeSurroundings) {
    for (const a of surroundings?.areas ?? []) {
      if (a.kind !== 'building') continue;
      for (const p of a.rings[0]!) {
        const key = this.key(p.x, p.y);
        const list = this.cells.get(key);
        if (list) list.push(p);
        else this.cells.set(key, [p]);
      }
    }
  }

  private key(x: number, y: number): string {
    return `${Math.floor(x / BuildingIndex.CELL)},${Math.floor(y / BuildingIndex.CELL)}`;
  }

  /** Onko jokin rakennuksen kulma lähempänä kuin r (r ≤ ruudun koko). */
  near(p: Vec2, r: number): boolean {
    const cx = Math.floor(p.x / BuildingIndex.CELL);
    const cy = Math.floor(p.y / BuildingIndex.CELL);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const q of this.cells.get(`${cx + dx},${cy + dy}`) ?? [])
          if (Math.hypot(q.x - p.x, q.y - p.y) < r) return true;
    return false;
  }
}

/** Kaksi ristikkäistä yksikkölevyä, alareuna origossa, UV:t kuvakartan solusta k. */
function crossedQuads(k: number): THREE.BufferGeometry {
  const a = new THREE.PlaneGeometry(1, 1);
  const b = new THREE.PlaneGeometry(1, 1);
  b.rotateY(Math.PI / 2);
  const positions: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  for (const g of [a, b]) {
    const offset = positions.length / 3;
    const pos = g.getAttribute('position');
    const uv = g.getAttribute('uv');
    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i) + 0.5, pos.getZ(i));
      uvs.push((k + uv.getX(i)) / SPRITES.length, uv.getY(i));
    }
    for (const i of g.getIndex()!.array) index.push(i + offset);
    g.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(index);
  return g;
}

/** Pikselispritet piirretään koodissa: kuusi, mänty, koivu ja kaislatupas. */
function createAtlas(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = CELL_W * SPRITES.length;
  canvas.height = CELL_H;
  const ctx = canvas.getContext('2d')!;
  let seed = 5;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const px = (cell: number, x: number, y: number, color: string) => {
    if (x < 0 || x >= CELL_W || y < 0 || y >= CELL_H) return;
    ctx.fillStyle = color;
    ctx.fillRect(cell * CELL_W + x, y, 1, 1);
  };
  const cx = CELL_W / 2;

  // Kuusi: kerroksittain levenevä, sahalaitainen kartio.
  for (let y = 1; y < 29; y++) {
    const half = 0.5 + (y - 1) * 0.24 - ((y - 1) % 5) * 0.35;
    for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half - 1); x++)
      px(0, x, y, x < cx - half / 3 ? '#2d5a2c' : '#1f3d22');
  }
  for (let y = 28; y < 32; y++) {
    px(0, cx - 1, y, '#5a3d22');
    px(0, cx, y, '#5a3d22');
  }

  // Mänty: pitkä punaruskea runko ja epäsäännöllinen latvus ylhäällä.
  for (let y = 10; y < 32; y++) {
    px(1, cx - 1, y, '#8a5a3a');
    px(1, cx, y, '#6b4a2b');
  }
  for (let y = 1; y < 14; y++) {
    const half = 3 + Math.sin(y * 1.3) * 1.5 + (y > 3 && y < 11 ? 2 : 0);
    for (let x = Math.round(cx - half); x < Math.round(cx + half); x++)
      if (rand() > 0.12) px(1, x, y, rand() < 0.3 ? '#3b7337' : '#24502c');
  }

  // Koivu: valkoinen runko mustin laikuin ja vaalea, harva latvus.
  for (let y = 9; y < 32; y++) {
    px(2, cx - 1, y, '#e8e4d8');
    px(2, cx, y, rand() < 0.25 ? '#2a2420' : '#d8d4c4');
  }
  for (let y = 1; y < 22; y++) {
    const half = 6 * Math.sin((Math.PI * y) / 22) + 0.5;
    for (let x = Math.round(cx - half); x < Math.round(cx + half); x++)
      if (rand() > 0.25) px(2, x, y, rand() < 0.4 ? '#6a9a3e' : '#4d7a3a');
  }

  // Kaislatupas: pystyjä korsia, osassa ruskea tähkä.
  for (let x = 1; x < CELL_W - 1; x++) {
    if (rand() < 0.55) continue;
    const top = 4 + Math.floor(rand() * 18);
    for (let y = top; y < CELL_H; y++) px(3, x, y, rand() < 0.5 ? '#a3c45a' : '#7a9a3e');
    if (rand() < 0.3) for (let y = top; y < top + 3; y++) px(3, x, y, '#6b4a2b');
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  // Kaukaiset puut pienennetyistä kuvista: ilman mipmappeja pikselit
  // välkkyvät, kun kamera liikkuu vähänkin. Pienennös pitää ääriviivat
  // terävinä (ks. halveSprite), joten puut eivät haalistu läpinäkyviksi.
  texture.minFilter = THREE.NearestMipmapNearestFilter;
  texture.generateMipmaps = false;
  const level0 = ctx.getImageData(0, 0, canvas.width, canvas.height);
  texture.mipmaps = [level0, ...spriteMipmaps(level0).map((l) => new ImageData(l.data, l.width))];
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
