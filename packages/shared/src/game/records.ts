import type { Difficulty } from '../fishing/difficulty';
import type { SpeciesId } from '../fishing/fish';
import type { LineId, LureId, RodId } from '../fishing/gear';
import type { Sky } from '../weather/weather';
import type { TimeOfDay } from '../weather/timeOfDay';

/**
 * Ennätyslistan merkintä: palvelimella punnittu saalis. Saantipaikka ja
 * olosuhteet tallennetaan lokakuusta 2026 alkaen; vanhoilla saaliilla ne puuttuvat.
 */
export interface RecordEntry {
  species: SpeciesId;
  /** Paino (kg). */
  weight: number;
  angler: string;
  difficulty: Difficulty;
  /** Saaliin päivämäärä ISO-muodossa (YYYY-MM-DD). */
  date: string;
  /** Saantihetki ISO-aikaleimana (UTC); asiakas näyttää sen omassa ajassaan. */
  at?: string;
  /** Kohta, jossa kala tarttui (m, kartan koordinaatit). */
  x?: number;
  y?: number;
  /** Kisa-aika saaliin hetkellä (s kisan alusta). */
  raceTime?: number;
  timeOfDay?: TimeOfDay;
  sky?: Sky;
  /** Tuulen nopeus (m/s). */
  wind?: number;
  lure?: LureId;
  rod?: RodId;
  line?: LineId;
  leader?: boolean;
}

/** Ennätykset vaikeustasoittain ja lajeittain, suurin ensin. */
export type RecordBoard = Partial<Record<Difficulty, Partial<Record<SpeciesId, RecordEntry[]>>>>;

/** Näin monta suurinta kalaa kustakin lajista näytetään. */
export const RECORDS_PER_SPECIES = 5;

/** Palvelimen HTTP-polku, josta ennätykset haetaan. */
export const RECORDS_PATH = '/records';
