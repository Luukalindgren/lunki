import * as THREE from 'three';

const tmp = new THREE.Vector3();

/**
 * Maailman pisteen paikka näytöllä (CSS-pikseleinä) tai null, jos piste on
 * kameran takana tai ruudun ulkopuolella. Perspektiivikameran takana oleva
 * piste projisoituu peilikuvana ruudulle (z > 1), joten se pitää karsia.
 */
export function screenAnchor(
  world: THREE.Vector3,
  camera: THREE.Camera,
  rect: { left: number; top: number; width: number; height: number },
  margin = 1.1,
): { x: number; y: number } | null {
  const v = tmp.copy(world).project(camera);
  if (v.z < -1 || v.z > 1) return null;
  if (Math.abs(v.x) > margin || Math.abs(v.y) > margin) return null;
  return {
    x: rect.left + ((v.x + 1) / 2) * rect.width,
    y: rect.top + ((1 - v.y) / 2) * rect.height,
  };
}
