import * as THREE from 'three';
import type { Vec2 } from '@lunki/shared';

/** Salaman näkyvyysaika (s) ja korkeus (m). */
const BOLT_SECONDS = 0.7;
const TOP = 350;
const SEGMENTS = 18;
const BRANCHES = 3;
const BRANCH_SEGMENTS = 5;
/** Salaman puolileveys vähintään näin monta pikseliä, jotta se näkyy kaukaakin. */
const HALF_WIDTH_PX = 1.2;
/** Iskukohdan valon kantama (m). */
const LIGHT_RANGE = 450;

/**
 * Välähdyksen kirkkaus ajan funktiona (s iskusta): kirkas isku, lyhyt
 * pimeä hetki, toinen isku ja hiipuva jälkihehku, kuten oikeassa salamassa.
 */
export function flashCurve(age: number): number {
  if (age < 0 || age >= BOLT_SECONDS) return 0;
  if (age < 0.07) return 1;
  if (age < 0.13) return 0.15;
  if (age < 0.24) return 0.9;
  return 0.6 * (1 - (age - 0.24) / (BOLT_SECONDS - 0.24));
}

/**
 * Salamanisku: paksu, haarautuva salama taivaalta iskukohtaan, valo
 * iskukohdan ympärille ja välkkyvä välähdys koko maisemaan.
 */
export class LightningView {
  readonly group = new THREE.Group();
  private readonly bolt: THREE.Mesh;
  private readonly boltPositions: Float32Array;
  private readonly glow: THREE.Sprite;
  private readonly light = new THREE.PointLight(0xeef2f3, 0, LIGHT_RANGE, 1);
  private readonly paths: THREE.Vector3[][] = [];
  private age = Infinity;
  private seed = 1;
  private readonly side = new THREE.Vector3();
  private readonly toCamera = new THREE.Vector3();
  private readonly seg = new THREE.Vector3();

  constructor() {
    const quads = SEGMENTS + BRANCHES * BRANCH_SEGMENTS;
    this.boltPositions = new Float32Array(quads * 4 * 3);
    const index: number[] = [];
    for (let q = 0; q < quads; q++) {
      const v = q * 4;
      index.push(v, v + 1, v + 2, v + 2, v + 1, v + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.boltPositions, 3));
    g.setIndex(index);
    this.bolt = new THREE.Mesh(
      g,
      new THREE.MeshBasicMaterial({ color: 0xfff3b0, side: THREE.DoubleSide, fog: false }),
    );
    this.bolt.frustumCulled = false;
    this.bolt.visible = false;
    // Iskukohdan hehku ja vesiroiske: kameraa kohti käännetty valopallo.
    this.glow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTexture(), alphaTest: 0.5, fog: false }),
    );
    this.glow.visible = false;
    this.light.position.y = 30;
    this.group.add(this.bolt, this.glow, this.light);
    this.group.name = 'lightning';
  }

  /** Välähdyksen voimakkuus 0–1 valaistukseen ja ruudun välähdykseen. */
  get flash(): number {
    return flashCurve(this.age);
  }

  strike(pos: Vec2): void {
    this.paths.length = 0;
    const main: THREE.Vector3[] = [];
    let x = pos.x;
    let z = -pos.y;
    // Alhaalta ylös, jotta isku osuu täsmälleen kohtaan `pos`. Siksak
    // sivuttain ja hieman pohjoiseen, joten salama näyttää salamalta myös
    // ylhäältä katsottuna.
    for (let i = 0; i <= SEGMENTS; i++) {
      main.push(new THREE.Vector3(x, (TOP * i) / SEGMENTS, z));
      x += (i % 2 === 0 ? 1 : -1) * (4 + this.rand() * 9);
      z -= this.rand() * 5;
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
        p.x += Math.cos(dir) * (5 + this.rand() * 8);
        p.z += Math.sin(dir) * (5 + this.rand() * 8);
        p.y -= 10 + this.rand() * 14;
        branch.push(p);
      }
      this.paths.push(branch);
    }
    this.glow.position.set(pos.x, 0, -pos.y);
    this.light.position.x = pos.x;
    this.light.position.z = -pos.y;
    this.age = 0;
  }

  update(dt: number): void {
    this.age += dt;
    const k = flashCurve(this.age);
    // Salama itse näkyy vain kirkkaimpina hetkinä, joten se välkkyy.
    this.bolt.visible = k >= 0.5;
    this.glow.visible = k > 0;
    this.light.intensity = k * 4;
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
    this.glow.scale.setScalar(Math.max(4, pixel(glowAt) * 8) * (0.4 + 0.6 * k));
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
        const w = Math.max(0.25 * scale, pixel(a) * HALF_WIDTH_PX * scale);
        this.writeQuad(q++, a, b, w);
      }
    });
    this.bolt.geometry.setDrawRange(0, q * 6);
    this.bolt.geometry.getAttribute('position').needsUpdate = true;
  }

  private writeQuad(q: number, a: THREE.Vector3, b: THREE.Vector3, w: number): void {
    const p = this.boltPositions;
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
