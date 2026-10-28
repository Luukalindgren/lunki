import * as THREE from 'three';
import { CRAFTS, anchorAttach, type AnchorState, type Vec2 } from '@lunki/shared';
import { toWorld } from '../world/lakeMesh';

/** Ankkuriköysi (#355): paletin vaalea ruskea. */
const ROPE = 0xb99a68;
/** Köysi pinnalla siiman tapaan (ks. fishingView SURFACE_Y). */
const SURFACE_Y = 0.04;

/** Köyden kiinnityskohta piirrossa: veneen keula tai renkaan takareuna (m ja korkeus). */
const ATTACH = {
  boat: { at: CRAFTS.boat.anchorAt, height: 0.45 },
  tube: { at: -0.6, height: 0.25 },
} as const;

/** Ankkurissa oleva alus piirtohetkellä. */
export interface AnchoredCraft {
  pos: Vec2;
  /** Aluksen suunta (veneellä perään, renkaalla katse). */
  heading: number;
  boat: boolean;
  anchor: AnchorState;
}

/**
 * Ankkuriköydet kuten siima: aluksesta suoraan veteen ja pinnalla kohti
 * ankkuria, joten ylhäältäkin näkee, missä ankkuri on.
 */
export class AnchorView {
  readonly group = new THREE.Group();
  private readonly ropes: THREE.Line[] = [];
  private readonly material = new THREE.LineBasicMaterial({ color: ROPE });

  update(crafts: readonly AnchoredCraft[]): void {
    crafts.forEach((c, i) => {
      const line = this.ropes[i] ?? this.add();
      const a = c.boat ? ATTACH.boat : ATTACH.tube;
      const from = anchorAttach(c, a.at);
      const to = c.anchor.pos;
      // Suora köysi kohtaa pinnan sitä aiemmin, mitä syvemmällä ankkuri on.
      const k = a.height / (a.height + Math.max(0, c.anchor.drop));
      const entry = { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
      const pos = line.geometry.getAttribute('position') as THREE.BufferAttribute;
      [toWorld(from, a.height), toWorld(entry, SURFACE_Y), toWorld(to, SURFACE_Y)].forEach((p, j) =>
        pos.setXYZ(j, p.x, p.y, p.z),
      );
      pos.needsUpdate = true;
      line.geometry.computeBoundingSphere();
      line.visible = true;
    });
    for (let i = crafts.length; i < this.ropes.length; i++) this.ropes[i]!.visible = false;
  }

  private add(): THREE.Line {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
    const line = new THREE.Line(geo, this.material);
    this.group.add(line);
    this.ropes.push(line);
    return line;
  }
}
