import * as THREE from 'three';
import type { Vec2 } from '@lunki/shared';
import type { RetroResolution } from '../engine/resolution';
import { toWorld } from '../world/lakeMesh';

/** Silmien korkeus vedenpinnasta (m) ja katseen lasku horisontin alle. */
const EYE_HEIGHT = 0.55;
const PITCH = -0.12;
/** Kauimmainen tähtäyspiste (m), kun hiiri osoittaa horisontin yläpuolelle. */
const MAX_AIM = 90;

/**
 * Kalastajan silmin: perspektiivikamera renkaasta katsesuuntaan. Potkut
 * keinuttavat kuvaa hieman.
 */
export class PovCamera {
  readonly camera = new THREE.PerspectiveCamera(72, 1, 0.1, 3000);
  private resolution: RetroResolution = { width: 1, height: 1, scale: 1 };
  private readonly raycaster = new THREE.Raycaster();
  private readonly water = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly hit = new THREE.Vector3();

  setResolution(r: RetroResolution): void {
    this.resolution = r;
    this.camera.aspect = r.width / r.height;
    this.camera.updateProjectionMatrix();
  }

  /** `swell` = aallon nosto (m) ja kallistus (rad) renkaan kohdalla. */
  apply(pos: Vec2, heading: number, kickPhase: number, swell = { lift: 0, roll: 0 }): void {
    const bob = Math.sin(kickPhase * Math.PI * 2) * 0.03 + swell.lift;
    const eye = toWorld(pos, EYE_HEIGHT + bob);
    this.camera.position.copy(eye);
    const dir = new THREE.Vector3(
      Math.cos(heading) * Math.cos(PITCH),
      Math.sin(PITCH),
      -Math.sin(heading) * Math.cos(PITCH),
    );
    this.camera.lookAt(eye.add(dir));
    this.camera.rotateZ(Math.sin(kickPhase * Math.PI * 2 + 1) * 0.008 + swell.roll);
    this.camera.updateMatrixWorld();
  }

  /** Sisäisen resoluution pikseli → piste vedenpinnalla (säde kamerasta). */
  internalToWorld(px: number, py: number): Vec2 {
    const { width, height } = this.resolution;
    const ndc = new THREE.Vector2(((px + 0.5) / width) * 2 - 1, -(((py + 0.5) / height) * 2 - 1));
    this.raycaster.setFromCamera(ndc, this.camera);
    const ray = this.raycaster.ray;
    const origin = { x: ray.origin.x, y: -ray.origin.z };
    const azimuth = Math.atan2(-ray.direction.z, ray.direction.x);
    const far = {
      x: origin.x + Math.cos(azimuth) * MAX_AIM,
      y: origin.y + Math.sin(azimuth) * MAX_AIM,
    };
    if (ray.direction.y > -1e-3 || !ray.intersectPlane(this.water, this.hit)) return far;
    const p = { x: this.hit.x, y: -this.hit.z };
    return Math.hypot(p.x - origin.x, p.y - origin.y) > MAX_AIM ? far : p;
  }
}
