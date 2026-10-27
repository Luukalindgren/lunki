import * as THREE from 'three';
import { SPOUT, flightPosition, type SpoutFlight, type Vec2 } from '@lunki/shared';

const HEIGHT = 140;
/** Yhtä aikaa näkyvien trombien enimmäismäärä. */
const MAX = 3;
/** Imuvirran vaahtojuovia trombia kohden, niiden leveys (m) ja korkeus vedestä (m). */
const STREAKS = 260;
const STREAK_WIDTH = 0.4;
const STREAK_Y = 0.25;

/**
 * Vaahtojuova kiertyy kohti trombia: säteittäinen nopeus (m/s) kasvaa
 * keskustaa kohti kuten imu, joten virta näyttää kiihtyvän lähellä.
 */
const inflowSpeed = (r: number) => 1.5 + 16 * Math.pow(Math.max(0, 1 - r / SPOUT.radius), 1.5);

/**
 * Trombi: harmaa, raidallinen suppilo pilvistä veteen ja vaahtoava rengas
 * sen juurella. Suppilo pyörii, joten pyörre erottuu kaukaakin.
 */
export class SpoutView {
  readonly group = new THREE.Group();
  private readonly spouts: THREE.Group[] = [];
  private readonly funnels: THREE.Object3D[] = [];
  /** Vaahtojuovien paikat napakoordinaateissa (säde, kulma) trombeittain. */
  private readonly streaks: { r: Float32Array; a: Float32Array; mesh: THREE.Mesh }[] = [];
  private spin = 0;

  constructor() {
    const funnel = new THREE.CylinderGeometry(22, 2.5, HEIGHT, 12, 6, true);
    funnel.translate(0, HEIGHT / 2, 0);
    // Pystyraidat kärkien väreinä: pyöriessä raidat näyttävät pyörteen.
    const colors: number[] = [];
    const pos = funnel.getAttribute('position');
    const dark = new THREE.Color(0x5f6b78);
    const light = new THREE.Color(0x8e99a4);
    for (let i = 0; i < pos.count; i++) {
      const a = Math.atan2(pos.getZ(i), pos.getX(i)) + pos.getY(i) * 0.02;
      const c = Math.sin(a * 3) > 0 ? dark : light;
      colors.push(c.r, c.g, c.b);
    }
    funnel.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const funnelMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const spray = new THREE.RingGeometry(3, 12, 16);
    spray.rotateX(-Math.PI / 2);
    const sprayMat = new THREE.MeshBasicMaterial({ color: 0xeef2f3, side: THREE.DoubleSide });
    // Läpinäkymätön: puolivalkoinen kvantisoituisi paletissa harmaaksi.
    const streakMat = new THREE.MeshBasicMaterial({ color: 0xeef2f3, side: THREE.DoubleSide });
    const quads: number[] = [];
    for (let k = 0; k < STREAKS; k++)
      quads.push(k * 4, k * 4 + 1, k * 4 + 2, k * 4 + 2, k * 4 + 1, k * 4 + 3);
    for (let i = 0; i < MAX; i++) {
      const g = new THREE.Group();
      const f = new THREE.Mesh(funnel, funnelMat);
      f.frustumCulled = false;
      const s = new THREE.Mesh(spray, sprayMat);
      s.position.y = 0.1;
      const r = new Float32Array(STREAKS);
      const a = new Float32Array(STREAKS);
      for (let k = 0; k < STREAKS; k++) {
        // Tasaisesti koko imualueelle.
        r[k] = SPOUT.radius * Math.sqrt(0.02 + 0.98 * Math.random());
        a[k] = Math.random() * Math.PI * 2;
      }
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(STREAKS * 12), 3));
      geom.setIndex(quads);
      const mesh = new THREE.Mesh(geom, streakMat);
      mesh.frustumCulled = false;
      this.streaks.push({ r, a, mesh });
      this.funnels.push(f);
      g.add(f, s, mesh);
      g.visible = false;
      this.spouts.push(g);
      this.group.add(g);
    }
    this.group.name = 'spouts';
  }

  update(dt: number, positions: readonly Vec2[]): void {
    this.spin += dt * 2.5;
    this.spouts.forEach((g, i) => {
      const p = positions[i];
      g.visible = p !== undefined;
      if (!p) return;
      g.position.set(p.x, 0, -p.y);
      // Pyörre vastapäivään ylhäältä katsottuna.
      this.funnels[i]!.rotation.y = this.spin;
      this.updateStreaks(this.streaks[i]!, Math.min(dt, 0.1));
    });
  }

  /**
   * Imuvirta: vaahtojuovat kiertyvät vastapäivään kohti trombia ja syntyvät
   * uudelleen imualueen reunalla, kun ne katoavat suppiloon.
   */
  private updateStreaks(st: (typeof this.streaks)[number], dt: number): void {
    const pos = st.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    for (let k = 0; k < STREAKS; k++) {
      let r = st.r[k]!;
      let a = st.a[k]!;
      const v = inflowSpeed(r);
      r -= v * dt;
      a += (v * 0.8 * dt) / Math.max(r, 3);
      if (r < 4) {
        // Osa syntyy lähemmäs, jotta virta näkyy tiheänä suppilon ympärillä.
        r = SPOUT.radius * (0.3 + 0.7 * Math.random());
        a = Math.random() * Math.PI * 2;
      }
      st.r[k] = r;
      st.a[k] = a;
      // Juova piirretään taaksepäin kuljettua rataa: pidempi, kun virta on kova.
      const back = (1 + v * 0.14) / v;
      const rb = r + v * back;
      const ab = a - (v * 0.8 * back) / Math.max(r, 3);
      // Kapea nelikulmio kärjestä (x1, z1) hännän (x0, z0) kautta.
      const x1 = Math.cos(a) * r;
      const z1 = -Math.sin(a) * r;
      const x0 = Math.cos(ab) * rb;
      const z0 = -Math.sin(ab) * rb;
      const len = Math.hypot(x1 - x0, z1 - z0) || 1;
      const nx = ((z0 - z1) / len) * STREAK_WIDTH * 0.5;
      const nz = ((x1 - x0) / len) * STREAK_WIDTH * 0.5;
      const o = k * 12;
      const corners = [x0 + nx, z0 + nz, x0 - nx, z0 - nz, x1 + nx, z1 + nz, x1 - nx, z1 - nz];
      for (let c = 0; c < 4; c++) {
        arr[o + c * 3] = corners[c * 2]!;
        arr[o + c * 3 + 1] = STREAK_Y;
        arr[o + c * 3 + 2] = corners[c * 2 + 1]!;
      }
    }
    pos.needsUpdate = true;
  }
}

/**
 * Lennon asento hetkellä k = 0…1: paikka, korkeus (m), kieppuminen pystyakselin
 * ympäri ja kellahtelu (rad). Viimeisellä viidenneksellä kaari kääntyy kohti
 * renkaan todellista paikkaa `actual`, jotta laskeutuminen ei nytkähdä.
 */
export function flightPose(
  f: SpoutFlight,
  k: number,
  actual: Vec2,
): { pos: Vec2; height: number; spin: number; tumble: number } {
  const blend = Math.min(1, Math.max(0, (k - 0.8) / 0.2));
  const to = {
    x: f.to.x + (actual.x - f.to.x) * blend,
    y: f.to.y + (actual.y - f.to.y) * blend,
  };
  const { pos, height } = flightPosition({ from: f.from, to }, k);
  // Pyörre kieputtaa nopeasti nousussa ja hidastuu pudotessa.
  const spin = Math.PI * 7 * Math.sqrt(Math.min(1, Math.max(0, k)));
  return { pos, height, spin, tumble: Math.sin(Math.PI * 2 * k) * 0.9 };
}
