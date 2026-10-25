import * as THREE from 'three';
import { flightPosition, type SpoutFlight, type Vec2 } from '@lunki/shared';

const HEIGHT = 140;
/** Yhtä aikaa näkyvien trombien enimmäismäärä. */
const MAX = 3;

/**
 * Trombi: harmaa, raidallinen suppilo pilvistä veteen ja vaahtoava rengas
 * sen juurella. Suppilo pyörii, joten pyörre erottuu kaukaakin.
 */
export class SpoutView {
  readonly group = new THREE.Group();
  private readonly spouts: THREE.Group[] = [];
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
    for (let i = 0; i < MAX; i++) {
      const g = new THREE.Group();
      const f = new THREE.Mesh(funnel, funnelMat);
      f.frustumCulled = false;
      const s = new THREE.Mesh(spray, sprayMat);
      s.position.y = 0.1;
      g.add(f, s);
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
      g.rotation.y = this.spin;
    });
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
