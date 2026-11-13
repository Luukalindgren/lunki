import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { finShape } from './gearShapes';

/** Kohtaus käydään läpi näin monen ruudun välein: uudet osat (muut pelaajat, vene) pehmenevät. */
const SCAN_FRAMES = 20;
/** Laatikon kulman pyöristys: osuus lyhimmästä sivusta ja suurin säde (m). */
const CORNER_SHARE = 0.42;
const CORNER_MAX = 0.12;
/** Näin monikulmainen tai harvempi lieriö on tarkoituksella särmiö, eikä sitä pyöristetä. */
const PRISM_SIDES = 4;
/** Pyöreän muodon kehän jako vähintään. */
const ROUND = { sphere: [20, 14], cylinder: 20, torusTube: 14, torusTurn: 40 } as const;

/** Näiden alla ei ole pelin perusmuodoista tehtyjä malleja: maisema, vesi ja taivas. */
export const SKIP = /^(static-|modern-)|^(lake|bottom|sky|water|swell|mist|weather)$/;

/**
 * Pelin nimeämät osat (`userData.shape`), joilla on Modernissa oma muotoiltu
 * malli: rakennetaan alkuperäisen muodon mittoihin ja paikkaan.
 */
const SHAPES: Record<string, (bounds: THREE.Box3) => THREE.BufferGeometry> = {
  fin: finShape,
};

type Params = Record<string, number | boolean | undefined>;

const num = (v: number | boolean | undefined, fallback: number): number =>
  typeof v === 'number' ? v : fallback;

/** Sama perusmuoto uudelleen: `detail` = false antaa alkuperäisen jaon, true tiheän ja pyöristetyn. */
function primitive(type: string, p: Params, detail: boolean): THREE.BufferGeometry | null {
  switch (type) {
    case 'BoxGeometry': {
      const w = num(p.width, 1);
      const h = num(p.height, 1);
      const d = num(p.depth, 1);
      if (!detail)
        return new THREE.BoxGeometry(
          w,
          h,
          d,
          num(p.widthSegments, 1),
          num(p.heightSegments, 1),
          num(p.depthSegments, 1),
        );
      const radius = Math.min(Math.min(w, h, d) * CORNER_SHARE, CORNER_MAX);
      return new RoundedBoxGeometry(w, h, d, radius < 0.03 ? 2 : 3, radius);
    }
    case 'SphereGeometry': {
      const across = num(p.widthSegments, 32);
      const down = num(p.heightSegments, 16);
      if (detail && across >= ROUND.sphere[0] && down >= ROUND.sphere[1]) return null;
      return new THREE.SphereGeometry(
        num(p.radius, 1),
        detail ? Math.max(across, ROUND.sphere[0]) : across,
        detail ? Math.max(down, ROUND.sphere[1]) : down,
        num(p.phiStart, 0),
        num(p.phiLength, Math.PI * 2),
        num(p.thetaStart, 0),
        num(p.thetaLength, Math.PI),
      );
    }
    case 'CylinderGeometry': {
      const sides = num(p.radialSegments, 32);
      if (detail && (sides <= PRISM_SIDES || sides >= ROUND.cylinder)) return null;
      return new THREE.CylinderGeometry(
        num(p.radiusTop, 1),
        num(p.radiusBottom, 1),
        num(p.height, 1),
        detail ? Math.max(sides, ROUND.cylinder) : sides,
        num(p.heightSegments, 1),
        p.openEnded === true,
        num(p.thetaStart, 0),
        num(p.thetaLength, Math.PI * 2),
      );
    }
    case 'TorusGeometry': {
      const arc = num(p.arc, Math.PI * 2);
      const turn = Math.ceil((arc / (Math.PI * 2)) * ROUND.torusTurn);
      const around = num(p.radialSegments, 12);
      const along = num(p.tubularSegments, 48);
      if (detail && around >= ROUND.torusTube && along >= turn) return null;
      return new THREE.TorusGeometry(
        num(p.radius, 1),
        num(p.tube, 0.4),
        detail ? Math.max(around, ROUND.torusTube) : around,
        detail ? Math.max(along, turn) : along,
        arc,
      );
    }
    default:
      return null;
  }
}

const a = new THREE.Vector3();
const b = new THREE.Vector3();
const c = new THREE.Vector3();

/**
 * Muunnos, jonka peli on leiponut perusmuotoon sen luomisen jälkeen
 * (`translate`, `rotateX`…): ratkaistaan vertaamalla kärkiä samoilla
 * mitoilla tehtyyn muotoon. Null, jos muoto ei ole enää sama (kärkiä
 * on siirretty yksitellen) tai muunnos peilaa sen. Jos peli muokkaa kärkiä
 * itse (täyttökisan lässähdys), se antaa lepomuodon `userData.rest`issä.
 */
export function bakedTransform(geometry: THREE.BufferGeometry): THREE.Matrix4 | null {
  const params = (geometry as { parameters?: Params }).parameters;
  if (!params) return null;
  const reference = primitive(geometry.type, params, false);
  if (!reference) return null;
  const from = reference.getAttribute('position');
  const rest = geometry.userData.rest as Float32Array | undefined;
  const to = rest ? new THREE.BufferAttribute(rest, 3) : geometry.getAttribute('position');
  reference.dispose();
  if (!to || from.count !== to.count || from.count < 4) return null;

  // Neljä kärkeä, jotka eivät ole samassa tasossa: kauimmainen ensimmäisestä,
  // kauimmainen niiden suorasta ja kauimmainen kolmen tasosta.
  const point = (attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, i: number) =>
    new THREE.Vector3().fromBufferAttribute(attr, i);
  const p0 = point(from, 0);
  let i1 = 0;
  let i2 = 0;
  let i3 = 0;
  let best = 0;
  for (let i = 1; i < from.count; i++) {
    const d = a.fromBufferAttribute(from, i).distanceToSquared(p0);
    if (d > best) [best, i1] = [d, i];
  }
  const e1 = point(from, i1).sub(p0);
  best = 0;
  for (let i = 1; i < from.count; i++) {
    const d = a.fromBufferAttribute(from, i).sub(p0).cross(e1).lengthSq();
    if (d > best) [best, i2] = [d, i];
  }
  const e2 = point(from, i2).sub(p0);
  const normal = b.copy(e1).cross(e2);
  best = 0;
  for (let i = 1; i < from.count; i++) {
    const d = Math.abs(a.fromBufferAttribute(from, i).sub(p0).dot(normal));
    if (d > best) [best, i3] = [d, i];
  }
  if (best < 1e-12) return null;
  const e3 = point(from, i3).sub(p0);

  const q0 = point(to, 0);
  const basis = new THREE.Matrix3().set(e1.x, e2.x, e3.x, e1.y, e2.y, e3.y, e1.z, e2.z, e3.z);
  const f1 = point(to, i1).sub(q0);
  const f2 = point(to, i2).sub(q0);
  const f3 = point(to, i3).sub(q0);
  const image = new THREE.Matrix3().set(f1.x, f2.x, f3.x, f1.y, f2.y, f3.y, f1.z, f2.z, f3.z);
  const linear = image.multiply(basis.invert());
  if (linear.determinant() <= 0) return null;
  const shift = q0.sub(p0.clone().applyMatrix3(linear));
  const matrix = new THREE.Matrix4().setFromMatrix3(linear).setPosition(shift);

  // Muunnoksen pitää selittää jokainen kärki.
  reference.computeBoundingSphere();
  const tolerance = Math.max(1e-4, (reference.boundingSphere?.radius ?? 1) * 1e-3);
  for (let i = 0; i < from.count; i++) {
    a.fromBufferAttribute(from, i).applyMatrix4(matrix);
    if (a.distanceTo(c.fromBufferAttribute(to, i)) > tolerance) return null;
  }
  return matrix;
}

/**
 * Perusmuodon pehmeä versio samassa paikassa ja asennossa: laatikon kulmat
 * pyöristetään ja pallo, lieriö ja rengas saavat tiheän jaon. Null, jos
 * muotoa ei pehmennetä (muu kuin perusmuoto, särmiö tai muokattu muoto).
 */
export function softGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry | null {
  const params = (geometry as { parameters?: Params }).parameters;
  if (!params) return null;
  const soft = primitive(geometry.type, params, true);
  if (!soft) return null;
  const matrix = bakedTransform(geometry);
  if (!matrix) {
    soft.dispose();
    return null;
  }
  soft.applyMatrix4(matrix);
  return soft;
}

/**
 * Sama muoto pinnan oikeilla normaaleilla (`userData.normals`): peli kallistaa
 * veneen pintojen normaalit ylös, koska paletti pyöristäisi varjon puolen
 * väärään väriin. Ilman palettia pinnat valaistaan suunnastaan.
 */
function trueNormals(geometry: THREE.BufferGeometry): THREE.BufferGeometry | null {
  const normals = geometry.userData.normals as Float32Array | undefined;
  const now = geometry.getAttribute('normal');
  if (!normals || !now || normals.length !== now.count * 3) return null;
  const plain = geometry.clone();
  plain.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  return plain;
}

const lit = (m: THREE.Material | THREE.Material[]): boolean =>
  !Array.isArray(m) &&
  (m instanceof THREE.MeshLambertMaterial ||
    m instanceof THREE.MeshPhongMaterial ||
    m instanceof THREE.MeshStandardMaterial) &&
  !m.map;

/**
 * Pehmentää pelin perusmuodoista kootut mallit (kalastaja, rengas, räpylät,
 * vene, vapa, kädet): jokainen valaistu laatikko, pallo, lieriö ja rengas
 * vaihtuu pyöristettyyn versioon samassa paikassa. Osat ovat edelleen pelin
 * omia, joten liike, värit ja täyttökisan lässähdys toimivat kuten ennen, ja
 * uusi samalla tavalla tehty osa pehmenee itsestään.
 */
export class Softener {
  private readonly swapped = new Map<
    THREE.Mesh,
    { original: THREE.BufferGeometry; soft: THREE.BufferGeometry; own: boolean }
  >();
  /** Sama muoto samassa asennossa jaetaan (pelaajien renkaat ja jäsenet). */
  private readonly cache = new Map<string, THREE.BufferGeometry | null>();
  private frames = 0;

  constructor(private readonly scene: THREE.Scene) {}

  update(): void {
    if (this.frames++ % SCAN_FRAMES === 0) this.scan(this.scene);
  }

  private scan(o: THREE.Object3D): void {
    if (SKIP.test(o.name)) return;
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && !(o as THREE.InstancedMesh).isInstancedMesh) this.soften(mesh);
    for (const child of o.children) this.scan(child);
  }

  private soften(mesh: THREE.Mesh): void {
    const known = this.swapped.get(mesh);
    if (known?.soft === mesh.geometry) return;
    // Peli vaihtoi osan muodon: vanha pari unohdetaan.
    if (known) {
      if (known.own) known.soft.dispose();
      this.swapped.delete(mesh);
    }
    if (!lit(mesh.material)) return;
    const original = mesh.geometry;
    // Muoto, jonka kärkiä peli muokkaa, saa oman kopionsa; muut jaetaan.
    const own = original.userData.rest !== undefined;
    const soft = own ? softGeometry(original) : this.shared(mesh);
    if (!soft) return;
    mesh.geometry = soft;
    // Alkuperäinen jää talteen ilman näytönohjaimen puskureita, kunnes ilme vaihtuu.
    original.dispose();
    this.swapped.set(mesh, { original, soft, own });
    reshape(mesh);
  }

  private shared(mesh: THREE.Mesh): THREE.BufferGeometry | null {
    const original = mesh.geometry;
    const shape = SHAPES[mesh.userData.shape as string];
    const key = shape
      ? shapeKey(mesh.userData.shape as string, original)
      : original.userData.normals
        ? `normals|${original.uuid}`
        : cacheKey(original);
    if (!key) return null;
    let soft = this.cache.get(key);
    if (soft === undefined) {
      if (shape) {
        original.computeBoundingBox();
        soft = shape(original.boundingBox!);
      } else soft = trueNormals(original) ?? softGeometry(original);
      this.cache.set(key, soft);
    }
    return soft;
  }

  dispose(): void {
    for (const [mesh, { original, soft, own }] of this.swapped) {
      if (mesh.geometry === soft) {
        mesh.geometry = original;
        reshape(mesh);
      }
      if (own) soft.dispose();
    }
    this.swapped.clear();
    for (const soft of this.cache.values()) soft?.dispose();
    this.cache.clear();
  }
}

/** Peli sovittaa itse muokkaamansa osan vaihdettuun muotoon (`userData.reshape`). */
function reshape(mesh: THREE.Mesh): void {
  const fit = mesh.userData.reshape as (() => void) | undefined;
  fit?.();
}

/** Avain nimetylle muodolle: sama malli samoihin mittoihin jaetaan. */
function shapeKey(shape: string, geometry: THREE.BufferGeometry): string {
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox!;
  return `shape|${shape}|${[...min.toArray(), ...max.toArray()].map((v) => v.toFixed(4)).join(',')}`;
}

/** Avain muodolle ja sen asennolle; null, jos muoto ei ole perusmuoto. */
function cacheKey(geometry: THREE.BufferGeometry): string | null {
  const params = (geometry as { parameters?: Params }).parameters;
  if (!params || !/^(Box|Sphere|Cylinder|Torus)Geometry$/.test(geometry.type)) return null;
  const position = geometry.getAttribute('position');
  if (!position || position.count < 4) return null;
  // Asento tiivistyy ensimmäiseen, keskimmäiseen ja viimeiseen kärkeen.
  const marks = [0, position.count >> 1, position.count - 1]
    .map(
      (i) =>
        `${position.getX(i).toFixed(4)},${position.getY(i).toFixed(4)},${position.getZ(i).toFixed(4)}`,
    )
    .join(';');
  return `${geometry.type}|${JSON.stringify(params)}|${marks}`;
}
