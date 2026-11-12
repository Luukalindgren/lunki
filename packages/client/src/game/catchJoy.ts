import type { Difficulty, SpeciesId } from '@lunki/shared';
import type { SoundEvent } from '../audio/sounds';
import type { JournalEntry } from './journal';

/**
 * Iloiset saaliit: oma ennätys, kala pitkän odotuksen jälkeen ja kisan
 * suurin tähän asti saavat oman repliikin (äänikartan `recordCatch`,
 * `reliefCatch` ja `raceBestCatch`).
 */
export type CatchJoy = 'record' | 'relief' | 'raceBest';

export const JOY_SOUNDS = {
  record: 'recordCatch',
  relief: 'reliefCatch',
  raceBest: 'raceBestCatch',
} as const satisfies Record<CatchJoy, SoundEvent>;

/**
 * Kisa-aika (s), jonka jälkeen saalis on helpotus: noin kaksi–kolme kertaa
 * tason tavallinen kalojen väli (`naiveAngler.test.ts`: helppo 1,1,
 * normaali 0,4 ja realistinen 0,2 kalaa minuutissa).
 */
export const RELIEF_AFTER: Record<Difficulty, number> = {
  easy: 180,
  normal: 360,
  realistic: 600,
};

/**
 * Oma ennätys: painavampi kuin yksikään saman lajin aiempi saalis
 * päiväkirjassa. Lajin ensimmäinen kala ei vielä ole ennätys.
 */
export function isPersonalBest(
  journal: readonly JournalEntry[],
  species: SpeciesId,
  weight: number,
): boolean {
  const earlier = journal.filter((e) => e.species === species);
  return earlier.length > 0 && earlier.every((e) => e.weight < weight);
}

/**
 * Kisan suurin tähän asti: painavampi kuin yksikään kisan aiempi oma saalis.
 * Kisan ensimmäinen kala ei vielä ole suurin.
 */
export function isRaceBest(earlier: readonly { weight: number }[], weight: number): boolean {
  return earlier.length > 0 && earlier.every((c) => c.weight < weight);
}

/**
 * Saaliin ilo: ennätys voittaa helpotuksen ja helpotus kisan suurimman.
 * `waited` on kisa-aika (s) edellisestä omasta saaliista tai kisan alusta,
 * `earlier` kisan aiemmat omat saaliit.
 */
export function catchJoy(
  journal: readonly JournalEntry[],
  fish: { species: SpeciesId; weight: number },
  race: { waited: number; earlier: readonly { weight: number }[] },
  difficulty: Difficulty,
): CatchJoy | null {
  if (isPersonalBest(journal, fish.species, fish.weight)) return 'record';
  if (race.waited >= RELIEF_AFTER[difficulty]) return 'relief';
  if (isRaceBest(race.earlier, fish.weight)) return 'raceBest';
  return null;
}
