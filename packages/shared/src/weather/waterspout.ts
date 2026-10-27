import type { LakeMap } from '../map/types';
import type { WaterBody } from '../map/waterBody';
import { TUBE_PHYSICS } from '../physics/tube';
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
  /** Imualueen säde (m). */
  radius: 80,
  /**
   * Imu keskustaa kohti (m/s²) keskellä; reunaa kohti heikkenee jyrkästi,
   * pull·(1 − d/radius)^pullExp. Vertailuksi potkut työntävät n. 1,3 m/s² ja
   * pikapotkut 2,3 m/s². Sivulta 25 m päästä pääsee karkuun tavallisilla
   * potkuilla ja 15 m päästä pikapotkuilla, mutta 10 m sisältä ei enää.
   * Trombin edestä on vaikeampi päästä, koska se tulee perässä. Paikallaan
   * oleva imetään sisään n. 60 m päästä noin minuutissa.
   */
  pull: 3.2,
  pullExp: 1.5,
  /** Pyörre vastapäivään, osuutena imusta. */
  swirl: 0.45,
  /** Tätä lähempänä keskustaa (m) trombi nappaa renkaan ja lennättää sen. */
  capture: 6,
  /** Sinkoutumisen nopeus ulospäin (m/s), jos laskeutumispaikkaa ei löydy. */
  fling: 4,
  /** Lento: kesto (s), lakikorkeus (m) ja matka (m). Lennon jälkeen ollaan kumossa. */
  flight: 3.5,
  flightHeight: 28,
  minFlight: 120,
  maxFlight: 320,
  /** Laskeutumispaikka vähintään näin kaukana rannasta (m). */
  landingShore: 20,
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

/** Trombin imu ja pyörre renkaaseen kiihtyvyytenä (m/s²) kohdassa p. */
export function spoutPull(spouts: readonly Waterspout[], t: number, p: Vec2): Vec2 {
  const out = { x: 0, y: 0 };
  for (const c of activeSpouts(spouts, t)) {
    const dx = c.x - p.x;
    const dy = c.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d >= SPOUT.radius || d < 1e-6) continue;
    const a = (SPOUT.pull * Math.pow(1 - d / SPOUT.radius, SPOUT.pullExp)) / d;
    out.x += a * (dx - dy * SPOUT.swirl);
    out.y += a * (dy + dx * SPOUT.swirl);
  }
  return out;
}

/**
 * Renkaaseen vaikuttava tuuli trombin kohdalla: sään tuuli `base`, johon on
 * lisätty trombin imu. Rengas ajelehtii tuulessa kiihtyvyydellä
 * windPush·|w|·w (stepTube), joten palautetaan tuuli, jonka työntö on sään
 * tuulen työntö + imu. Näin imu ei riipu sään tuulesta.
 */
export function spoutWind(base: Vec2, spouts: readonly Waterspout[], t: number, p: Vec2): Vec2 {
  const pull = spoutPull(spouts, t, p);
  if (pull.x === 0 && pull.y === 0) return base;
  const k = TUBE_PHYSICS.windPush;
  const b = Math.hypot(base.x, base.y);
  const ax = k * b * base.x + pull.x;
  const ay = k * b * base.y + pull.y;
  const a = Math.hypot(ax, ay);
  if (a < 1e-9) return { x: 0, y: 0 };
  const s = Math.sqrt(a / k) / a;
  return { x: ax * s, y: ay * s };
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

/** Trombin lennättämän renkaan matka: mistä lähti ja minne laskeutuu. */
export interface SpoutFlight {
  from: Vec2;
  to: Vec2;
}

/**
 * Laskeutumispaikka trombin lennättämälle: vedelle selälle 120–320 m päähän,
 * mieluiten sinkoutumissuuntaan (`away`) ja kauas muista trombeista.
 * Palauttaa null, jos sopivaa paikkaa ei löydy (rengas vain sinkoutuu).
 */
export function spoutLanding(
  from: Vec2,
  away: Vec2,
  water: WaterBody,
  rand: () => number,
  avoid: readonly Vec2[] = [],
): Vec2 | null {
  const base =
    Math.hypot(away.x, away.y) > 1e-6 ? Math.atan2(away.y, away.x) : rand() * Math.PI * 2;
  for (let k = 0; k < 60; k++) {
    // Ensin suunnilleen sinkoutumissuuntaan, sitten yhä laajemmalta.
    const angle = base + (rand() - 0.5) * Math.min(Math.PI * 2, 1 + k * 0.15);
    const d = SPOUT.minFlight + rand() * (SPOUT.maxFlight - SPOUT.minFlight) * (1 - k / 80);
    const p = { x: from.x + Math.cos(angle) * d, y: from.y + Math.sin(angle) * d };
    if (!water.isWater(p)) continue;
    if (water.closestShorePoint(p, SPOUT.landingShore)) continue;
    if (avoid.some((c) => Math.hypot(c.x - p.x, c.y - p.y) < SPOUT.radius * 1.5)) continue;
    return { x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 };
  }
  return null;
}

/**
 * Paikka ja korkeus lennon aikana, k = 0…1. Rengas nousee pyörteessä ensin
 * jyrkästi ja putoaa loppumatkasta kaarena.
 */
export function flightPosition(f: SpoutFlight, k: number): { pos: Vec2; height: number } {
  const t = Math.min(1, Math.max(0, k));
  // Vaakaliike alkaa hitaasti (rengas kieppuu ylös trombissa) ja kiihtyy.
  const along = t * t * (3 - 2 * t);
  return {
    pos: { x: f.from.x + (f.to.x - f.from.x) * along, y: f.from.y + (f.to.y - f.from.y) * along },
    height: SPOUT.flightHeight * Math.sin(Math.PI * Math.pow(t, 0.75)),
  };
}
