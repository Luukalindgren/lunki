import { CAST, predictLanding } from '../fishing/cast';
import { MAX_CAST_FACTOR } from '../fishing/gear';
import { distance, type Vec2 } from '../vec2';

let maxCast: number | null = null;

/** Kovin tuuli, jonka sää voi tuottaa puuskineen (m/s). */
const MAX_WIND = 19;

/**
 * Pisin mahdollinen heitto renkaan keskeltä mitattuna (m), pisimmälle
 * lentävillä varusteilla ja kovimmassa myötätuulessa.
 */
export function maxCastDistance(): number {
  maxCast ??=
    Math.abs(
      predictLanding({ x: 0, y: 0 }, 0, 1, MAX_CAST_FACTOR, 1 / 60, { x: MAX_WIND, y: 0 }).x,
    ) + CAST.rodReach;
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
