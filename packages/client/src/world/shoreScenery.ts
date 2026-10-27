import * as THREE from 'three';
import {
  LandCover,
  ringWaterTest,
  signedArea,
  valueNoise,
  type AreaKind,
  type LakeMap,
  type LakeSurroundings,
  type Vec2,
} from '@lunki/shared';
import { spriteMipmaps } from '../engine/pixelMipmaps';
import { Ground } from './ground';
import { TREE_BAND } from './vegetation';

/** Maankäyttö, jossa rannalla ei kasva metsää. */
const OPEN_LAND = new Set<AreaKind>(['field', 'residential', 'beach', 'bare', 'water', 'reeds']);

/** Metsänreunan etäisyys rantaviivasta maalle (m) ja näytteenväli (m). Edessä on puuspritejä. */
const INLAND = TREE_BAND + 2;
const STEP = 4;
/** Metsäkuvion yhden toiston leveys (m): pikseli on suunnilleen puuspritejen kokoinen. */
const FOREST_TEXTURE_METERS = 20;

/**
 * Metsän massa siluettina POV-näkymää varten: rannan puuvyöhykkeen takana
 * rantaviivaa seuraava seinämä, jonka yläreuna vaihtelee kuin kuusikon ja koivikon latvat.
 * Ylhäältä katsottuna seinämä ei näy, joten se piilotetaan siinä tilassa.
 */
export function createShoreScenery(
  map: LakeMap,
  surroundings?: LakeSurroundings,
  ground = new Ground(map, surroundings?.terrain ?? null),
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'shore-scenery';
  const cover = surroundings ? new LandCover(surroundings) : null;
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    map: createForestTexture(),
    alphaTest: 0.5,
    side: THREE.DoubleSide,
  });
  const isWater = ringWaterTest(map.shore, map.islands);
  const line = (ring: Vec2[], inland: number, heightScale: number) =>
    treeLine(ring, cover, ground, isWater, material, inland, heightScale);
  group.add(line(resample(map.shore, STEP), INLAND, 1));
  // Saaret ovat kapeita: siluetti saaren sisään, ja luotojen puut ovat matalampia.
  for (const island of map.islands) {
    const inland = Math.min(INLAND, Math.sqrt(Math.abs(signedArea(island))) / 4);
    group.add(line(resample(island, STEP / 2), inland, 0.6));
  }
  return group;
}

function treeLine(
  ring: Vec2[],
  cover: LandCover | null,
  ground: Ground,
  isWater: (p: Vec2) => boolean,
  material: THREE.Material,
  inland: number,
  heightScale: number,
): THREE.Mesh {
  const n = ring.length;
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  let along = 0;
  let last: Vec2 | null = null;
  const index: number[] = [];
  const dark = new THREE.Color(0x1f3d22);
  const mid = new THREE.Color(0x2d5a2c);
  const birch = new THREE.Color(0x4d7a3a);
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const prev = ring[(i - 1 + n) % n]!;
    const next = ring[(i + 1) % n]!;
    const p = ring[i]!;
    // Vasemmalle käännetty tangentti osoittaa maalle (järvi vastapäivään, saaret myötäpäivään).
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const len = Math.hypot(tx, ty) || 1;
    const nx = ty / len;
    const ny = -tx / len;
    // Kapealla niemellä metsänreunaa ei ole: siluetti seisoisi vastarannan
    // vedessä tai aivan katsojan edessä tasaisena vihreänä seinänä. Niemen
    // puut ovat puuvyöhykkeen spritejä, ja niiden välistä näkyy vesi.
    let narrow = false;
    for (let d = 2; d <= inland * 1.4; d += 2) {
      if (isWater({ x: p.x + nx * d, y: p.y + ny * d })) {
        narrow = true;
        break;
      }
    }
    const reach = narrow ? 1 : inland;
    const x = p.x + nx * reach;
    const y = p.y + ny * reach;
    // Latvojen korkeus: laaja vaihtelu (metsikkö) + terävä (yksittäiset puut).
    const broad = valueNoise(p.x / 90, p.y / 90, 21);
    const spike = Math.abs(valueNoise(p.x / 5, p.y / 5, 22));
    // Korostettu korkeus, jotta metsänreuna erottuu kilometrin päästä.
    // Pelloilla, pihoilla ja rannoilla ei ole metsänreunaa.
    const kind = cover?.kindAt({ x, y }) ?? null;
    const open = kind !== null && OPEN_LAND.has(kind);
    const base = Math.max(0, ground.heightAt({ x, y })) - 0.5;
    const h = narrow ? 0 : open ? 0.5 : (15 + broad * 6 + spike * 7) * heightScale;
    positions.push(x, base, -y, x, base + h, -y);
    if (last) along += Math.hypot(x - last.x, y - last.y);
    last = { x, y };
    uvs.push(along / FOREST_TEXTURE_METERS, 0, along / FOREST_TEXTURE_METERS, 1);
    // Sävy vaihtuu metsiköittäin pehmeästi: näytteittäin vaihtuva väri
    // näkyi läheltä pystyraitoina.
    c.lerpColors(mid, broad > 0 ? birch : dark, Math.min(1, Math.abs(broad) * 1.5));
    colors.push(c.r * 0.7, c.g * 0.7, c.b * 0.7, c.r, c.g, c.b);
    const a = i * 2;
    const b = ((i + 1) % n) * 2;
    index.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(index);
  return new THREE.Mesh(g, material);
}

/**
 * Metsänreunan kuvio, joka kerrotaan siluetin värillä: yläreunassa kuusten
 * latvoja, keskellä havuja ja alhaalla runkoja. Ilman kuviota siluetti
 * näytti läheltä tasaiselta vihreältä seinältä.
 */
function createForestTexture(): THREE.Texture {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  // Kiinteä siemen, jotta kuvio on aina sama.
  let seed = 17;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const px = (x: number, y: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(((x % size) + size) % size, y, 1, 1);
  };
  // Latvat: kapenevat kartiot eri korkeuksilta, toistuvat saumattomasti.
  for (let cx = 1; cx < size; cx += 3 + Math.floor(rand() * 3)) {
    const tip = Math.floor(rand() * 7);
    for (let y = tip; y < size; y++) {
      const half = Math.floor((y - tip) * 0.45);
      for (let x = cx - half; x <= cx + half; x++) {
        const shade = rand();
        px(x, y, shade < 0.2 ? '#a0a0a0' : shade < 0.3 ? '#d0d0d0' : '#ffffff');
      }
    }
  }
  // Rungot metsän alaosassa.
  for (let x = 0; x < size; x += 2 + Math.floor(rand() * 3))
    for (let y = size - 8 + Math.floor(rand() * 4); y < size; y++) px(x, y, '#707070');
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.magFilter = THREE.NearestFilter;
  // Pienennökset pitävät latvojen ääriviivat (ks. halveSprite), joten kaukainen
  // metsänreuna ei haalistu läpinäkyväksi eikä välky.
  texture.minFilter = THREE.NearestMipmapNearestFilter;
  texture.generateMipmaps = false;
  const level0 = ctx.getImageData(0, 0, size, size);
  texture.mipmaps = [level0, ...spriteMipmaps(level0).map((l) => new ImageData(l.data, l.width))];
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Tasavälinen näytteistys suljetusta rantaviivasta. */
function resample(ring: readonly Vec2[], step: number): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const count = Math.max(1, Math.round(len / step));
    for (let k = 0; k < count; k++) {
      const t = k / count;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}
