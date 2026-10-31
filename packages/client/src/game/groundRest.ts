import * as THREE from 'three';
import type { Vec2 } from '@lunki/shared';

const UP = new THREE.Vector3(0, 1, 0);

/** Maahan laskettu esine (rengas, rannalla oleva vene): korkeus ja kallistus. */
export interface GroundRest {
  /** Esineen origon korkeus maan pinnalla (m). */
  lift: number;
  /** Suunta ja kallistus maan rinteen mukaan (kääntö y-akselin ympäri mukana). */
  quaternion: THREE.Quaternion;
}

/**
 * Asettaa maahan lasketun esineen rinteen suuntaiseksi (#457): maanpinta
 * luetaan esineen eteen, taakse ja sivuille ulottuvilta kohdilta, ja esine
 * kallistuu niiden kautta kulkevan tason mukaan. Pelkän keskipisteen
 * korkeudella rinteessä oleva rengas upposi ylärinteen puolelta maan sisään.
 * Korkeus on tason korkeus keskellä, mutta ei kumpareen keskikohtaa alempana.
 */
export function groundRest(
  p: Vec2,
  heading: number,
  heightAt: (p: Vec2) => number,
  reach: { length: number; width: number },
): GroundRest {
  const h = (x: number, y: number) => Math.max(0, heightAt({ x, y }));
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  const along = (d: number) => h(p.x + c * d, p.y + s * d);
  const across = (d: number) => h(p.x - s * d, p.y + c * d);
  const front = along(reach.length);
  const back = along(-reach.length);
  const left = across(reach.width);
  const right = across(-reach.width);
  // Rinteen kaltevuus esineen omissa suunnissa (nousu metriä kohden).
  const pitch = (front - back) / (2 * reach.length);
  const roll = (left - right) / (2 * reach.width);
  // Kaltevuus pelin koordinaateissa (x itään, y pohjoiseen) → pinnan normaali Three.js:ssä.
  const gx = pitch * c - roll * s;
  const gy = pitch * s + roll * c;
  const normal = new THREE.Vector3(-gx, 1, gy).normalize();
  const quaternion = new THREE.Quaternion()
    .setFromUnitVectors(UP, normal)
    .multiply(new THREE.Quaternion().setFromAxisAngle(UP, heading));
  const plane = (front + back + left + right) / 4;
  return { lift: Math.max(plane, h(p.x, p.y)), quaternion };
}
