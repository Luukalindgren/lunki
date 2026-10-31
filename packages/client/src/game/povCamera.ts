import * as THREE from 'three';
import type { Vec2 } from '@lunki/shared';
import type { RetroResolution } from '../engine/resolution';
import { toWorld } from '../world/lakeMesh';
import { DEFAULT_POV_FOV, effectivePovFov } from '../ui/povFov';

/** Silmien korkeus vedenpinnasta (m) ja katseen lasku horisontin alle. */
export const EYE_HEIGHT = 0.55;
const PITCH = -0.12;
/** Kauimmainen tähtäyspiste (m), kun hiiri osoittaa horisontin yläpuolelle. */
const MAX_AIM = 90;
/**
 * Pienet kallistukset (rad) jätetään pois: kiertyvä pikselikuva välkkyy
 * reunoilla, vaikka kulma muuttuisi vain vähän.
 */
const ROLL_DEADZONE = 0.015;

/**
 * Kulma porrastettuna `step`-askeliin. Uusi porras otetaan vasta, kun kohde
 * on edennyt selvästi yli puolen askeleen, joten rajalla huojuva kulma ei
 * vaihda porrasta edestakaisin. `prev` = edellinen tulos (NaN = ei vielä).
 */
export function snapAngle(target: number, prev: number, step: number): number {
  if (!Number.isFinite(prev)) return Math.round(target / step) * step;
  const d = Math.atan2(Math.sin(target - prev), Math.cos(target - prev));
  if (Math.abs(d) < step * 0.75) return prev;
  return prev + Math.round(d / step) * step;
}

/** Kallistus, josta pienet keinahdukset on vaimennettu pois. */
export function steadyRoll(roll: number): number {
  return Math.sign(roll) * Math.max(0, Math.abs(roll) - ROLL_DEADZONE);
}

/**
 * Kalastajan silmin: perspektiivikamera renkaasta katsesuuntaan.
 *
 * Pieneen resoluutioon piirretty kuva välkkyy, jos kamera kääntyy pikselin
 * murto-osia: kaukaisten puiden ja rantojen pikselit hyppivät edestakaisin.
 * Siksi suunta porrastetaan kokonaisiin pikseleihin ja pienet kallistukset
 * jätetään pois. Potkut ja aallot keinuttavat vain silmien korkeutta, mikä
 * näkyy lähiveden liikkeenä mutta ei liikuta kaukaisia maisemia.
 */
export class PovCamera {
  readonly camera = new THREE.PerspectiveCamera(DEFAULT_POV_FOV, 1, 0.1, 3000);
  /** Pelaajan valitsema pysty-FOV (#330); kamera rajaa sen kuvasuhteen mukaan. */
  private fovSetting = DEFAULT_POV_FOV;
  private resolution: RetroResolution = { width: 1, height: 1, scale: 1 };
  private readonly raycaster = new THREE.Raycaster();
  private readonly water = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly hit = new THREE.Vector3();
  /** Yhden pikselin kulma kuvan keskellä (rad). */
  private pixelAngle = 0.005;
  private yaw = NaN;
  private roll = NaN;
  private pitch = NaN;

  /** Yhden pikselin koko metreinä metrin päässä kamerasta. */
  get pixelSize(): number {
    return (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) / this.resolution.height;
  }

  setResolution(r: RetroResolution): void {
    this.resolution = r;
    this.camera.aspect = r.width / r.height;
    this.updateProjection();
  }

  /** Pelaajan valitsema pysty-FOV asteina. */
  setFov(fov: number): void {
    this.fovSetting = fov;
    this.updateProjection();
  }

  /**
   * Projektio ja pikselin kulma uusiksi. Portaat nollataan, jotta kuva
   * kääntyy taas kokonaisin pikselein (#113).
   */
  private updateProjection(): void {
    const r = this.resolution;
    this.camera.fov = effectivePovFov(this.fovSetting, this.camera.aspect);
    this.camera.updateProjectionMatrix();
    this.pixelAngle = Math.atan(
      (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) / r.height,
    );
    this.yaw = NaN;
    this.roll = NaN;
    this.pitch = NaN;
  }

  /**
   * `swell` = aallon nosto (m), kallistus sivuttain (rad) ja nyökkäys
   * (rad, + = katse ylös) renkaan kohdalla.
   */
  apply(
    pos: Vec2,
    heading: number,
    kickPhase: number,
    swell: { lift: number; roll: number; pitch?: number } = { lift: 0, roll: 0 },
  ): void {
    const bob = Math.sin(kickPhase * Math.PI * 2) * 0.03 + swell.lift;
    const eye = toWorld(pos, EYE_HEIGHT + bob);
    this.camera.position.copy(eye);
    this.yaw = snapAngle(heading, this.yaw, this.pixelAngle);
    // Kallistuksen porras siirtää kuvan reunaa noin pikselin.
    this.roll = snapAngle(steadyRoll(swell.roll), this.roll, 2 / this.resolution.width);
    // Nyökkäys siirtää horisonttia kokonaisia pikseleitä.
    this.pitch = snapAngle(PITCH + (swell.pitch ?? 0), this.pitch, this.pixelAngle);
    this.camera.rotation.set(this.pitch, this.yaw - Math.PI / 2, this.roll, 'YXZ');
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
