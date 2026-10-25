import type { LakeMap } from '../map/types';
import type { WaterBody } from '../map/waterBody';
import { Rng } from '../rng';
import type { Vec2 } from '../vec2';
import type { Sky, WeatherPlan } from './weather';

/** Salaman rangaistus (sama valikoima kaatumiselle, vaihe 4). */
export type Penalty = 'none' | 'time-out' | 'lose-catch' | 'out';

export const PENALTY_NAMES: Record<Penalty, string> = {
  none: 'Ei rangaistusta',
  'time-out': 'Jäähy (60 s)',
  'lose-catch': 'Menetä saalis',
  out: 'Putoat kisasta',
};

export const PENALTY_IDS = Object.keys(PENALTY_NAMES) as Penalty[];
export const isPenalty = (v: unknown): v is Penalty =>
  typeof v === 'string' && Object.hasOwn(PENALTY_NAMES, v);

export const LIGHTNING = {
  /** Salamoiden keskimääräinen väli (s) ukkosella ja myrskyllä. */
  interval: { thunder: 11, storm: 6 } as Partial<Record<Sky, number>>,
  /** Lyhin väli (s), jotta välähdykset erottuvat. */
  minGap: 2,
  /** Todennäköisyys, että yksi salama osuu kalastajaan, jolla vapa on ylhäällä selällä. */
  hitChance: 0.08,
  /** Rannan lähellä (m) riski on pienimmillään, ja selällä (m) suurimmillaan. */
  shelter: 25,
  open: 200,
  /** Riskin kerroin aivan rannassa. */
  minExposure: 0.25,
  /** Jäähyn kesto (s). */
  timeOut: 60,
  /** Äänen nopeus (m/s): jyrinä kuuluu viiveellä etäisyyden mukaan. */
  soundSpeed: 343,
} as const;

/** Pudonneen jäähy päättyy vasta tämän kisa-ajan jälkeen (s): käytännössä ei koskaan. */
export const OUT_OF_RACE = 1e6;

/** Mitä osuma tarkoittaa valitulla rangaistuksella. Siima palaa aina poikki. */
export function penaltyOutcome(
  penalty: Penalty,
  now: number,
): { outUntil: number; loseCatch: boolean } {
  return {
    outUntil:
      penalty === 'time-out' ? now + LIGHTNING.timeOut : penalty === 'out' ? OUT_OF_RACE : 0,
    loseCatch: penalty === 'lose-catch' || penalty === 'out',
  };
}

/** Yksi salamanisku kisan aikana. */
export interface Strike {
  /** Kisa-aika (s). */
  t: number;
  /** Iskun oma siemen: osumat ja sijainti arvotaan tästä. */
  seed: number;
}

/**
 * Salamat koko kisan ajaksi sään suunnitelmasta: ukkosella ja myrskyllä
 * iskee satunnaisin välein. Palvelin ja asiakkaat laskevat saman listan.
 */
export function planLightning(plan: WeatherPlan, seed: number, durationS: number): Strike[] {
  const rng = new Rng(seed ^ 0x2545f491);
  const strikes: Strike[] = [];
  plan.segments.forEach((seg, i) => {
    const mean = LIGHTNING.interval[seg.sky];
    const end = Math.min(durationS, plan.segments[i + 1]?.start ?? durationS);
    if (!mean) return;
    let t = seg.start;
    for (;;) {
      t += Math.max(LIGHTNING.minGap, -Math.log(1 - rng.next()) * mean);
      if (t >= end) break;
      strikes.push({ t: Math.round(t * 100) / 100, seed: (rng.next() * 2 ** 32) >>> 0 });
    }
  });
  return strikes;
}

/** Riskin kerroin 0–1 etäisyydestä rantaan: selällä salama osuu helpommin. */
export function exposure(water: WaterBody, p: Vec2): number {
  const d = water.closestShorePoint(p, LIGHTNING.open)?.distance ?? LIGHTNING.open;
  const k = Math.min(
    1,
    Math.max(0, (d - LIGHTNING.shelter) / (LIGHTNING.open - LIGHTNING.shelter)),
  );
  return LIGHTNING.minExposure + (1 - LIGHTNING.minExposure) * k;
}

export interface LightningTarget {
  /** Pysyvä tunniste (sessionId tai yksinpelissä mikä tahansa). */
  id: string;
  pos: Vec2;
  /** Vapa ylhäällä: viehe heitossa, vedessä tai kala kiinni. */
  rodUp: boolean;
}

export interface StrikeResult {
  /** Iskukohta: osuman saaneen kalastajan kohdalla, muuten satunnaisesti järvellä. */
  pos: Vec2;
  victims: string[];
}

/** Ratkaisee iskun: ketkä saavat osuman ja mihin salama iskee. */
export function resolveStrike(
  strike: Strike,
  targets: readonly LightningTarget[],
  water: WaterBody,
  bounds: LakeMap['bounds'],
): StrikeResult {
  const victims = targets.filter((p) => {
    if (!p.rodUp) return false;
    const roll = new Rng((strike.seed ^ hashString(p.id)) >>> 0).next();
    return roll < LIGHTNING.hitChance * exposure(water, p.pos);
  });
  if (victims.length > 0) return { pos: { ...victims[0]!.pos }, victims: victims.map((v) => v.id) };
  // Muualle järvelle, mieluiten selälle.
  const rng = new Rng(strike.seed);
  let pos: Vec2 = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
  for (let k = 0; k < 40; k++) {
    const p = { x: rng.range(bounds.minX, bounds.maxX), y: rng.range(bounds.minY, bounds.maxY) };
    if (!water.isWater(p)) continue;
    pos = p;
    if (rng.next() < exposure(water, p)) break;
  }
  return { pos, victims: [] };
}

/** Merkkijonon tiiviste (FNV-1a). */
function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}
