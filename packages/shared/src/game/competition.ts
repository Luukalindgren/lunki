import type { Difficulty } from '../fishing/difficulty';
import { NATIVE_SPECIES, type SpeciesId } from '../fishing/fish';
import type { Catch } from '../fishing/fishing';
import type { Vec2 } from '../vec2';
import type { Penalty } from '../weather/lightning';
import type { TimeOfDay } from '../weather/timeOfDay';
import type { WeatherLevel } from '../weather/weather';

/** Kilpailun kesto minuutteina. */
export const DURATIONS = [10, 15, 30] as const;
export type Duration = (typeof DURATIONS)[number];

/**
 * Aikaraja puuttuu: yksinpelin sessio kestää, kunnes pelaaja lopettaa (#360).
 * Vain yksinpelissä; moninpelin huone hyväksyy pelkät `DURATIONS`.
 */
export const UNTIMED = 0;
/** Yksinpelin kestot: vapaa ensin, koska se on yksinpelin oletus. */
export const SOLO_DURATIONS = [UNTIMED, ...DURATIONS] as const;
/** Sää ja ilmiöt suunnitellaan aikarajattomaan sessioon näin pitkälle (s). */
export const UNTIMED_PLAN_S = 12 * 3600;

export const isUntimed = (s: { durationMinutes: number }): boolean => s.durationMinutes === UNTIMED;

/** Ajanjakso, jolle sää, salamat ja trombit suunnitellaan (s). */
export const planSeconds = (s: { durationMinutes: number }): number =>
  isUntimed(s) ? UNTIMED_PLAN_S : s.durationMinutes * 60;

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
  /** Vuorokaudenaika; oletuksena päivä. */
  timeOfDay?: TimeOfDay;
  /** Salaman rangaistus; oletuksena jäähy. */
  lightningPenalty?: Penalty;
  /** Kaatumisen rangaistus; oletuksena ei muuta kuin kaatuminen itse. */
  capsizePenalty?: Penalty;
  /** Maalle tai laiturille heitto: siima katkaistaan, ja uuden vieheen solmimiseen menee näin monta sekuntia. */
  landPenalty?: number;
  /** Kartalta valittu aloituspaikka; puuttuu tai null = satunnainen rannan tuntumassa. */
  start?: Vec2 | null;
}

export const DEFAULT_SETTINGS: CompetitionSettings = {
  durationMinutes: 15,
  difficulty: 'normal',
  winRule: 'total',
  species: [...NATIVE_SPECIES],
  weather: 'realistic',
  timeOfDay: 'day',
  lightningPenalty: 'time-out',
  capsizePenalty: 'none',
  landPenalty: 30,
};

export interface CatchRecord extends Catch {
  /** Kilpailuaika saaliin hetkellä (s alusta). */
  time: number;
  /** Paikka järvellä, jossa kala nostettiin (punnituskorttiin). */
  at?: Vec2;
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

/** Aikaa jäljellä (s); aikarajattomassa sessiossa Infinity. */
export function timeLeft(c: CompetitionState): number {
  if (isUntimed(c.settings)) return Infinity;
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
export function recordCatch(c: CompetitionState, fish: Catch, at?: Vec2): CatchRecord | null {
  if (c.finished) return null;
  const record: CatchRecord = { ...fish, time: c.elapsed };
  if (at) record.at = { x: at.x, y: at.y };
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
  const ss = String(s % 60).padStart(2, '0');
  if (s < 3600) return `${Math.floor(s / 60)}:${ss}`;
  return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${ss}`;
}
