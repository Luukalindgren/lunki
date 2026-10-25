import type { Difficulty } from '../fishing/difficulty';
import type { SpeciesId } from '../fishing/fish';

/** Ennätyslistan merkintä: palvelimella punnittu saalis. */
export interface RecordEntry {
  species: SpeciesId;
  /** Paino (kg). */
  weight: number;
  angler: string;
  difficulty: Difficulty;
  /** Saaliin päivämäärä ISO-muodossa (YYYY-MM-DD). */
  date: string;
}

/** Ennätykset vaikeustasoittain ja lajeittain, suurin ensin. */
export type RecordBoard = Partial<Record<Difficulty, Partial<Record<SpeciesId, RecordEntry[]>>>>;

/** Näin monta suurinta kalaa kustakin lajista näytetään. */
export const RECORDS_PER_SPECIES = 5;

/** Palvelimen HTTP-polku, josta ennätykset haetaan. */
export const RECORDS_PATH = '/records';
