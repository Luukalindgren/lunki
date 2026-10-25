import * as THREE from 'three';
import type { Vec2 } from '@lunki/shared';
import { toWorld } from '../world/lakeMesh';

/** Merkki näkyy, kun yksi sisäinen pikseli kattaa vähintään tämän (m): rengas on enää muutama pikseli. */
export const YOU_MARKER_MIN_MPP = 0.5;

const COLOR = 0xfff3b0;
const OUTLINE = 0x0b0f14;

/**
 * Oma sijainti kauas loitonnettaessa: rengas pelaajan ympärillä ja sen
 * yläpuolella alaspäin osoittava, kevyesti keinuva nuoli. Koko pysyy samana
 * pikseleinä zoomista riippumatta.
 */
export class YouMarker {
  readonly group = new THREE.Group();
  private readonly arrow = new THREE.Group();

  constructor() {
    const mat = (color: number) =>
      new THREE.MeshBasicMaterial({ color, depthTest: false, side: THREE.DoubleSide });
    // Mitat sisäisinä pikseleinä; ryhmä skaalataan metreiksi.
    const ring = new THREE.Mesh(new THREE.RingGeometry(5, 7, 16), mat(COLOR));
    const ringOutline = new THREE.Mesh(new THREE.RingGeometry(4, 8, 16), mat(OUTLINE));
    for (const m of [ringOutline, ring]) m.rotation.x = -Math.PI / 2;

    // Kärki alaspäin (etelään) eli kohti pelaajaa.
    const tri = (s: number) => {
      const shape = new THREE.Shape();
      shape.moveTo(0, -s * 0.6);
      shape.lineTo(s * 0.6, s * 0.4);
      shape.lineTo(-s * 0.6, s * 0.4);
      shape.closePath();
      return new THREE.ShapeGeometry(shape);
    };
    const head = new THREE.Mesh(tri(8), mat(COLOR));
    const headOutline = new THREE.Mesh(tri(11), mat(OUTLINE));
    for (const m of [headOutline, head]) m.rotation.x = -Math.PI / 2;
    this.arrow.add(headOutline, head);
    this.group.add(ringOutline, ring, this.arrow);
    // Ilman syvyystestiä piirtojärjestys ratkaisee: ääriviiva ensin, täyttö päälle.
    for (const m of [ringOutline, headOutline]) m.renderOrder = 10;
    for (const m of [ring, head]) m.renderOrder = 11;
    this.group.visible = false;
  }

  update(pos: Vec2, metersPerPixel: number, show: boolean, time = performance.now() / 1000): void {
    this.group.visible = show && metersPerPixel >= YOU_MARKER_MIN_MPP;
    if (!this.group.visible) return;
    this.group.position.copy(toWorld(pos, 3));
    this.group.scale.setScalar(metersPerPixel);
    // Nuoli renkaan yläpuolelle (pohjoiseen eli -z) ja keinuu 2 px.
    const bob = Math.round(Math.sin(time * 4) * 2);
    this.arrow.position.z = -(16 + bob);
  }
}
