import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
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
  private readonly crest: THREE.Group;

  constructor() {
    // Vaahtoava harja kuten vaahtopäät: valkoisia pätkiä ja niiden takana
    // tumma aallonpohja. Leveys on harjan poikki (x), pituus sen suuntaan (z).
    let seed = 3;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const foam: THREE.BufferGeometry[] = [];
    const trough: THREE.BufferGeometry[] = [];
    for (let z = -LENGTH / 2; z < LENGTH / 2;) {
      const len = 2 + rand() * 5;
      const part = (w: number, x: number) => {
        const g = new THREE.PlaneGeometry(w, len);
        g.rotateX(-Math.PI / 2);
        g.translate(x, 0, z + len / 2);
        return g;
      };
      foam.push(part(WIDTH * 0.4, (rand() - 0.5) * 0.6));
      trough.push(part(WIDTH * 0.5, -WIDTH * 0.6));
      z += len + 0.5 + rand() * 2.5;
    }
    this.crest = new THREE.Group();
    this.crest.add(
      new THREE.Mesh(mergeGeometries(trough), new THREE.MeshBasicMaterial({ color: 0x123a5c })),
      new THREE.Mesh(mergeGeometries(foam), new THREE.MeshBasicMaterial({ color: 0xeef2f3 })),
    );
    foam.concat(trough).forEach((g) => g.dispose());
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
