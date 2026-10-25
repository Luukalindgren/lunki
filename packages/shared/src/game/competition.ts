import type { Difficulty } from '../fishing/difficulty';
import { NATIVE_SPECIES, type SpeciesId } from '../fishing/fish';
import type { Catch } from '../fishing/fishing';
import type { WeatherLevel } from '../weather/weather';

/** Kilpailun kesto minuutteina. */
export const DURATIONS = [10, 15, 30] as const;
export type Duration = (typeof DURATIONS)[number];

/** Voittoehto: suurin yhteispaino tai suurin yksittäinen kala. */
export type WinRule = 'total' | 'biggest';

export const WIN_RULE_NAMES: Record<WinRule, string> = {
  total: 'Suurin yhteispaino',
  biggest: 'Suurin kala',
};

export interface CompetitionSettings {
  durationMinutes: number;
  difficulty: Difficulty;
  winRule: WinRule;
  /** Järven kalalajit; oletuksena Lunkinjärven oikeat lajit. */
  species?: SpeciesId[];
  /** Säätaso; oletuksena realistinen. */
  weather?: WeatherLevel;
}

export const DEFAULT_SETTINGS: CompetitionSettings = {
  durationMinutes: 15,
  difficulty: 'normal',
  winRule: 'total',
  species: [...NATIVE_SPECIES],
  weather: 'realistic',
};

export interface CatchRecord extends Catch {
  /** Kilpailuaika saaliin hetkellä (s alusta). */
  time: number;
}

export interface CompetitionState {
  settings: CompetitionSettings;
  elapsed: number;
  catches: CatchRecord[];
  finished: boolean;
}

export const createCompetition = (settings: CompetitionSettings): CompetitionState => ({
  settings,
  elapsed: 0,
  catches: [],
  finished: false,
});

export function timeLeft(c: CompetitionState): number {
  return Math.max(0, c.settings.durationMinutes * 60 - c.elapsed);
}

/** Etenee ajassa. Palauttaa true sillä askeleella, kun aika loppuu. */
export function stepCompetition(c: CompetitionState, dt: number): boolean {
  if (c.finished) return false;
  c.elapsed += dt;
  if (timeLeft(c) <= 0) {
    c.finished = true;
    return true;
  }
  return false;
}

/** Kirjaa punnitun saaliin, jos kilpailu on käynnissä. */
export function recordCatch(c: CompetitionState, fish: Catch): CatchRecord | null {
  if (c.finished) return null;
  const record = { ...fish, time: c.elapsed };
  c.catches.push(record);
  return record;
}

export interface CatchSummary {
  count: number;
  total: number;
  biggest: CatchRecord | null;
  /** Pisteet voittoehdon mukaan (kg). */
  score: number;
}

export function summarize(catches: readonly CatchRecord[], rule: WinRule): CatchSummary {
  const total = Math.round(catches.reduce((sum, c) => sum + c.weight, 0) * 1000) / 1000;
  const biggest = catches.reduce<CatchRecord | null>(
    (best, c) => (!best || c.weight > best.weight ? c : best),
    null,
  );
  return {
    count: catches.length,
    total,
    biggest,
    score: rule === 'total' ? total : (biggest?.weight ?? 0),
  };
}

/** Aika muodossa m:ss. */
export function formatTime(seconds: number): string {
  const s = Math.ceil(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
