import type { LakeMap } from '../map/types';
import type { WaterBody } from '../map/waterBody';
import { Rng } from '../rng';
import type { Vec2 } from '../vec2';
import { exposure } from './lightning';
import type { WeatherLevel, WeatherPlan } from './weather';

export const SPOUT = {
  /**
   * Todennäköisyys, että ukkos- tai myrskyjaksoon syntyy trombi. Tyynellä ja
   * realistisella säällä trombeja ei ole.
   */
  chance: { calm: 0, realistic: 0, some: 0.25, lots: 0.5, chaos: 0.8 } as Record<
    WeatherLevel,
    number
  >,
  /** Kesto (s). */
  minLife: 70,
  maxLife: 110,
  /** Etenee tuulen mukana (m/s) ja mutkittelee sivuttain (m). */
  speed: 0.6,
  wobble: 15,
  /** Imualueen säde (m) ja suurin "tuulen" nopeus keskellä (m/s). */
  radius: 70,
  maxWind: 36,
  /** Imun osuus; loput on pyörrettä vastapäivään. */
  inflow: 0.85,
  /** Tätä lähempänä keskustaa (m) rengas kaatuu ja sinkoutuu. */
  capture: 6,
  /** Sinkoutumisen nopeus ulospäin (m/s). */
  fling: 4,
  /**
   * Kumossa ja vielä näin kauan (s) pystyyn pääsyn jälkeen trombi ei vaikuta
   * renkaaseen, jotta siitä ehtii potkia pois.
   */
  immune: 3,
} as const;

/** Vaikuttaako trombi renkaaseen, joka on kumossa hetkeen `capsizedUntil` asti (0 = ei ole kaatunut). */
export const spoutAffects = (capsizedUntil: number, now: number) =>
  capsizedUntil <= 0 || now >= capsizedUntil + SPOUT.immune;

/** Trombi kisan aikana. */
export interface Waterspout {
  /** Syntymä ja häviäminen (kisa-aika, s). */
  t0: number;
  t1: number;
  start: Vec2;
  /** Kulkusuunta (rad), tuulen suunta syntyhetkellä. */
  dir: number;
}

/**
 * Trombit koko kisan ajaksi: ukkos- ja myrskyjaksoihin säätason mukaan.
 * Trombi syntyy selälle ja häviää, kun se osuu rantaan tai sen aika loppuu.
 */
export function planWaterspouts(
  plan: WeatherPlan,
  seed: number,
  durationS: number,
  water: WaterBody,
  bounds: LakeMap['bounds'],
): Waterspout[] {
  const chance = SPOUT.chance[plan.level];
  if (chance <= 0) return [];
  const rng = new Rng(seed ^ 0x27d4eb2f);
  const spouts: Waterspout[] = [];
  plan.segments.forEach((seg, i) => {
    if (seg.sky !== 'thunder' && seg.sky !== 'storm') return;
    if (rng.next() >= chance) return;
    const end = Math.min(durationS, plan.segments[i + 1]?.start ?? durationS);
    if (end - seg.start < 20) return;
    const t0 = Math.round(rng.range(seg.start + 5, end - 15) * 100) / 100;
    // Selälle: hylätään rannan tuntumassa olevat paikat.
    let start: Vec2 | null = null;
    for (let k = 0; k < 200 && !start; k++) {
      const p = { x: rng.range(bounds.minX, bounds.maxX), y: rng.range(bounds.minY, bounds.maxY) };
      if (water.isWater(p) && exposure(water, p) >= 0.9) start = p;
    }
    if (!start) return;
    const spout = { t0, t1: t0 + rng.range(SPOUT.minLife, SPOUT.maxLife), start, dir: seg.windDir };
    // Häviää rantaan osuessaan.
    for (let t = t0; t < spout.t1; t += 1) {
      if (!water.isWater(spoutPosition(spout, t))) {
        spout.t1 = t;
        break;
      }
    }
    spout.t1 = Math.round(Math.min(spout.t1, durationS) * 100) / 100;
    if (spout.t1 > t0 + 10) spouts.push(spout);
  });
  return spouts;
}

/** Trombin keskipiste hetkellä t (ei tarkista elinaikaa). */
export function spoutPosition(s: Waterspout, t: number): Vec2 {
  const dt = t - s.t0;
  const along = dt * SPOUT.speed;
  const side = Math.sin(dt * 0.07) * SPOUT.wobble;
  const c = Math.cos(s.dir);
  const n = Math.sin(s.dir);
  return { x: s.start.x + c * along - n * side, y: s.start.y + n * along + c * side };
}

/** Hetkellä t näkyvät trombit ja niiden paikat. */
export function activeSpouts(spouts: readonly Waterspout[], t: number): Vec2[] {
  return spouts.filter((s) => t >= s.t0 && t < s.t1).map((s) => spoutPosition(s, t));
}

/**
 * Trombin vaikutus kuten tuulena (m/s): imu keskustaa kohti ja pyörre.
 * Lisätään sään tuuleen, joten rengas ja heitto reagoivat samoin kuin tuuleen.
 */
export function spoutWind(spouts: readonly Waterspout[], t: number, p: Vec2): Vec2 {
  const out = { x: 0, y: 0 };
  for (const c of activeSpouts(spouts, t)) {
    const dx = c.x - p.x;
    const dy = c.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d >= SPOUT.radius || d < 1e-6) continue;
    const v = SPOUT.maxWind * Math.sqrt(1 - d / SPOUT.radius);
    const swirl = Math.sqrt(1 - SPOUT.inflow * SPOUT.inflow);
    out.x += (v * (dx * SPOUT.inflow - dy * swirl)) / d;
    out.y += (v * (dy * SPOUT.inflow + dx * swirl)) / d;
  }
  return out;
}

/** Trombi nappaa renkaan: palauttaa sinkoutumisnopeuden, tai null jos ei osu. */
export function spoutCapture(spouts: readonly Waterspout[], t: number, p: Vec2): Vec2 | null {
  for (const c of activeSpouts(spouts, t)) {
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    const d = Math.hypot(dx, dy);
    if (d >= SPOUT.capture) continue;
    // Keskeltä sinkoudutaan kulkusuunnasta riippumatta itään.
    const k = d > 1e-6 ? SPOUT.fling / d : 0;
    return d > 1e-6 ? { x: dx * k, y: dy * k } : { x: SPOUT.fling, y: 0 };
  }
  return null;
}
