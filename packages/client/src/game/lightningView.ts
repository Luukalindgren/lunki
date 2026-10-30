import * as THREE from 'three';
import type { Vec2 } from '@lunki/shared';

/** Salaman näkyvyysaika (s) ja korkeus (m). */
const BOLT_SECONDS = 1.1;
const TOP = 350;
const SEGMENTS = 18;
const BRANCHES = 3;
const BRANCH_SEGMENTS = 5;
/** Salaman ytimen puolileveys vähintään näin monta pikseliä, jotta se näkyy kaukaakin. */
const HALF_WIDTH_PX = 2;
/** Hehkun leveys ytimeen nähden. */
const HALO = 3;
/** Shokkiaalto vedessä: kesto (s) ja suurin säde (m). */
const RING_SECONDS = 0.9;
const RING_RADIUS = 28;
/**
 * Kaukainen salama ukkosrintaman alla (#414): siksak leveämpi, jotta
 * salama näyttää kaukaakin salamalta eikä pylväältä, ja ydin ohuempi
 * (puolileveys pikseleinä) ilman hehkua ja shokkiaaltoa.
 */
const FAR_SPREAD = 2.5;
const FAR_HALF_WIDTH_PX = 0.6;

/**
 * Välähdyksen kirkkaus ajan funktiona (s iskusta): kirkas isku, lyhyt
 * pimeä hetki, pari uutta iskua samaa kanavaa pitkin ja hiipuva
 * jälkihehku, kuten oikeassa salamassa.
 */
export function flashCurve(age: number): number {
  if (age < 0 || age >= BOLT_SECONDS) return 0;
  if (age < 0.08) return 1;
  if (age < 0.14) return 0.15;
  if (age < 0.26) return 1;
  if (age < 0.32) return 0.3;
  if (age < 0.42) return 0.85;
  return 0.6 * (1 - (age - 0.42) / (BOLT_SECONDS - 0.42));
}

/** Ruudun tärinän voimakkuus 0–1 iskun jälkeen (s): heti täysillä, hiipuu nopeasti. */
export function shakeCurve(age: number): number {
  if (age < 0 || age >= 0.8) return 0;
  return (1 - age / 0.8) ** 2;
}

/**
 * Salamanisku: paksu, haarautuva salama taivaalta iskukohtaan, hehku ja
 * shokkiaalto iskukohdassa. Välähdys koko maisemaan tehdään sävytyksellä
 * (ks. SkyView), voimakkuutena `flash`.
 */
export class LightningView {
  readonly group = new THREE.Group();
  private readonly bolt: THREE.Mesh;
  private readonly boltPositions: Float32Array;
  /** Ytimen ympärillä leveämpi, värillinen hehku. */
  private readonly halo: THREE.Mesh;
  private readonly haloPositions: Float32Array;
  private readonly glow: THREE.Sprite;
  /** Shokkiaalto ja höyryrengas iskukohdan vedessä. */
  private readonly ring: THREE.Mesh;
  private readonly paths: THREE.Vector3[][] = [];
  private age = Infinity;
  /** Viimeisin isku oli kaukainen salama rintaman alla. */
  private far = false;
  private seed = 1;
  private readonly side = new THREE.Vector3();
  private readonly toCamera = new THREE.Vector3();
  private readonly seg = new THREE.Vector3();

  constructor() {
    const quads = SEGMENTS + BRANCHES * BRANCH_SEGMENTS;
    this.boltPositions = new Float32Array(quads * 4 * 3);
    this.haloPositions = new Float32Array(quads * 4 * 3);
    const index: number[] = [];
    for (let q = 0; q < quads; q++) {
      const v = q * 4;
      index.push(v, v + 1, v + 2, v + 2, v + 1, v + 3);
    }
    const ribbon = (positions: Float32Array, color: number, order: number) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      g.setIndex(index);
      const m = new THREE.Mesh(
        g,
        new THREE.MeshBasicMaterial({
          color,
          side: THREE.DoubleSide,
          fog: false,
          // Ydin piirretään hehkun päälle, vaikka ne ovat samassa kohdassa.
          depthWrite: order === 1,
          ...LIGHT_SOURCE,
        }),
      );
      m.renderOrder = order;
      m.frustumCulled = false;
      m.visible = false;
      return m;
    };
    // Kylmän sininen hehku: violetti pyöristyi paletissa magentaksi (#409).
    this.halo = ribbon(this.haloPositions, 0x83c2db, 0);
    this.bolt = ribbon(this.boltPositions, 0xeef2f3, 1);
    const ringGeometry = new THREE.RingGeometry(0.9, 1, 32);
    ringGeometry.rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(
      ringGeometry,
      new THREE.MeshBasicMaterial({ color: 0xeef2f3, side: THREE.DoubleSide, fog: false }),
    );
    this.ring.visible = false;
    // Iskukohdan hehku ja vesiroiske: kameraa kohti käännetty valopallo.
    this.glow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTexture(), alphaTest: 0.5, fog: false, ...LIGHT_SOURCE }),
    );
    this.glow.visible = false;
    this.group.add(this.halo, this.bolt, this.glow, this.ring);
    this.group.name = 'lightning';
  }

  /** Välähdyksen voimakkuus 0–1 valaistukseen ja ruudun välähdykseen. */
  get flash(): number {
    return flashCurve(this.age);
  }

  /** Ruudun tärinä 0–1 (kerrotaan iskun läheisyydellä). */
  get shake(): number {
    return shakeCurve(this.age);
  }

  /** Aikaa viimeisimmästä iskusta (s). */
  get sinceStrike(): number {
    return this.age;
  }

  /** `far` = kaukainen salama rintaman alla: ohut, ilman hehkua ja shokkiaaltoa. */
  strike(pos: Vec2, far = false): void {
    this.far = far;
    const spread = far ? FAR_SPREAD : 1;
    this.paths.length = 0;
    const main: THREE.Vector3[] = [];
    let x = pos.x;
    let z = -pos.y;
    // Alhaalta ylös, jotta isku osuu täsmälleen kohtaan `pos`. Siksak
    // sivuttain ja hieman pohjoiseen, joten salama näyttää salamalta myös
    // ylhäältä katsottuna.
    for (let i = 0; i <= SEGMENTS; i++) {
      main.push(new THREE.Vector3(x, (TOP * i) / SEGMENTS, z));
      x += (i % 2 === 0 ? 1 : -1) * (4 + this.rand() * 9) * spread;
      z -= this.rand() * 5 * spread;
    }
    this.paths.push(main);
    // Haarat lähtevät salaman keski- ja yläosasta alas ja sivulle.
    for (let b = 0; b < BRANCHES; b++) {
      const start = main[Math.floor(SEGMENTS * (0.15 + this.rand() * 0.5))]!;
      const dir = this.rand() * Math.PI * 2;
      const branch = [start.clone()];
      let p = start.clone();
      for (let i = 0; i < BRANCH_SEGMENTS; i++) {
        p = p.clone();
        p.x += Math.cos(dir) * (5 + this.rand() * 8) * spread;
        p.z += Math.sin(dir) * (5 + this.rand() * 8) * spread;
        p.y -= 10 + this.rand() * 14;
        branch.push(p);
      }
      this.paths.push(branch);
    }
    this.glow.position.set(pos.x, 0, -pos.y);
    this.ring.position.set(pos.x, 0.08, -pos.y);
    this.age = 0;
  }

  update(dt: number): void {
    this.age += dt;
    const k = flashCurve(this.age);
    // Salama itse näkyy vain kirkkaimpina hetkinä, joten se välkkyy.
    this.bolt.visible = k >= 0.3;
    this.halo.visible = k >= 0.5 && !this.far;
    this.glow.visible = k > 0;
    // Shokkiaalto leviää iskukohdasta ja ohenee.
    const r = this.age / RING_SECONDS;
    this.ring.visible = r < 1 && !this.far;
    if (r < 1) this.ring.scale.setScalar(2 + RING_RADIUS * Math.sqrt(r));
  }

  /**
   * Kääntää salaman kameraa kohti ennen piirtoa. Salama on nauha, joka on
   * vähintään pari pikseliä leveä, joten se näkyy selvästi sekä läheltä että
   * kaukaa ja ylhäältä katsottuna.
   */
  orient(camera: THREE.Camera, heightPx: number): void {
    const k = flashCurve(this.age);
    if (k <= 0) return;
    const pixel = pixelSize(camera, heightPx);
    const glowAt = this.glow.position;
    this.glow.scale.setScalar(Math.max(8, pixel(glowAt) * 14) * (0.4 + 0.6 * k));
    if (!this.bolt.visible) return;
    const ortho = camera instanceof THREE.OrthographicCamera;
    if (ortho) camera.getWorldDirection(this.toCamera).negate();
    let q = 0;
    this.paths.forEach((path, n) => {
      const scale = n === 0 ? 1 : 0.6;
      for (let i = 0; i + 1 < path.length; i++) {
        const a = path[i]!;
        const b = path[i + 1]!;
        if (!ortho) this.toCamera.subVectors(camera.position, a).normalize();
        this.seg.subVectors(b, a);
        this.side.crossVectors(this.seg, this.toCamera).normalize();
        const w = Math.max(
          0.35 * scale,
          pixel(a) * (this.far ? FAR_HALF_WIDTH_PX : HALF_WIDTH_PX) * scale,
        );
        this.writeQuad(this.boltPositions, q, a, b, w);
        this.writeQuad(this.haloPositions, q++, a, b, w * HALO);
      }
    });
    for (const m of [this.bolt, this.halo]) {
      m.geometry.setDrawRange(0, q * 6);
      m.geometry.getAttribute('position').needsUpdate = true;
    }
  }

  private writeQuad(
    p: Float32Array,
    q: number,
    a: THREE.Vector3,
    b: THREE.Vector3,
    w: number,
  ): void {
    const s = this.side;
    const o = q * 12;
    p[o] = a.x - s.x * w;
    p[o + 1] = a.y - s.y * w;
    p[o + 2] = a.z - s.z * w;
    p[o + 3] = a.x + s.x * w;
    p[o + 4] = a.y + s.y * w;
    p[o + 5] = a.z + s.z * w;
    p[o + 6] = b.x - s.x * w;
    p[o + 7] = b.y - s.y * w;
    p[o + 8] = b.z - s.z * w;
    p[o + 9] = b.x + s.x * w;
    p[o + 10] = b.y + s.y * w;
    p[o + 11] = b.z + s.z * w;
  }

  private rand(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }
}

/**
 * Salama on valonlähde kuten taivas: se kirjoittaa alfaksi 0, jolloin
 * jälkikäsittely piirtää sen omana värinään ohi paletin, sävytyksen ja
 * kaukosumun (ks. RetroRenderer). Muuten kilometrin päässä iskevä salama
 * hukkuisi yöllä sumuun.
 */
const LIGHT_SOURCE = {
  blending: THREE.CustomBlending,
  blendEquation: THREE.AddEquation,
  blendSrc: THREE.OneFactor,
  blendDst: THREE.ZeroFactor,
  blendSrcAlpha: THREE.ZeroFactor,
  blendDstAlpha: THREE.ZeroFactor,
} as const;

/** Pyöreä, pikselimäinen hehku: kirkas keskus ja vaaleankeltainen reuna. */
function glowTexture(): THREE.Texture {
  const size = 8;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2);
      if (d > size / 2) continue;
      ctx.fillStyle = d < size / 4 ? '#eef2f3' : '#fff3b0';
      ctx.fillRect(x, y, 1, 1);
    }
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Yhden ruudun pikselin koko (m) annetussa pisteessä. */
function pixelSize(camera: THREE.Camera, heightPx: number): (p: THREE.Vector3) => number {
  if (camera instanceof THREE.OrthographicCamera) {
    const size = (camera.top - camera.bottom) / camera.zoom / heightPx;
    return () => size;
  }
  if (camera instanceof THREE.PerspectiveCamera) {
    const k = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / camera.zoom / heightPx;
    return (p) => p.distanceTo(camera.position) * k;
  }
  return () => 1;
}
