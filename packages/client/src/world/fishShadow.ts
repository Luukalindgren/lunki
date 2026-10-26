import * as THREE from 'three';
import { distance, sizeClass, type Fish, type Vec2 } from '@lunki/shared';

/** Varjo näkyy, kun suurkala seuraa viehettä näin lähellä kalastajaa (m)… */
const SHADOW_RANGE = 18;
/** …ja uii korkeintaan näin syvällä (m). */
const SHADOW_DEPTH = 3;

/**
 * Suurkalan tumma varjo veden alla (#231): kun suurkala tai jättikala seuraa
 * viehettä kalastajan lähelle, se paljastaa itsensä kuten isot hauet
 * oikeastikin. Pienistä kaloista ei näy mitään.
 */
export class FishShadow {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.MeshBasicMaterial;

  constructor() {
    const geometry = new THREE.CircleGeometry(0.5, 10);
    geometry.rotateX(-Math.PI / 2);
    this.material = new THREE.MeshBasicMaterial({
      color: 0x0b1418,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.name = 'fish-shadow';
    this.mesh.visible = false;
  }

  update(fish: readonly Fish[], angler: Vec2): void {
    let best: Fish | null = null;
    for (const f of fish) {
      if (f.mode !== 'follow' || f.depth > SHADOW_DEPTH) continue;
      if (distance(f.pos, angler) > SHADOW_RANGE || sizeClass(f.species, f.weight) < 3) continue;
      if (!best || f.weight > best.weight) best = f;
    }
    this.mesh.visible = best !== null;
    if (!best) return;
    // Pituus painosta (10 kg:n hauki noin 1,2 m), leveys viidesosa.
    const length = 0.55 * Math.cbrt(best.weight);
    this.mesh.position.set(best.pos.x, 0.02, -best.pos.y);
    this.mesh.rotation.y = best.heading;
    this.mesh.scale.set(length * 2, 1, length * 0.4);
    this.material.opacity = 0.55 * (1 - best.depth / (SHADOW_DEPTH + 0.5));
  }
}
