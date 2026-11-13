import * as THREE from 'three';
import { fromAbove, GLOW, pixelAt, VEIL } from './veil';

/** Lisättyjen osien nimi: pyöristys ja varjot ohittavat ne (`modern-`). */
const ADDED = 'modern-rain';
/** Pisaran juova: puolileveys (m), vähimmäisleveys kuvapisteinä ja peitto alapäässä. */
const STREAK = { half: 0.009, minPx: 0.75, alpha: 0.7, alphaAbove: 0.6 } as const;
/** Juovan pituus pelin pisaran pituudesta: pisarat ovat eri mittaisia. */
const STRETCH: [number, number] = [0.9, 2.1];
/** Kalastajan silmin pisara himmenee tällä matkalla (m), jottei kaukainen sade ole viivaseinä. */
const FADE: [number, number] = [6, 26];
/**
 * Pisaran rengas veden pinnassa: määrä, kesto (s), säde (m) alussa ja lopussa,
 * säde vähintään kuvapisteinä ja kirkkaus.
 */
export const SPLASH = { count: 192, seconds: 0.45, from: 0.04, to: 0.3, minPx: 2.5, glow: 0.3 };
/** Pisara on pudonnut pintaan, kun se hyppää takaisin ylös vähintään näin paljon (m). */
const WRAP = 5;

const a = new THREE.Vector3();
const b = new THREE.Vector3();
const side = new THREE.Vector3();
const eye = new THREE.Vector3();
const toEye = new THREE.Vector3();
const m = new THREE.Matrix4();
const q = new THREE.Quaternion();
const s = new THREE.Vector3();
const tint = new THREE.Color();

export type Drops = THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;

/** Toistettava luku 0–1 pisaran järjestysnumerosta. */
const vary = (i: number): number => {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * Sade Modernissa ilmeessä (#650): pelin sadepisarat (`rain`, viivat) piirretään
 * pehmeinä, alaspäin kirkastuvina juovina samoissa paikoissa, ja jokainen
 * pintaan pudonnut pisara jättää veteen pienen laajenevan renkaan. Määrä,
 * tuulen kallistus ja alue ovat pelin (`WeatherView`).
 */
export class Rain {
  private drops: Drops | null = null;
  private streaks: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | null = null;
  private rings: THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | null = null;
  /** Pisaroiden alapään paikat edellisellä ruudulla. */
  private last = new Float32Array(0);
  /** Renkaiden paikat (x, z) ja iät (s); ikä ≥ kesto = vapaa. */
  private readonly ringAt = new Float32Array(SPLASH.count * 2);
  private readonly ringAge = new Float32Array(SPLASH.count).fill(SPLASH.seconds);
  private next = 0;

  /** Pelin sadeviivat; `null` irrottaa (kohtaus vaihtui). */
  bind(drops: Drops | null): void {
    if (drops === this.drops) return;
    this.release();
    this.drops = drops;
    if (!drops?.parent) return;
    const count = drops.geometry.getAttribute('position').count / 2;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 12), 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 16), 4));
    const index: number[] = [];
    for (let i = 0; i < count; i++) {
      const v = i * 4;
      index.push(v, v + 1, v + 2, v + 2, v + 1, v + 3);
    }
    geometry.setIndex(index);
    this.streaks = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, ...VEIL }),
    );
    this.streaks.frustumCulled = false;
    this.streaks.name = ADDED;
    const ring = new THREE.RingGeometry(0.78, 1, 20);
    ring.rotateX(-Math.PI / 2);
    this.rings = new THREE.InstancedMesh(
      ring,
      new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, ...GLOW }),
      SPLASH.count,
    );
    this.rings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.rings.frustumCulled = false;
    this.rings.name = ADDED;
    for (let i = 0; i < SPLASH.count; i++) this.rings.setColorAt(i, tint.setScalar(0));
    drops.parent.add(this.streaks, this.rings);
    drops.material.visible = false;
    this.last = new Float32Array(count * 3).fill(NaN);
    this.ringAge.fill(SPLASH.seconds);
  }

  update(camera: THREE.Camera, heightPx: number, dt: number): void {
    const { drops, streaks, rings } = this;
    if (!drops || !streaks || !rings) return;
    // Pelin piirtoalue kertoo sateen määrän: kaksi kärkeä pisaraa kohden.
    // Rajaamaton alue (ennen pelin ensimmäistä päivitystä) on koko puskuri.
    const all = drops.geometry.getAttribute('position').count;
    const count = drops.visible ? Math.floor(Math.min(drops.geometry.drawRange.count, all) / 2) : 0;
    streaks.visible = count > 0;
    this.age(dt, camera, heightPx);
    if (count === 0) {
      this.last.fill(NaN);
      return;
    }
    const src = drops.geometry.getAttribute('position').array as Float32Array;
    const pos = streaks.geometry.getAttribute('position') as THREE.BufferAttribute;
    const col = streaks.geometry.getAttribute('color') as THREE.BufferAttribute;
    const p = pos.array as Float32Array;
    const c = col.array as Float32Array;
    const above = fromAbove(camera);
    const pixel = pixelAt(camera, heightPx);
    eye.setFromMatrixPosition(camera.matrixWorld);
    if (above) camera.getWorldDirection(toEye).negate();
    const color = drops.material.color;
    const last = this.last;
    for (let i = 0; i < count; i++) {
      const o = i * 6;
      a.set(src[o]!, src[o + 1]!, src[o + 2]!);
      b.set(src[o + 3]!, src[o + 4]!, src[o + 5]!);
      // Pintaan pudonnut pisara hyppää takaisin ylös: rengas sen edelliseen paikkaan.
      const l = i * 3;
      if (a.y - last[l + 1]! > WRAP) this.splash(last[l]!, last[l + 2]!);
      last[l] = a.x;
      last[l + 1] = a.y;
      last[l + 2] = a.z;
      b.sub(a)
        .multiplyScalar(STRETCH[0] + (STRETCH[1] - STRETCH[0]) * vary(i))
        .add(a);
      if (!above) toEye.subVectors(eye, a);
      side.subVectors(b, a).cross(toEye).normalize();
      const w = Math.max(STREAK.half, pixel(a) * STREAK.minPx);
      const far = above
        ? STREAK.alphaAbove
        : STREAK.alpha * (1 - THREE.MathUtils.smoothstep(toEye.length(), FADE[0], FADE[1]) * 0.7);
      const v = i * 12;
      p[v] = a.x - side.x * w;
      p[v + 1] = a.y - side.y * w;
      p[v + 2] = a.z - side.z * w;
      p[v + 3] = a.x + side.x * w;
      p[v + 4] = a.y + side.y * w;
      p[v + 5] = a.z + side.z * w;
      // Yläpää kapenee ja haalistuu: juova on pisaran jälki, ei tasapaksu viiva.
      p[v + 6] = b.x - side.x * w * 0.3;
      p[v + 7] = b.y - side.y * w * 0.3;
      p[v + 8] = b.z - side.z * w * 0.3;
      p[v + 9] = b.x + side.x * w * 0.3;
      p[v + 10] = b.y + side.y * w * 0.3;
      p[v + 11] = b.z + side.z * w * 0.3;
      const k = i * 16;
      for (let n = 0; n < 4; n++) {
        c[k + n * 4] = color.r;
        c[k + n * 4 + 1] = color.g;
        c[k + n * 4 + 2] = color.b;
        c[k + n * 4 + 3] = n < 2 ? far : 0;
      }
    }
    streaks.geometry.setDrawRange(0, count * 6);
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }

  private splash(x: number, z: number): void {
    if (Number.isNaN(x)) return;
    const i = this.next;
    this.next = (i + 1) % SPLASH.count;
    this.ringAt[i * 2] = x;
    this.ringAt[i * 2 + 1] = z;
    this.ringAge[i] = 0;
  }

  /** Renkaat laajenevat ja hiipuvat; vapaat kutistetaan olemattomiin. */
  private age(dt: number, camera: THREE.Camera, heightPx: number): void {
    const rings = this.rings!;
    const pixel = pixelAt(camera, heightPx);
    let any = false;
    for (let i = 0; i < SPLASH.count; i++) {
      const age = this.ringAge[i]!;
      const live = age < SPLASH.seconds;
      if (live) {
        any = true;
        const t = age / SPLASH.seconds;
        a.set(this.ringAt[i * 2]!, 0.03, this.ringAt[i * 2 + 1]!);
        const grow = Math.sqrt(t);
        const r = Math.max(
          SPLASH.from + (SPLASH.to - SPLASH.from) * grow,
          pixel(a) * SPLASH.minPx * (0.4 + 0.6 * grow),
        );
        rings.setMatrixAt(i, m.compose(a, q, s.setScalar(r)));
        rings.setColorAt(i, tint.setScalar(SPLASH.glow * Math.pow(1 - t, 1.5)));
        this.ringAge[i] = age + dt;
      } else if (age < Infinity) {
        rings.setMatrixAt(i, m.makeScale(0, 0, 0));
        this.ringAge[i] = Infinity;
        any = true;
      }
    }
    rings.visible = any;
    if (!any) return;
    rings.instanceMatrix.needsUpdate = true;
    if (rings.instanceColor) rings.instanceColor.needsUpdate = true;
  }

  /** Elossa olevien renkaiden määrä (testeille). */
  get splashes(): number {
    return this.ringAge.reduce((n, age) => n + (age < SPLASH.seconds ? 1 : 0), 0);
  }

  private release(): void {
    if (this.drops) this.drops.material.visible = true;
    for (const mesh of [this.streaks, this.rings]) {
      if (!mesh) continue;
      mesh.removeFromParent();
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.rings?.dispose();
    this.streaks = null;
    this.rings = null;
    this.drops = null;
  }

  dispose(): void {
    this.release();
  }
}
