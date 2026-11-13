import * as THREE from 'three';
import { GLOW, LIGHT, VEIL } from './veil';

/** Lisättyjen osien nimi: pyöristys ja varjot ohittavat ne (`modern-`). */
const ADDED = 'modern-bolt';
/** Pelin salaman jana jaetaan näin moneen osaan, ja osien päät poikkeavat sivuun (osuus janasta). */
const SPLIT = 3;
const JITTER = 0.09;
/**
 * Kerrokset pelin salaman puolileveydestä: valkoinen ydin (valonlähde) ja sen
 * ympärillä kaksi hehkua, jotka haalistuvat reunaa kohti.
 */
const CORE = 0.26;
const SHEATHS = [
  { width: 1.5, color: 0xd6ecff, power: 0.9 },
  { width: 5.5, color: 0x6fa8e6, power: 0.4 },
] as const;
/** Tätä jyrkemmin katsojaa kohti osoittava pätkä (sivusuunnan sini) pitää edellisen sivusuunnan. */
const TURN = 0.03;
/** Hehku hiipuu mutkassa: suuntien pistetulo ruudulla, jolla hehku on poissa ja täysi. */
const BEND: [number, number] = [-0.2, 0.6];
/** Haara kapenee kärkeä kohti tähän osuuteen. */
const TIP = 0.15;
/** Kaukainen salama rintaman alla hehkuu heikommin, samoin välähdysten välissä. */
const FAR_POWER = 0.45;
const DIM_POWER = 0.6;
/** Iskukohdan hehku pelin valopallon koosta ja shokkiaallon peitto alussa. */
const FLARE = { size: 2.4, lift: 0.12 } as const;
const RING_ALPHA = 0.7;
/** Shokkiaallon renkaat pelin renkaan säteestä: [sisäreuna, ulkoreuna, peitto]. */
const SHOCK = [
  [0.955, 1, 1],
  [0.78, 0.81, 0.45],
] as const;

/** Suurin määrä solmuja: pelin janat (18 + 3 × 5) jaettuina ja polkujen alkupisteet. */
const MAX_NODES = (18 + 3 * 5) * SPLIT + 4;

const FLARE_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** Pehmeä valopallo: kirkas keskus ja laajalle hiipuva kehä. */
const FLARE_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uPower;
  varying vec2 vUv;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float halo = pow(max(0.0, 1.0 - d), 2.2);
    float core = pow(max(0.0, 1.0 - d * 3.0), 1.5);
    gl_FragColor = vec4(uColor, (0.55 * halo + core) * uPower);
  }
`;

interface Node {
  p: THREE.Vector3;
  /** Pelin salaman puolileveys tässä kohdassa (m) ja kavennus 0–1. */
  w: number;
  taper: number;
  /** Polun ensimmäinen solmu: edelliseen ei piirretä nauhaa. */
  start: boolean;
}

const a = new THREE.Vector3();
const b = new THREE.Vector3();
const prev = new THREE.Vector3();
const mid = new THREE.Vector3();
const tangent = new THREE.Vector3();
const side = new THREE.Vector3();
const lastSide = new THREE.Vector3();
const ray = new THREE.Vector3();
const turnIn = new THREE.Vector3();
const turnOut = new THREE.Vector3();
const toEye = new THREE.Vector3();
const eye = new THREE.Vector3();
const tint = new THREE.Color();

/** Toistettava luku −1…1 janan ja sen osan numerosta. */
const jitter = (i: number, k: number, salt: number): number => {
  const x = Math.sin(i * 127.1 + k * 311.7 + salt * 74.7) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
};

/**
 * Pelin salaman nauhasta (neljä kärkeä janaa kohden) solmut: janojen päät,
 * välissä sivuun poikkeavat lisäsolmut, jotta kanava ei ole viivoittimella
 * vedetty. Uusi polku (haara) alkaa, kun jana ei jatka edellisen päästä.
 */
export function boltNodes(position: ArrayLike<number>, quads: number, out: Node[]): number {
  let n = 0;
  let path = 0;
  const node = (p: THREE.Vector3, w: number, start: boolean) => {
    const slot = (out[n] ??= { p: new THREE.Vector3(), w: 0, taper: 1, start: false });
    slot.p.copy(p);
    slot.w = w;
    slot.start = start;
    slot.taper = 1;
    n++;
  };
  /** Haaran solmut kapenevat kärkeä kohti; pääkanava on tasapaksu. */
  const close = (from: number) => {
    if (path === 0 || n - from < 2) return;
    for (let i = from; i < n; i++) out[i]!.taper = 1 - (1 - TIP) * ((i - from) / (n - 1 - from));
  };
  let first = 0;
  for (let i = 0; i < quads && n + SPLIT < MAX_NODES; i++) {
    const o = i * 12;
    a.set(
      (position[o]! + position[o + 3]!) / 2,
      (position[o + 1]! + position[o + 4]!) / 2,
      (position[o + 2]! + position[o + 5]!) / 2,
    );
    b.set(
      (position[o + 6]! + position[o + 9]!) / 2,
      (position[o + 7]! + position[o + 10]!) / 2,
      (position[o + 8]! + position[o + 11]!) / 2,
    );
    const w =
      Math.hypot(
        position[o + 3]! - position[o]!,
        position[o + 4]! - position[o + 1]!,
        position[o + 5]! - position[o + 2]!,
      ) / 2;
    if (i === 0 || a.distanceToSquared(prev) > 1e-4) {
      if (i > 0) {
        close(first);
        path++;
      }
      first = n;
      node(a, w, true);
    }
    const len = a.distanceTo(b);
    // Sivusuunta janaan nähden: mikä tahansa sitä vastaan kohtisuora.
    tangent.subVectors(b, a);
    side.set(tangent.z, 0, -tangent.x);
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    side.normalize();
    for (let k = 1; k <= SPLIT; k++) {
      mid.lerpVectors(a, b, k / SPLIT);
      if (k < SPLIT) {
        mid.addScaledVector(side, jitter(i, k, path) * JITTER * len);
        mid.y += jitter(i, k, path + 9) * JITTER * len * 0.5;
      }
      node(mid, w, false);
    }
    prev.copy(b);
  }
  close(first);
  return n;
}

/** Shokkiaalto: ohut ulkorengas ja sen sisällä himmeämpi, kuten väreissä. */
function shockShape(): THREE.BufferGeometry {
  const position: number[] = [];
  const color: number[] = [];
  const index: number[] = [];
  const around = 96;
  SHOCK.forEach(([inner, outer, alpha]) => {
    const base = position.length / 3;
    for (let i = 0; i <= around; i++) {
      const angle = (i / around) * Math.PI * 2;
      const x = Math.cos(angle);
      const z = Math.sin(angle);
      // Kolme kehää: reunat läpinäkyviä, keskikehä täysi.
      for (const [r, a] of [
        [inner, 0],
        [(inner + outer) / 2, alpha],
        [outer, 0],
      ] as const) {
        position.push(x * r, 0, z * r);
        color.push(1, 1, 1, a);
      }
    }
    for (let i = 0; i < around; i++) {
      const p = base + i * 3;
      index.push(p, p + 3, p + 1, p + 1, p + 3, p + 4, p + 1, p + 4, p + 2, p + 2, p + 4, p + 5);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(color, 4));
  geometry.setIndex(index);
  return geometry;
}

/**
 * Salama Modernissa ilmeessä (#650): pelin salaman nauha (`lightning`: `bolt`,
 * `bolt-halo`, `bolt-glow`, `bolt-ring`) piirretään ohuena valkoisena ytimenä,
 * jonka ympärillä on pehmeä sinertävä hehku. Iskukohdassa on pehmeä valopallo
 * pikselikuvan tilalla, ja shokkiaalto haalistuu laajetessaan. Paikka, muoto,
 * välke ja koko kuvan välähdys (`SkyView.grade`) ovat pelin.
 */
export class Bolts {
  private group: THREE.Object3D | null = null;
  private parts: {
    bolt: THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
    halo: THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
    glow: THREE.Sprite;
    ring: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  } | null = null;
  private readonly nodes: Node[] = [];
  private readonly core: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly sheath: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly flare: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly ring: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly added: THREE.Object3D[];

  constructor() {
    // Ydin: kaksi kärkeä solmua kohden. Hehku: kolme (reuna, keskus, reuna) kerrosta kohden.
    const coreGeo = new THREE.BufferGeometry();
    coreGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(MAX_NODES * 2 * 3), 3),
    );
    coreGeo.setIndex(new THREE.BufferAttribute(new Uint16Array((MAX_NODES - 1) * 6), 1));
    this.core = new THREE.Mesh(
      coreGeo,
      new THREE.MeshBasicMaterial({
        color: 0xf6f9ff,
        side: THREE.DoubleSide,
        fog: false,
        ...LIGHT,
      }),
    );
    this.core.renderOrder = 1;
    const sheathGeo = new THREE.BufferGeometry();
    const sheathVerts = MAX_NODES * 3 * SHEATHS.length;
    sheathGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(sheathVerts * 3), 3),
    );
    sheathGeo.setAttribute(
      'color',
      new THREE.BufferAttribute(new Float32Array(sheathVerts * 4), 4),
    );
    sheathGeo.setIndex(
      new THREE.BufferAttribute(new Uint16Array((MAX_NODES - 1) * 12 * SHEATHS.length), 1),
    );
    this.sheath = new THREE.Mesh(
      sheathGeo,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
        fog: false,
        ...GLOW,
      }),
    );
    this.flare = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.ShaderMaterial({
        vertexShader: FLARE_VERT,
        fragmentShader: FLARE_FRAG,
        uniforms: { uColor: { value: new THREE.Color(0xfff0cf) }, uPower: { value: 1 } },
        ...GLOW,
      }),
    );
    const ringGeo = shockShape();
    this.ring = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
        fog: false,
        ...VEIL,
      }),
    );
    this.added = [this.sheath, this.core, this.flare, this.ring];
    for (const o of this.added) {
      o.name = ADDED;
      o.frustumCulled = false;
      o.visible = false;
    }
  }

  /** Pelin salamaryhmä; `null` irrottaa (kohtaus vaihtui). */
  bind(group: THREE.Object3D | null): void {
    if (group === this.group) return;
    this.release();
    this.group = group;
    if (!group) return;
    const find = (name: string) => group.children.find((c) => c.name === name);
    const bolt = find('bolt');
    const halo = find('bolt-halo');
    const glow = find('bolt-glow');
    const ring = find('bolt-ring');
    if (!bolt || !halo || !glow || !ring) return;
    this.parts = {
      bolt: bolt as THREE.Mesh<THREE.BufferGeometry, THREE.Material>,
      halo: halo as THREE.Mesh<THREE.BufferGeometry, THREE.Material>,
      glow: glow as THREE.Sprite,
      ring: ring as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>,
    };
    for (const part of Object.values(this.parts)) part.material.visible = false;
    this.ring.material.color.copy(this.parts.ring.material.color);
    group.add(...this.added);
  }

  update(camera: THREE.Camera): void {
    const parts = this.parts;
    if (!parts) return;
    const { bolt, halo, glow, ring } = parts;
    const far = this.group!.userData.far === true;
    const power = (far ? FAR_POWER : 1) * (halo.visible || far ? 1 : DIM_POWER);

    this.flare.visible = glow.visible;
    if (glow.visible) {
      const size = glow.scale.x * FLARE.size;
      this.flare.scale.setScalar(size);
      this.flare.position.copy(glow.position);
      this.flare.position.y += size * FLARE.lift;
      this.flare.quaternion.copy(camera.quaternion);
      this.flare.material.uniforms.uPower!.value = bolt.visible ? power : power * 0.5;
    }

    this.ring.visible = ring.visible;
    if (ring.visible) {
      this.ring.position.copy(ring.position);
      this.ring.scale.copy(ring.scale);
      const life = (ring.userData.life as number | undefined) ?? 0;
      this.ring.material.opacity = RING_ALPHA * Math.pow(Math.max(0, 1 - life), 1.5);
    }

    const quads = Math.floor(bolt.geometry.drawRange.count / 6);
    const shown = bolt.visible && quads > 0 && Number.isFinite(quads);
    this.core.visible = shown;
    this.sheath.visible = shown;
    if (!shown) return;
    const n = boltNodes(bolt.geometry.getAttribute('position').array, quads, this.nodes);
    this.ribbons(n, camera, power);
  }

  /** Nauhat solmuista kameraa kohti käännettyinä. */
  private ribbons(n: number, camera: THREE.Camera, power: number): void {
    const nodes = this.nodes;
    const above = (camera as THREE.OrthographicCamera).isOrthographicCamera === true;
    eye.setFromMatrixPosition(camera.matrixWorld);
    if (above) camera.getWorldDirection(toEye).negate();
    const corePos = this.core.geometry.getAttribute('position') as THREE.BufferAttribute;
    const sheathPos = this.sheath.geometry.getAttribute('position') as THREE.BufferAttribute;
    const sheathCol = this.sheath.geometry.getAttribute('color') as THREE.BufferAttribute;
    const cp = corePos.array as Float32Array;
    const sp = sheathPos.array as Float32Array;
    const sc = sheathCol.array as Float32Array;
    const coreIndex = this.core.geometry.getIndex()!;
    const sheathIndex = this.sheath.geometry.getIndex()!;
    const ci = coreIndex.array as Uint16Array;
    const si = sheathIndex.array as Uint16Array;
    let cn = 0;
    let sn = 0;
    for (let i = 0; i < n; i++) {
      const node = nodes[i]!;
      const before = node.start ? node : nodes[i - 1]!;
      const last = i + 1 >= n || nodes[i + 1]!.start;
      const after = last ? node : nodes[i + 1]!;
      tangent.subVectors(after.p, before.p);
      if (!above) toEye.subVectors(eye, node.p);
      side.crossVectors(tangent, toEye);
      // Suoraan katsojaa kohti osoittava pätkä ei kerro sivusuuntaa: nauha jatkaa
      // edellisen solmun suuntaan eikä kierry itsensä ympäri.
      const flat = side.length() / (tangent.length() * toEye.length() || 1);
      if (flat < TURN && !node.start) side.copy(lastSide);
      else side.normalize();
      if (!node.start && side.dot(lastSide) < 0) side.negate();
      lastSide.copy(side);
      // Ylhäältä salama on siksakkia, ja leveä hehku taittuisi jyrkässä mutkassa
      // kulmikkaaksi laataksi: hehku hiipuu mutkaan ja haaran kärkeen.
      ray.copy(toEye).normalize();
      turnIn.subVectors(node.p, before.p).addScaledVector(ray, -turnIn.dot(ray)).normalize();
      turnOut.subVectors(after.p, node.p).addScaledVector(ray, -turnOut.dot(ray)).normalize();
      const straight = node.start || last ? 1 : turnIn.dot(turnOut);
      const soft =
        THREE.MathUtils.smoothstep(straight, BEND[0], BEND[1]) *
        (last && node.taper < 1 ? 0 : 0.4 + 0.6 * node.taper);
      const w = node.w * node.taper;
      const c = i * 6;
      a.copy(node.p)
        .addScaledVector(side, -w * CORE)
        .toArray(cp, c);
      a.copy(node.p)
        .addScaledVector(side, w * CORE)
        .toArray(cp, c + 3);
      if (!node.start) {
        const v = i * 2;
        ci.set([v - 2, v - 1, v, v, v - 1, v + 1], cn);
        cn += 6;
      }
      SHEATHS.forEach((layer, l) => {
        const v = (l * MAX_NODES + i) * 3;
        const reach = w * layer.width;
        a.copy(node.p)
          .addScaledVector(side, -reach)
          .toArray(sp, v * 3);
        node.p.toArray(sp, v * 3 + 3);
        a.copy(node.p)
          .addScaledVector(side, reach)
          .toArray(sp, v * 3 + 6);
        tint.set(layer.color);
        for (let e = 0; e < 3; e++) {
          const k = (v + e) * 4;
          sc[k] = tint.r;
          sc[k + 1] = tint.g;
          sc[k + 2] = tint.b;
          // Hehku on täysi keskellä ja nolla reunalla.
          sc[k + 3] = e === 1 ? layer.power * power * soft : 0;
        }
        if (!node.start) {
          si.set([v - 3, v - 2, v, v, v - 2, v + 1, v - 2, v - 1, v + 1, v + 1, v - 1, v + 2], sn);
          sn += 12;
        }
      });
    }
    this.core.geometry.setDrawRange(0, cn);
    this.sheath.geometry.setDrawRange(0, sn);
    coreIndex.needsUpdate = true;
    sheathIndex.needsUpdate = true;
    corePos.needsUpdate = true;
    sheathPos.needsUpdate = true;
    sheathCol.needsUpdate = true;
  }

  private release(): void {
    if (this.parts) for (const part of Object.values(this.parts)) part.material.visible = true;
    for (const o of this.added) {
      o.removeFromParent();
      o.visible = false;
    }
    this.parts = null;
    this.group = null;
  }

  dispose(): void {
    this.release();
    for (const mesh of [this.core, this.sheath, this.flare, this.ring]) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
  }
}
