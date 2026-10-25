import { DIFFICULTIES, type Difficulty } from '../fishing/difficulty';
import { SPECIES, SPECIES_IDS, type SpeciesId } from '../fishing/fish';
import { DURATIONS, type CompetitionSettings, type WinRule } from '../game/competition';
import { PENALTY_IDS, PENALTY_NAMES, type Penalty } from '../weather/lightning';
import { WEATHER_LEVELS, WEATHER_LEVEL_IDS, type WeatherLevel } from '../weather/weather';
import { MAX_PLAYERS_LIMIT } from './protocol';

/**
 * Huoneen asetukset. Osa on paikkoja tuleville ominaisuuksille: ne näkyvät
 * aulassa, mutta vain toteutettu arvo kelpaa.
 */
export interface RoomSettings extends CompetitionSettings {
  maxPlayers: number;
  /** Säätaso. */
  weather: WeatherLevel;
  /** Salaman rangaistus. */
  lightningPenalty: Penalty;
  /** Renkaan kaatumisen rangaistus. */
  capsizePenalty: Penalty;
  /** Järven kalalajit. */
  species: SpeciesId[];
}

/** Valinnat aulaan. `ready` = toteutettu, muut näytetään tulossa olevina. */
export const PLAYER_COUNTS = [2, 4, 8, 12, 16] as const;

export const WEATHER_OPTIONS: { value: WeatherLevel; label: string; ready: boolean }[] =
  WEATHER_LEVEL_IDS.map((id) => ({ value: id, label: WEATHER_LEVELS[id].label, ready: true }));

export const LIGHTNING_PENALTY_OPTIONS: { value: Penalty; label: string; ready: boolean }[] =
  PENALTY_IDS.map((id) => ({ value: id, label: PENALTY_NAMES[id], ready: true }));

export const CAPSIZE_PENALTY_OPTIONS = LIGHTNING_PENALTY_OPTIONS;

/** Lajit valintoina; `native` = elää oikeasti Lunkinjärvessä. */
export const SPECIES_OPTIONS: { value: SpeciesId; label: string; native: boolean }[] =
  SPECIES_IDS.map((id) => ({ value: id, label: SPECIES[id].name, native: SPECIES[id].native }));

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
  if (readyValues(WEATHER_OPTIONS).includes(p.weather as WeatherLevel))
    out.weather = p.weather as WeatherLevel;
  if (readyValues(LIGHTNING_PENALTY_OPTIONS).includes(p.lightningPenalty as Penalty))
    out.lightningPenalty = p.lightningPenalty as Penalty;
  if (readyValues(CAPSIZE_PENALTY_OPTIONS).includes(p.capsizePenalty as Penalty))
    out.capsizePenalty = p.capsizePenalty as Penalty;
  if (Array.isArray(p.species)) {
    // Järjestys aina sama, jotta sama valinta tuottaa saman järven.
    const wanted = new Set<unknown>(p.species);
    const species = SPECIES_IDS.filter((id) => wanted.has(id));
    if (species.length > 0) out.species = species;
  }
  return out;
}
