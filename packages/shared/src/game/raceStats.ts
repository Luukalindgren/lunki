import type { SpeciesId } from '../fishing/fish';
import type { FishingEvents } from '../fishing/fishing';
import { distance, type Vec2 } from '../vec2';

/**
 * Kisan omat tilastot (#367): heitot, tärpit, menetykset ja sattumukset.
 * Lasketaan pelaajan omalla koneella siitä, mitä hänelle tapahtui, ja
 * moninpelissä lähetetään muille kisan lopussa. Tilastot ovat huvia: ne
 * eivät vaikuta tulokseen eikä ennätyksiin.
 */
export interface RaceStats {
  /** Heitot, jotka laskeutuivat (veteen tai maalle). */
  casts: number;
  /** Pisin heitto (m renkaasta vieheeseen). */
  longestCast: number;
  /** Heittojen pituudet yhteensä (m). */
  castMeters: number;
  /** Heitot maalle tai laiturille. */
  landCasts: number;
  /** Kala iski vieheeseen. */
  strikes: number;
  /** Kala tarttui. */
  hooked: number;
  /** Isku meni ohi (vastaisku myöhästyi). */
  missed: number;
  /** Kala irtosi väsytyksessä. */
  escaped: number;
  /** Kala hyppäsi väsytyksessä. */
  jumps: number;
  /** Siima katkesi (kala, pohja tai hauen hampaat). */
  lineBreaks: number;
  /** Hauki katkaisi siiman hampaillaan. */
  bitOffs: number;
  /** Viehe tai perho jäi järveen tai rantaan. */
  luresLost: number;
  /** Pohjatartunnat. */
  snags: number;
  /** Rikkaa vieheessä uposkasvustosta. */
  fouled: number;
  /** Siimasotkut toisen pelaajan kanssa. */
  tangles: number;
  /** Kaatumiset (iso aalto tai trombi). */
  capsizes: number;
  /** Trombin kyydit järven toiselle puolelle. */
  flights: number;
  /** Salama osui omaan vapaan. */
  lightningHits: number;
  /** Lähin salama (m); null, jos salamoita ei ollut. */
  closestLightning: number | null;
  /** Kuljettu matka (m), ilman trombin lentoja. */
  distance: number;
  /** Aika paikallaan kelluen (s). */
  idleSeconds: number;
  /** Suurin karannut tai siiman katkaissut kala. */
  biggestLost: { species: SpeciesId; weight: number } | null;
}

export const emptyRaceStats = (): RaceStats => ({
  casts: 0,
  longestCast: 0,
  castMeters: 0,
  landCasts: 0,
  strikes: 0,
  hooked: 0,
  missed: 0,
  escaped: 0,
  jumps: 0,
  lineBreaks: 0,
  bitOffs: 0,
  luresLost: 0,
  snags: 0,
  fouled: 0,
  tangles: 0,
  capsizes: 0,
  flights: 0,
  lightningHits: 0,
  closestLightning: null,
  distance: 0,
  idleSeconds: 0,
  biggestLost: null,
});

/** Laskurit, jotka lasketaan yhteen sellaisinaan. */
export const RACE_STAT_COUNTS = [
  'casts',
  'castMeters',
  'landCasts',
  'strikes',
  'hooked',
  'missed',
  'escaped',
  'jumps',
  'lineBreaks',
  'bitOffs',
  'luresLost',
  'snags',
  'fouled',
  'tangles',
  'capsizes',
  'flights',
  'lightningHits',
  'distance',
  'idleSeconds',
] as const satisfies readonly (keyof RaceStats)[];

const biggerLost = (a: RaceStats['biggestLost'], b: RaceStats['biggestLost']) =>
  !a || (b && b.weight > a.weight) ? b : a;

/** Kahden tilaston summa (kaikkien kisojen yhteistilastot). */
export function addRaceStats(a: RaceStats, b: RaceStats): RaceStats {
  const sum = { ...a };
  for (const k of RACE_STAT_COUNTS) sum[k] = a[k] + b[k];
  sum.longestCast = Math.max(a.longestCast, b.longestCast);
  const near = [a.closestLightning, b.closestLightning].filter((d) => d !== null);
  sum.closestLightning = near.length ? Math.min(...near) : null;
  sum.biggestLost = biggerLost(a.biggestLost, b.biggestLost);
  return sum;
}

/** Yhden luvun yläraja: suojaa näkymää ja muistia oudolta syötteeltä. */
const STAT_MAX = 1e7;
const num = (v: unknown, max = STAT_MAX): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, v)) : 0;

/**
 * Tarkistaa muualta (verkosta tai laitteen muistista) tulleet tilastot:
 * tuntemattomat kentät pois, puuttuvat nolliksi ja luvut järkeviksi.
 */
export function parseRaceStats(raw: unknown, isSpecies: (s: string) => boolean): RaceStats {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const stats = emptyRaceStats();
  for (const k of RACE_STAT_COUNTS) stats[k] = num(r[k]);
  stats.longestCast = num(r.longestCast, 1000);
  stats.closestLightning = typeof r.closestLightning === 'number' ? num(r.closestLightning) : null;
  const lost = r.biggestLost as { species?: unknown; weight?: unknown } | null | undefined;
  stats.biggestLost =
    lost && typeof lost.species === 'string' && isSpecies(lost.species) && num(lost.weight) > 0
      ? { species: lost.species as SpeciesId, weight: num(lost.weight, 100) }
      : null;
  return stats;
}

/** Näin pitkä siirtymä sekunnissa (m) on lento tai paluu kisaan, ei matkaa. */
const JUMP = 40;
/** Hitaampi liike (m/s) lasketaan paikallaan kellumiseksi (tuuli ajelehtii). */
const IDLE_SPEED = 0.3;

/**
 * Kerää kisan tilastot tapahtumista. Peli kutsuu `fishing` joka ruudussa
 * kalastuksen tapahtumilla ja `move` renkaan paikalla; harvinaiset
 * sattumukset (kaatuminen, sotku, salama) omilla kutsuillaan.
 */
export class RaceStatsCounter {
  stats = emptyRaceStats();
  private hooked: { species: SpeciesId; weight: number } | null = null;
  private last: { pos: Vec2; time: number } | null = null;

  /**
   * Ruudun kalastustapahtumat. `from` = renkaan paikka, `lure` = vieheen
   * paikka laskeutumisen jälkeen ja `hooked` = koukussa oleva kala nyt
   * (karkaamisen jälkeen null: edellinen muistetaan).
   */
  fishing(
    ev: FishingEvents,
    from: Vec2,
    lure: Vec2,
    hooked: { species: SpeciesId; weight: number } | null,
  ): void {
    const s = this.stats;
    if (ev.splash || ev.stuck) {
      const m = distance(from, ev.splash ?? lure);
      s.casts++;
      s.castMeters += m;
      s.longestCast = Math.max(s.longestCast, m);
      if (ev.stuck) s.landCasts++;
    }
    if (ev.strike) s.strikes++;
    if (ev.hooked) s.hooked++;
    if (ev.missed) s.missed++;
    if (ev.jumped) s.jumps++;
    if (ev.snagged) s.snags++;
    if (ev.fouled) s.fouled++;
    if (ev.lineBroken) s.lineBreaks++;
    if (ev.bitOff) s.bitOffs++;
    if (ev.lineBroken || ev.lureLost || ev.lineCut) s.luresLost++;
    const lostFish = ev.escaped || (ev.lineBroken && !ev.lureLost);
    if (ev.escaped) s.escaped++;
    if (lostFish && this.hooked) s.biggestLost = biggerLost(s.biggestLost, this.hooked);
    this.hooked = hooked ? { species: hooked.species, weight: hooked.weight } : null;
  }

  /** Renkaan paikka kisa-ajassa `time` (s); näytteet kerran sekunnissa. */
  move(pos: Vec2, time: number): void {
    const last = this.last;
    if (last && time - last.time < 1) return;
    this.last = { pos: { x: pos.x, y: pos.y }, time };
    if (!last) return;
    const dt = time - last.time;
    const d = distance(last.pos, pos);
    if (d > JUMP * dt) return;
    this.stats.distance += d;
    if (d < IDLE_SPEED * dt) this.stats.idleSeconds += dt;
  }

  capsize(flight: boolean): void {
    this.stats.capsizes++;
    if (flight) this.stats.flights++;
  }

  tangle(): void {
    this.stats.tangles++;
  }

  /** Salama iski `d` metrin päähän; `hit` = omaan vapaan. */
  lightning(d: number, hit: boolean): void {
    const s = this.stats;
    if (hit) s.lightningHits++;
    s.closestLightning = Math.min(s.closestLightning ?? Infinity, hit ? 0 : d);
  }
}
