import { DIFFICULTIES, type Difficulty } from '../fishing/difficulty';
import { SPECIES, SPECIES_IDS, type SpeciesId } from '../fishing/fish';
import { DURATIONS, type CompetitionSettings, type WinRule } from '../game/competition';
import { PENALTY_IDS, PENALTY_NAMES, type Penalty } from '../weather/lightning';
import {
  TIME_OF_DAY_IDS,
  TIME_OF_DAY_NAMES,
  isTimeOfDay,
  type TimeOfDay,
} from '../weather/timeOfDay';
import {
  SEASONS,
  SEASON_IDS,
  SEASON_NAMES,
  isPlayableSeason,
  type Season,
} from '../weather/season';
import { WEATHER_LEVELS, WEATHER_LEVEL_IDS, type WeatherLevel } from '../weather/weather';
import type { Vec2 } from '../vec2';
import { MAX_PLAYERS_LIMIT } from './protocol';

/**
 * Huoneen asetukset. Osa on paikkoja tuleville ominaisuuksille: ne näkyvät
 * aulassa, mutta vain toteutettu arvo kelpaa.
 */
export interface RoomSettings extends CompetitionSettings {
  maxPlayers: number;
  /** Säätaso. */
  weather: WeatherLevel;
  /** Vuorokaudenaika. */
  timeOfDay: TimeOfDay;
  /** Vuodenaika (#427). */
  season: Season;
  /** Salaman rangaistus. */
  lightningPenalty: Penalty;
  /** Renkaan kaatumisen rangaistus. */
  capsizePenalty: Penalty;
  /** Maalle heiton aikasakko (s), yksi LAND_PENALTIES-arvoista. */
  landPenalty: number;
  /** Järven kalalajit. */
  species: SpeciesId[];
  /** Pääseekö kisaan mukaan sen jo alettua (ks. LATE_JOIN_OPTIONS). */
  lateJoin: LateJoin;
}

/**
 * Liittyminen kesken kisan: `open` = uudetkin pelaajat, `return` = vain
 * kisasta pudonneet takaisin omalle paikalleen, `closed` = ei kumpikaan
 * (lyhyt yhteyskatko palautuu silti).
 */
export type LateJoin = 'open' | 'return' | 'closed';

export const LATE_JOIN_OPTIONS: { value: LateJoin; label: string }[] = [
  { value: 'open', label: 'Sallittu' },
  { value: 'return', label: 'Vain paluu' },
  { value: 'closed', label: 'Ei' },
];

export const isLateJoin = (v: unknown): v is LateJoin =>
  LATE_JOIN_OPTIONS.some((o) => o.value === v);

/** Valinnat aulaan. `ready` = toteutettu, muut näytetään tulossa olevina. */
export const PLAYER_COUNTS = [2, 4, 8, 12, 16] as const;

export const WEATHER_OPTIONS: { value: WeatherLevel; label: string; ready: boolean }[] =
  WEATHER_LEVEL_IDS.map((id) => ({ value: id, label: WEATHER_LEVELS[id].label, ready: true }));

export const TIME_OF_DAY_OPTIONS: { value: TimeOfDay; label: string }[] = TIME_OF_DAY_IDS.map(
  (id) => ({ value: id, label: TIME_OF_DAY_NAMES[id] }),
);

/** Vuodenajat; talvi näkyy, mutta tulee käyttöön pilkkikauden mukana (#140). */
export const SEASON_OPTIONS: { value: Season; label: string; ready: boolean }[] = SEASON_IDS.map(
  (id) => ({ value: id, label: SEASON_NAMES[id], ready: SEASONS[id].available }),
);

export const LIGHTNING_PENALTY_OPTIONS: { value: Penalty; label: string; ready: boolean }[] =
  PENALTY_IDS.map((id) => ({ value: id, label: PENALTY_NAMES[id], ready: true }));

export const CAPSIZE_PENALTY_OPTIONS = LIGHTNING_PENALTY_OPTIONS;

/** Maalle heiton aikasakon vaihtoehdot (s); salaman jäähyä lyhyempiä. */
export const LAND_PENALTIES = [0, 15, 30, 60] as const;

export const LAND_PENALTY_OPTIONS: { value: number; label: string }[] = LAND_PENALTIES.map((s) => ({
  value: s,
  label: s === 0 ? 'Ei aikasakkoa' : `Aikasakko ${s} s`,
}));

/** Lajit valintoina; `native` = elää oikeasti Lunkinjärvessä. */
export const SPECIES_OPTIONS: { value: SpeciesId; label: string; native: boolean }[] =
  SPECIES_IDS.map((id) => ({ value: id, label: SPECIES[id].name, native: SPECIES[id].native }));

const readyValues = <T>(list: { value: T; ready: boolean }[]) =>
  list.filter((o) => o.ready).map((o) => o.value);

const isPoint = (v: unknown): v is Vec2 =>
  !!v && typeof v === 'object' && Number.isFinite((v as Vec2).x) && Number.isFinite((v as Vec2).y);

/**
 * Tarkistaa isännän lähettämän muutoksen. Palauttaa vain kelvolliset kentät;
 * tuntemattomat ja toteuttamattomat arvot jätetään pois. Aloituspaikka
 * hyväksytään vain, jos `isValidStart` hyväksyy sen (vesi, irti rannasta).
 */
export function validateSettingsPatch(
  patch: unknown,
  playerCount: number,
  isValidStart: (p: Vec2) => boolean = () => false,
): Partial<RoomSettings> {
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
  if (readyValues(WEATHER_OPTIONS).includes(p.weather as WeatherLevel))
    out.weather = p.weather as WeatherLevel;
  if (isTimeOfDay(p.timeOfDay)) out.timeOfDay = p.timeOfDay;
  if (isPlayableSeason(p.season)) out.season = p.season;
  if (readyValues(LIGHTNING_PENALTY_OPTIONS).includes(p.lightningPenalty as Penalty))
    out.lightningPenalty = p.lightningPenalty as Penalty;
  if (readyValues(CAPSIZE_PENALTY_OPTIONS).includes(p.capsizePenalty as Penalty))
    out.capsizePenalty = p.capsizePenalty as Penalty;
  if ((LAND_PENALTIES as readonly unknown[]).includes(p.landPenalty))
    out.landPenalty = p.landPenalty as number;
  if (isLateJoin(p.lateJoin)) out.lateJoin = p.lateJoin;
  if (Array.isArray(p.species)) {
    // Järjestys aina sama, jotta sama valinta tuottaa saman järven.
    const wanted = new Set<unknown>(p.species);
    const species = SPECIES_IDS.filter((id) => wanted.has(id));
    if (species.length > 0) out.species = species;
  }
  if (p.start === null) out.start = null;
  else if (isPoint(p.start)) {
    // Desimetrin tarkkuus riittää ja pitää arvon samana kaikilla.
    const start = { x: Math.round(p.start.x * 10) / 10, y: Math.round(p.start.y * 10) / 10 };
    if (isValidStart(start)) out.start = start;
  }
  return out;
}
