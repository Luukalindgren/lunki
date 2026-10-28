import * as THREE from 'three';
import type { Vec2 } from '@lunki/shared';
import { toWorld } from '../world/lakeMesh';

/** Renkaan kesto (s): laajenee ja katoaa. */
export const SPLASH_TIME = 0.6;

/** Roiskeen vaahto (sama kuin aaltojen vaahtopäät, lakeMesh.ts). */
const FOAM = new THREE.Color().setRGB(0.9, 0.95, 1.0, THREE.LinearSRGBColorSpace);

/**
 * Roiskerenkaat veden pinnalla: vieheen molskahdus, saalis, muiden
 * väsyttämän kalan pulahdus (#368) ja kalojen merkit (#369). Rajattu
 * joukko renkaita: uusi rengas ottaa vanhimman paikan, joten pinta ei
 * levottomoidu eikä piirrettävää kerry.
 *
 * Rengas on vaahdon värinen koko ajan ja katoaa kerralla: puoliksi
 * läpinäkyvä valkoinen osuisi paletissa vieraaseen sävyyn, illalla ruskeaan.
 */
export class SplashRings {
  readonly group = new THREE.Group();
  private readonly rings: {
    mesh: THREE.Mesh;
    age: number;
    size: number;
    time: number;
  }[] = [];
  private next = 0;

  constructor(count = 1) {
    const geometry = new THREE.RingGeometry(0.8, 1, 12);
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: FOAM }));
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      this.group.add(mesh);
      this.rings.push({ mesh, age: Infinity, size: 1, time: SPLASH_TIME });
    }
  }

  /** Uusi rengas kohtaan `at`; `size` = koko, `time` = kesto (s). */
  start(at: Vec2, size = 1, time = SPLASH_TIME): void {
    const r = this.rings[this.next]!;
    this.next = (this.next + 1) % this.rings.length;
    r.mesh.position.copy(toWorld(at, 0.05));
    r.age = 0;
    r.size = size;
    r.time = time;
  }

  update(dt: number): void {
    for (const r of this.rings) {
      r.age += dt;
      r.mesh.visible = r.age < r.time;
      if (!r.mesh.visible) continue;
      const t = r.age / r.time;
      r.mesh.scale.setScalar((0.4 + t * 1.6) * r.size);
    }
  }
}
