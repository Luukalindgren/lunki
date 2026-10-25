import { Rng } from '../rng';
import type { Vec2 } from '../vec2';
import { fetchDistance, waveHeight } from './waves';
import type { Sky, WeatherPlan } from './weather';

export const BIG_WAVE = {
  /** Isojen aaltojen keskimääräinen väli (s) säätilan mukaan; tyynellä ei aaltoja. */
  interval: { windy: 50, rain: 60, thunder: 35, storm: 20 } as Partial<Record<Sky, number>>,
  /** Iso aalto tulee vasta, kun tuulta on vähintään näin paljon (m/s). */
  minWind: 6,
  /** Iso aalto on näin monta kertaa merkitsevä aallonkorkeus. */
  factor: 2.2,
  /** Tätä korkeampi aalto (m) kaataa renkaan sivulta. */
  capsizeHeight: 0.35,
  /** Aaltoa kohti katsova kestää: suurin sallittu poikkeama (rad, n. 55°). */
  safeAngle: 0.95,
  /** Varoitus ennen aaltoa (s). */
  warning: 4,
  /** Kaatuneena ollaan näin kauan (s): rengas ei liiku eikä kalastaa voi. */
  recover: 6,
} as const;

/** Iso aalto kisan aikana. */
export interface BigWave {
  /** Kisa-aika (s), jolloin aalto osuu. */
  t: number;
}

/**
 * Isot aallot koko kisan ajaksi sään suunnitelmasta. Palvelin ja asiakkaat
 * laskevat saman listan, joten varoitukset ja osumat ovat samat.
 */
export function planBigWaves(plan: WeatherPlan, seed: number, durationS: number): BigWave[] {
  const rng = new Rng(seed ^ 0x1b873593);
  const waves: BigWave[] = [];
  plan.segments.forEach((seg, i) => {
    const mean = BIG_WAVE.interval[seg.sky];
    const end = Math.min(durationS, plan.segments[i + 1]?.start ?? durationS);
    if (!mean || seg.windSpeed < BIG_WAVE.minWind) return;
    // Ensimmäinen vasta varoitusajan jälkeen, jotta siitä ehtii varoittaa.
    let t = seg.start + BIG_WAVE.warning;
    for (;;) {
      t += Math.max(BIG_WAVE.warning * 2, -Math.log(1 - rng.next()) * mean);
      if (t >= end) break;
      waves.push({ t: Math.round(t * 100) / 100 });
    }
  });
  return waves;
}

/** Ison aallon korkeus (m) pisteessä p: pyyhkäisymatka ratkaisee, kuten muillakin aalloilla. */
export function bigWaveHeight(
  rings: readonly (readonly Vec2[])[],
  p: Vec2,
  windSpeed: number,
  windDir: number,
): number {
  return BIG_WAVE.factor * waveHeight(windSpeed, fetchDistance(rings, p, windDir));
}

/**
 * Kaatuuko rengas: aalto on tarpeeksi korkea ja tulee sivulta tai takaa.
 * Aallot tulevat sieltä, mistä tuulee, eli suunnasta windDir + π.
 */
export function capsizes(heading: number, windDir: number, height: number): boolean {
  if (height < BIG_WAVE.capsizeHeight) return false;
  const from = windDir + Math.PI;
  const off = Math.abs(Math.atan2(Math.sin(heading - from), Math.cos(heading - from)));
  return off > BIG_WAVE.safeAngle;
}
