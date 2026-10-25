import * as THREE from 'three';
import type { Vec2 } from '@lunki/shared';
import { toWorld } from '../world/lakeMesh';

/** Rengas näkyy, kun yksi sisäinen pikseli kattaa vähintään tämän (m): rengas on enää muutama pikseli. */
export const YOU_MARKER_MIN_MPP = 0.5;
/** Räpylöiden etureuna renkaan keskeltä (m): nuoli piirretään tämän ulkopuolelle. */
const FRONT_REACH = 1.2;
/** Nuolen keskikohdan etäisyys keskeltä sisäisinä pikseleinä: vähintään renkaan ulkopuolelle. */
const MIN_ARROW_PX = 12;

const COLOR = 0xfff3b0;
const OUTLINE = 0x0b0f14;

/** Nuolen keskikohdan etäisyys pelaajasta (sisäisiä pikseleitä) zoomin mukaan. */
export function arrowDistance(metersPerPixel: number): number {
  return Math.max(MIN_ARROW_PX, Math.round(FRONT_REACH / metersPerPixel + 6));
}

/**
 * Oma rengas ylhäältä: katsesuuntaan osoittava nuoli räpylöiden edessä, jotta
 * W/S-liike on helppo hahmottaa kartalla, ja kauas loitonnettaessa lisäksi
 * rengas pelaajan ympärillä, josta oman paikan löytää. Koko pysyy samana
 * pikseleinä zoomista riippumatta.
 */
export class YouMarker {
  readonly group = new THREE.Group();
  private readonly ring = new THREE.Group();
  private readonly arrow = new THREE.Group();

  constructor() {
    const mat = (color: number) =>
      new THREE.MeshBasicMaterial({ color, depthTest: false, side: THREE.DoubleSide });
    // Mitat sisäisinä pikseleinä; ryhmä skaalataan metreiksi.
    const ring = new THREE.Mesh(new THREE.RingGeometry(5, 7, 16), mat(COLOR));
    const ringOutline = new THREE.Mesh(new THREE.RingGeometry(4, 8, 16), mat(OUTLINE));
    for (const m of [ringOutline, ring]) m.rotation.x = -Math.PI / 2;
    this.ring.add(ringOutline, ring);

    // Kärki paikallisen +x:n suuntaan eli katseen suuntaan, kuten renkaan mallissa.
    const tri = (s: number) => {
      const shape = new THREE.Shape();
      shape.moveTo(s * 0.6, 0);
      shape.lineTo(-s * 0.4, s * 0.6);
      shape.lineTo(-s * 0.4, -s * 0.6);
      shape.closePath();
      return new THREE.ShapeGeometry(shape);
    };
    const head = new THREE.Mesh(tri(7), mat(COLOR));
    const headOutline = new THREE.Mesh(tri(10), mat(OUTLINE));
    for (const m of [headOutline, head]) m.rotation.x = -Math.PI / 2;
    this.arrow.add(headOutline, head);
    this.group.add(this.ring, this.arrow);
    // Ilman syvyystestiä piirtojärjestys ratkaisee: ääriviiva ensin, täyttö päälle.
    for (const m of [ringOutline, headOutline]) m.renderOrder = 10;
    for (const m of [ring, head]) m.renderOrder = 11;
    this.group.visible = false;
  }

  /** `heading` = katsesuunta (rad, 0 = itä); `show` = ylhäältä katsottuna. */
  update(pos: Vec2, heading: number, metersPerPixel: number, show: boolean): void {
    this.group.visible = show;
    if (!show) return;
    this.group.position.copy(toWorld(pos, 3));
    this.group.scale.setScalar(metersPerPixel);
    this.group.rotation.y = heading;
    this.ring.visible = metersPerPixel >= YOU_MARKER_MIN_MPP;
    this.arrow.position.x = arrowDistance(metersPerPixel);
  }
}
