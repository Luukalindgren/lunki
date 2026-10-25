import * as THREE from 'three';
import type { Vec2 } from '@lunki/shared';

/** Näkyvän harjan nopeus (m/s) ja koko (m). Liioiteltu, jotta aallon ehtii nähdä. */
const SPEED = 10;
const LENGTH = 90;
const WIDTH = 2.5;

/**
 * Iso aalto lähestyy: vaahtoava harja kulkee vastatuulesta kohti kalastajaa
 * ja osuu tämän kohdalle aallon hetkellä.
 */
export class BigWaveView {
  readonly group = new THREE.Group();
  private readonly crest: THREE.Mesh;

  constructor() {
    const geometry = new THREE.PlaneGeometry(WIDTH, LENGTH);
    geometry.rotateX(-Math.PI / 2);
    this.crest = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0x83c2db }));
    this.crest.visible = false;
    this.group.add(this.crest);
    this.group.name = 'bigWave';
  }

  /**
   * `untilHit` = aikaa aallon osumaan (s), null = ei aaltoa tulossa.
   * Harja liikkuu tuulen suuntaan (windDir) ja on kohtisuorassa siihen.
   */
  update(untilHit: number | null, windDir: number, center: Vec2): void {
    // Näkyy vielä hetken osuman jälkeenkin, kun harja menee ohi.
    this.crest.visible = untilHit !== null && untilHit > -1.5;
    if (!this.crest.visible) return;
    const back = untilHit! * SPEED;
    const x = center.x - Math.cos(windDir) * back;
    const y = center.y - Math.sin(windDir) * back;
    this.crest.position.set(x, 0.06, -y);
    // Kierto y-akselin ympäri kääntää harjan leveyden tuulen suuntaan (x, -y → maailma).
    this.crest.rotation.y = windDir;
  }
}
