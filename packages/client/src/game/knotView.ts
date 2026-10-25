import * as THREE from 'three';
import type { Vec2 } from '@lunki/shared';

const MAX = 8;

/** Siimasotkujen merkit järvellä: valkoinen ristikko sotkukohdassa. */
export class KnotView {
  readonly group = new THREE.Group();
  private readonly knots: THREE.LineSegments[] = [];

  constructor() {
    const s = 1.2;
    const g = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-s, 0, -s),
      new THREE.Vector3(s, 0, s),
      new THREE.Vector3(-s, 0, s),
      new THREE.Vector3(s, 0, -s),
      new THREE.Vector3(0, 0, -s * 1.4),
      new THREE.Vector3(0, 0, s * 1.4),
    ]);
    const m = new THREE.LineBasicMaterial({ color: 0xeef2f3 });
    for (let i = 0; i < MAX; i++) {
      const k = new THREE.LineSegments(g, m);
      k.visible = false;
      this.knots.push(k);
      this.group.add(k);
    }
    this.group.name = 'knots';
  }

  update(points: readonly Vec2[]): void {
    this.knots.forEach((k, i) => {
      const p = points[i];
      k.visible = p !== undefined;
      if (p) k.position.set(p.x, 0.08, -p.y);
    });
  }
}
