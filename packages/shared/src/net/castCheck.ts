import { CAST, predictLanding } from '../fishing/cast';
import { distance, type Vec2 } from '../vec2';

let maxCast: number | null = null;

/** Pisin mahdollinen heitto renkaan keskeltä mitattuna (m). */
export function maxCastDistance(): number {
  maxCast ??= Math.abs(predictLanding({ x: 0, y: 0 }, 0, 1).x) + CAST.rodReach;
  return maxCast;
}

/**
 * Renkaan liike lennon aikana ja ennakoinnin ero palvelimeen: sallitaan
 * hieman pidempi matka kuin pelkkä heitto.
 */
export const CAST_TOLERANCE = 8;

/** Palvelimen tarkistus: voiko viehe osua tähän pisteeseen tästä renkaasta? */
export function isPlausibleSplash(tubePos: Vec2, splash: Vec2): boolean {
  if (!Number.isFinite(splash.x) || !Number.isFinite(splash.y)) return false;
  return distance(tubePos, splash) <= maxCastDistance() + CAST_TOLERANCE;
}
