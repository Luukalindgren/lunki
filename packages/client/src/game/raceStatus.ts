import {
  isUntimed,
  summarize,
  timeLeft,
  type CatchRecord,
  type CompetitionState,
  type FlyId,
  type PlayerResult,
  type SpeciesId,
} from '@lunki/shared';
import { isMine } from './raceScoreboard';
import type { LureSlot } from './tackleBox';

/** Viehe tai perho, jolla oma kala saatiin. */
export type Bait = LureSlot | FlyId;

/**
 * Kisan tilanne taukovalikkoon (#469): kalat, paino ja kolmantena
 * moninpelissä sija, yksinpelissä aika. Alla kisan paras kala vieheineen.
 */
export interface RaceStatus {
  count: number;
  /** Saaliin yhteispaino (kg). */
  total: number;
  best: { species: SpeciesId; weight: number; bait: Bait | null } | null;
  /** Moninpelissä oma sija ja kilpailijoiden määrä; katsojalla ja yksinpelissä null. */
  place: { rank: number; of: number } | null;
  /** Yksinpelin kello: jäljellä oleva aika, aikarajattomassa kulunut (s). */
  time: { kind: 'left' | 'elapsed'; seconds: number };
}

/** Saaliin avain vieheen hakuun: palvelimen punnitsema kala on eri olio kuin oma kirjaus. */
export const baitKey = (c: Pick<CatchRecord, 'species' | 'weight'>) =>
  `${c.species}:${Math.round(c.weight * 1000)}`;

/**
 * Moninpelissä luvut tulevat tulostaulun omalta riviltä (venekunnalla koko
 * veneen saalis), yksinpelissä omasta saalislistasta.
 */
export function raceStatus(
  competition: CompetitionState,
  standings: readonly PlayerResult[] | null,
  myId: string,
  baits: ReadonlyMap<string, Bait>,
): RaceStatus {
  const mine = standings?.find((r) => isMine(r, myId)) ?? null;
  const summary = mine?.summary ?? summarize(competition.catches, competition.settings.winRule);
  const best = summary.biggest;
  return {
    count: summary.count,
    total: summary.total,
    best: best
      ? { species: best.species, weight: best.weight, bait: baits.get(baitKey(best)) ?? null }
      : null,
    place: mine && standings ? { rank: mine.rank, of: standings.length } : null,
    time: isUntimed(competition.settings)
      ? { kind: 'elapsed', seconds: Math.floor(competition.elapsed) }
      : { kind: 'left', seconds: timeLeft(competition) },
  };
}
