import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Toistettava satunnaisluku 0–1: sama maisema joka kerta. */
export function seeded(seed: number): () => number {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

export const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

/** Pehmeä porras 0–1 välillä a…b. */
export function sstep(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

const hash = (x: number, y: number, z: number): number => {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

/** Pehmeä kolmiulotteinen kohina −1…1 muotojen ja sävyjen vaihteluun. */
export function noise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = x - xi;
  const yf = y - yi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const w = zf * zf * (3 - 2 * zf);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const face = (k: number) =>
    l(
      l(hash(xi, yi, k), hash(xi + 1, yi, k), u),
      l(hash(xi, yi + 1, k), hash(xi + 1, yi + 1, k), u),
      v,
    );
  return l(face(zi), face(zi + 1), w) * 2 - 1;
}

const scratch = new THREE.Color();
const other = new THREE.Color();

/** Kahden värin sekoitus (0 = a, 1 = b) työväriin, joka on voimassa seuraavaan kutsuun. */
export function mixColor(a: THREE.ColorRepresentation, b: THREE.ColorRepresentation, t: number) {
  return scratch.set(a).lerp(other.set(b), clamp01(t));
}

/**
 * Värittää muodon kärjet: väri kärjen paikasta ja normaalin pystyosasta
 * (ylöspäin 1, alaspäin −1). Maalatun tyylin sävyt ovat kärjissä, ei kuvissa.
 */
export function paint(
  geo: THREE.BufferGeometry,
  colorAt: (x: number, y: number, z: number, up: number) => THREE.ColorRepresentation,
): THREE.BufferGeometry {
  const p = geo.getAttribute('position');
  const n = geo.getAttribute('normal');
  const colors = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    c.set(colorAt(p.getX(i), p.getY(i), p.getZ(i), n ? n.getY(i) : 1));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

/** Yhdistää saumojen kärjet ja laskee normaalit: pinta varjostuu pehmeästi ilman särmiä. */
export function smooth(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  geo.deleteAttribute('uv');
  geo.deleteAttribute('normal');
  const merged = mergeVertices(geo, 1e-4);
  merged.computeVertexNormals();
  if (merged !== geo) geo.dispose();
  return merged;
}

/** Särmikäs kappale (laatikko, lieriö) yhdistettäväksi: ei kuvakoordinaatteja. */
export function solid(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  geo.deleteAttribute('uv');
  return geo;
}

const spheres = new Map<number, THREE.BufferGeometry>();

/** Yksikköpallo saumat yhdistettyinä; jokainen kumpare on tämän kopio. */
function sphere(detail: number): THREE.BufferGeometry {
  let geo = spheres.get(detail);
  if (!geo) spheres.set(detail, (geo = smooth(new THREE.IcosahedronGeometry(1, detail))));
  return geo;
}

/**
 * Sileä kumpare: pallo, jonka pintaa on muotoiltu kohinalla. `sy` litistää
 * pystysuunnassa, `amp` on muotoilun voimakkuus ja `detail` pinnan tarkkuus.
 */
export function blob(
  rand: () => number,
  radius: number,
  sy: number,
  amp: number,
  freq: number,
  center: readonly [number, number, number],
  detail: number,
): THREE.BufferGeometry {
  const geo = sphere(detail).clone();
  const p = geo.getAttribute('position');
  const o = rand() * 50;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = 1 + amp * noise3(x * freq + o, y * freq + o, z * freq);
    p.setXYZ(
      i,
      center[0] + x * radius * k,
      center[1] + y * radius * sy * k,
      center[2] + z * radius * k,
    );
  }
  geo.computeVertexNormals();
  return geo;
}

/** Yhdistää osat yhdeksi verkoksi ja vapauttaa osat. */
export function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts);
  parts.forEach((g) => g.dispose());
  if (!merged) throw new Error('modernin ilmeen osia ei voitu yhdistää');
  return merged;
}

/** Maalatun tyylin pinta: sävyt kärjissä, valo ja varjot pelin omasta valosta. */
export function paintedMaterial(extra: THREE.MeshLambertMaterialParameters = {}): THREE.Material {
  return new THREE.MeshLambertMaterial({ vertexColors: true, ...extra });
}

/** Yhden kappaleen paikka maisemassa (maailman koordinaatit, y ylös). */
export interface Placement {
  x: number;
  y: number;
  z: number;
  angle: number;
  /** Leveys ja korkeus mallin yksiköistä metreiksi. */
  width: number;
  height: number;
  /** Sävyn kerroin (1 = mallin oma väri). */
  shade?: number;
}

/**
 * Sama malli moneen paikkaan piirtolohkoittain (`chunk` metriä), jotta
 * näkymän ulkopuoliset lohkot jäävät piirtämättä.
 */
export function scatter(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  items: readonly Placement[],
  chunk: number,
): THREE.InstancedMesh[] {
  const lists = new Map<string, Placement[]>();
  for (const item of items) {
    const key = `${Math.floor(item.x / chunk)},${Math.floor(item.z / chunk)}`;
    const list = lists.get(key);
    if (list) list.push(item);
    else lists.set(key, [item]);
  }
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const at = new THREE.Vector3();
  const size = new THREE.Vector3();
  const tint = new THREE.Color();
  const meshes: THREE.InstancedMesh[] = [];
  for (const list of lists.values()) {
    const mesh = new THREE.InstancedMesh(geometry, material, list.length);
    list.forEach((p, i) => {
      m.compose(
        at.set(p.x, p.y, p.z),
        q.setFromAxisAngle(up, p.angle),
        size.set(p.width, p.height, p.width),
      );
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, tint.setScalar(p.shade ?? 1));
    });
    mesh.computeBoundingSphere();
    meshes.push(mesh);
  }
  return meshes;
}

/** Yksikkölaatikon kärjet ja normaalit kolmioina (36 kärkeä), josta `box` tekee kopionsa. */
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();

/**
 * Särmikäs laatikko valmiiksi väritettynä (ei indeksoitu): rakennusten ja
 * laiturien osat. Tehdään tuhansia, joten kärjet kopioidaan yksikkölaatikosta.
 */
export function box(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  color: THREE.ColorRepresentation,
): THREE.BufferGeometry {
  const unit = UNIT_BOX.getAttribute('position').array;
  const n = unit.length;
  const positions = new Float32Array(n);
  const tints = new Float32Array(n);
  const c = scratch.set(color);
  for (let i = 0; i < n; i += 3) {
    positions[i] = unit[i]! * w + x;
    positions[i + 1] = unit[i + 1]! * h + y;
    positions[i + 2] = unit[i + 2]! * d + z;
    tints[i] = c.r;
    tints[i + 1] = c.g;
    tints[i + 2] = c.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', UNIT_BOX.getAttribute('normal').clone());
  geo.setAttribute('color', new THREE.BufferAttribute(tints, 3));
  return geo;
}

/**
 * Saman kohteen mallit tarkimmasta kevyimpään piirtolohkoittain: lohkosta
 * piirretään se taso, jonka matkan sisällä kamera on. Taso null jättää lohkon
 * piirtämättä (pienet osat kaukaa).
 */
export class DetailLevels {
  private readonly items: {
    x: number;
    z: number;
    radius: number;
    levels: readonly (THREE.Object3D | null)[];
  }[] = [];

  add(sphere: THREE.Sphere, levels: readonly (THREE.Object3D | null)[]): void {
    this.items.push({ x: sphere.center.x, z: sphere.center.z, radius: sphere.radius, levels });
  }

  /**
   * `ranges[i]` on matka (m) kamerasta, jonka sisällä piirretään taso i;
   * kauimmaisen takana piirretään viimeinen taso. Matka mitataan vaakatasossa,
   * joten ylhäältä katsova kamera näkee allaan tarkat mallit.
   */
  update(camera: THREE.Camera, ranges: readonly number[]): void {
    const e = camera.matrixWorld.elements;
    for (const item of this.items) {
      const d = Math.hypot(item.x - e[12]!, item.z - e[14]!) - item.radius;
      let level = ranges.findIndex((r) => d < r);
      if (level < 0) level = ranges.length;
      // Sama malli voi olla usealla tasolla, joten valittu taso asetetaan viimeisenä.
      for (const o of item.levels) if (o) o.visible = false;
      const shown = item.levels[level];
      if (shown) shown.visible = true;
    }
  }
}
