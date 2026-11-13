import * as THREE from 'three';
import { mergeParts } from './shapes';

/** Väreen kehät osuutena säteestä: ohut ulkokehä ja sen sisällä heikompi. */
const RIPPLE = [
  [0.89, 1],
  [0.58, 0.64],
] as const;

/**
 * Roiskerengas väreenä: kaksi ohutta sileää kehää pelin renkaan säteellä
 * (xy-tasossa kuten pelin rengas).
 */
export function rippleShape(bounds: THREE.Box3): THREE.BufferGeometry {
  const radius = bounds.max.x;
  return mergeParts(
    RIPPLE.map(([inner, outer]) => new THREE.RingGeometry(radius * inner, radius * outer, 64)),
  );
}

/** Vieheen merkki: hiottu timantti, leveys 1 ja keskikohta origossa. */
export function gemShape(): THREE.BufferGeometry {
  return new THREE.OctahedronGeometry(0.5);
}
