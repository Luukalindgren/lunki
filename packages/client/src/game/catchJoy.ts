import type { Difficulty, SpeciesId } from '@lunki/shared';
import type { JournalEntry } from './journal';

/**
 * Iloiset saaliit: oma ennätys ja kala pitkän odotuksen jälkeen soivat
 * omalla, tavallista iloisemmalla äänellä (äänikartan `recordCatch` ja
 * `reliefCatch`).
 */
export type CatchJoy = 'record' | 'relief';

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
 * Saaliin ilo: ennätys voittaa helpotuksen. `waited` on kisa-aika (s)
 * edellisestä omasta saaliista tai kisan alusta.
 */
export function catchJoy(
  journal: readonly JournalEntry[],
  fish: { species: SpeciesId; weight: number },
  waited: number,
  difficulty: Difficulty,
): CatchJoy | null {
  if (isPersonalBest(journal, fish.species, fish.weight)) return 'record';
  if (waited >= RELIEF_AFTER[difficulty]) return 'relief';
  return null;
}
