import { DIFFICULTIES, type Difficulty } from '../fishing/difficulty';
import { DURATIONS, type CompetitionSettings, type WinRule } from '../game/competition';
import { MAX_PLAYERS_LIMIT } from './protocol';

/**
 * Huoneen asetukset. Osa on paikkoja tuleville ominaisuuksille: ne näkyvät
 * aulassa, mutta vain toteutettu arvo kelpaa.
 */
export interface RoomSettings extends CompetitionSettings {
  maxPlayers: number;
  /** Säätaso (vaihe 4). */
  weather: Weather;
  /** Salaman rangaistus (vaihe 4). */
  lightningPenalty: Penalty;
  /** Renkaan kaatumisen rangaistus (vaihe 4). */
  capsizePenalty: Penalty;
  /** Kalalajit (vaihe 3). */
  species: string[];
}

export type Weather = 'calm' | 'variable' | 'stormy';
export type Penalty = 'none' | 'lose-catch' | 'time-out';

/** Valinnat aulaan. `ready` = toteutettu, muut näytetään tulossa olevina. */
export const PLAYER_COUNTS = [2, 4, 8, 12, 16] as const;

export const WEATHER_OPTIONS: { value: Weather; label: string; ready: boolean }[] = [
  { value: 'calm', label: 'Tyyni', ready: true },
  { value: 'variable', label: 'Vaihteleva', ready: false },
  { value: 'stormy', label: 'Myrskyinen', ready: false },
];

export const PENALTY_OPTIONS: { value: Penalty; label: string; ready: boolean }[] = [
  { value: 'none', label: 'Ei rangaistusta', ready: true },
  { value: 'lose-catch', label: 'Menetä saalis', ready: false },
  { value: 'time-out', label: 'Jäähy', ready: false },
];

export const SPECIES_OPTIONS: { value: string; label: string; ready: boolean }[] = [
  { value: 'perch', label: 'Ahven', ready: true },
  { value: 'pike', label: 'Hauki', ready: false },
  { value: 'roach', label: 'Särki', ready: false },
  { value: 'zander', label: 'Kuha', ready: false },
];

const readyValues = <T>(list: { value: T; ready: boolean }[]) =>
  list.filter((o) => o.ready).map((o) => o.value);

/**
 * Tarkistaa isännän lähettämän muutoksen. Palauttaa vain kelvolliset kentät;
 * tuntemattomat ja toteuttamattomat arvot jätetään pois.
 */
export function validateSettingsPatch(patch: unknown, playerCount: number): Partial<RoomSettings> {
  if (!patch || typeof patch !== 'object') return {};
  const p = patch as Record<string, unknown>;
  const out: Partial<RoomSettings> = {};
  if ((DURATIONS as readonly unknown[]).includes(p.durationMinutes))
    out.durationMinutes = p.durationMinutes as number;
  if (p.winRule === 'total' || p.winRule === 'biggest') out.winRule = p.winRule as WinRule;
  if (typeof p.difficulty === 'string' && Object.hasOwn(DIFFICULTIES, p.difficulty))
    out.difficulty = p.difficulty as Difficulty;
  if (
    typeof p.maxPlayers === 'number' &&
    Number.isInteger(p.maxPlayers) &&
    p.maxPlayers >= Math.max(1, playerCount) &&
    p.maxPlayers <= MAX_PLAYERS_LIMIT
  )
    out.maxPlayers = p.maxPlayers;
  if (readyValues(WEATHER_OPTIONS).includes(p.weather as Weather))
    out.weather = p.weather as Weather;
  if (readyValues(PENALTY_OPTIONS).includes(p.lightningPenalty as Penalty))
    out.lightningPenalty = p.lightningPenalty as Penalty;
  if (readyValues(PENALTY_OPTIONS).includes(p.capsizePenalty as Penalty))
    out.capsizePenalty = p.capsizePenalty as Penalty;
  if (Array.isArray(p.species)) {
    const allowed = readyValues(SPECIES_OPTIONS);
    const species = [...new Set(p.species)].filter((s): s is string =>
      allowed.includes(s as string),
    );
    if (species.length > 0) out.species = species;
  }
  return out;
}
