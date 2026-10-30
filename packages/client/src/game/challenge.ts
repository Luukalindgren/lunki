import {
  SPECIES_IDS,
  formatTime,
  isUntimed,
  SOLO_DURATIONS,
  sanitizeName,
  seasonOf,
  summarize,
  validateSettingsPatch,
  type CatchRecord,
  type CompetitionSettings,
  type Difficulty,
  type Penalty,
  type Season,
  type TimeOfDay,
  type Vec2,
  type WeatherLevel,
  type WinRule,
} from '@lunki/shared';
import { formatWeight, t } from '../i18n';

/**
 * Sama kisa uudelleen ja haaste kaverille linkillä (#413). Sää, kalakanta ja
 * aloituspaikka tulevat kisan siemenestä, joten linkkiin riittävät siemen,
 * asetukset sekä haastajan tulos ja nimi. Palvelinta ei tarvita.
 *
 * Linkki: `?haaste=<siemen>.<asetukset>.<lajit>.<aloitus>.<grammat>.<kesto>.<nimi>`,
 * esim. `?haaste=1kq3x9d.2101100a.7f..4350.600.Luuka`.
 */
export const CHALLENGE_PARAM = 'haaste';

export interface Challenge {
  /** Kisan siemen (32 bittiä). */
  seed: number;
  settings: CompetitionSettings;
  /** Haastajan tulos kisan säännöllä (kg): yhteispaino tai suurin kala. */
  score: number;
  /** Haastajan kisan kesto (s); aikarajattomassa sessiossa näytetään vertailussa. */
  elapsed: number;
  /** Haastajan nimi. */
  name: string;
}

/*
 * Asetukset koodataan yhdeksi merkiksi kukin näiden taulukoiden indeksinä.
 * Vanhat linkit toimivat vain, jos taulukoihin lisätään arvoja vain loppuun.
 */
const DURATION_CODES: readonly number[] = [0, 10, 15, 30];
const DIFFICULTY_CODES: readonly Difficulty[] = ['easy', 'normal', 'realistic'];
const WIN_RULE_CODES: readonly WinRule[] = ['total', 'biggest'];
const WEATHER_CODES: readonly WeatherLevel[] = ['calm', 'realistic', 'some', 'lots', 'chaos'];
const TIME_CODES: readonly TimeOfDay[] = ['morning', 'day', 'evening', 'night'];
const PENALTY_CODES: readonly Penalty[] = ['none', 'time-out', 'lose-catch', 'out'];
const LAND_CODES: readonly number[] = [0, 15, 30, 60];
/** Kausi on yhdeksäs merkki (#427); kesän linkki on vanhan muotoinen. */
const SEASON_CODES: readonly Season[] = ['summer', 'spring', 'autumn', 'winter'];

const code = <T>(list: readonly T[], value: T | undefined, fallback: T): string =>
  Math.max(0, list.indexOf(value ?? fallback)).toString(36);

/** Kisan tulos haasteeseen ja vertailuun (kg). */
export const challengeScore = (catches: readonly CatchRecord[], rule: WinRule): number =>
  summarize(catches, rule).score;

/**
 * Tulos tekstinä: yhteispaino tai suurin kala, aikarajattomassa sessiossa
 * myös kesto, koska pidempään kalastamalla saa enemmän.
 */
export function challengeScoreText(
  score: number,
  settings: CompetitionSettings,
  elapsed: number,
): string {
  const weight = formatWeight(score);
  const text = settings.winRule === 'biggest' ? t('challenge.biggest', { weight }) : weight;
  return isUntimed(settings)
    ? t('challenge.inTime', { score: text, time: formatTime(Math.floor(elapsed)) })
    : text;
}

/** Haastelinkin parametrin arvo. */
export function encodeChallenge(c: Challenge): string {
  const s = c.settings;
  const opts = [
    code(DURATION_CODES, s.durationMinutes, 0),
    code(DIFFICULTY_CODES, s.difficulty, 'normal'),
    code(WIN_RULE_CODES, s.winRule, 'total'),
    code(WEATHER_CODES, s.weather, 'realistic'),
    code(TIME_CODES, s.timeOfDay, 'day'),
    code(PENALTY_CODES, s.lightningPenalty, 'time-out'),
    code(PENALTY_CODES, s.capsizePenalty, 'none'),
    code(LAND_CODES, s.landPenalty, 30),
    seasonOf(s) === 'summer' ? '' : code(SEASON_CODES, seasonOf(s), 'summer'),
  ].join('');
  const wanted = new Set(s.species ?? []);
  const mask = SPECIES_IDS.reduce((m, id, i) => (wanted.has(id) ? m + 2 ** i : m), 0);
  const start = s.start ? `${Math.round(s.start.x * 10)}_${Math.round(s.start.y * 10)}` : '';
  return [
    (c.seed >>> 0).toString(36),
    opts,
    mask.toString(36),
    start,
    Math.max(0, Math.round(c.score * 1000)),
    Math.max(0, Math.round(c.elapsed)),
    sanitizeName(c.name),
  ].join('.');
}

/** Haastelinkki: pelin osoite ja haaste. */
export function challengeUrl(base: string, c: Challenge): string {
  const url = new URL(base);
  url.search = '';
  url.hash = '';
  url.searchParams.set(CHALLENGE_PARAM, encodeChallenge(c));
  return url.toString();
}

/**
 * Linkin haaste tai null, jos linkki on rikki. Asetukset tarkistetaan samoilla
 * säännöillä kuin moninpelin aulassa; kesto voi olla myös aikarajaton.
 */
export function decodeChallenge(
  raw: string | null,
  isValidStart: (p: Vec2) => boolean,
): Challenge | null {
  if (!raw) return null;
  const parts = raw.split('.');
  if (parts.length < 7) return null;
  const [seedText, optsText, maskText, startText, gramsText, elapsedText] = parts.map((p) =>
    p.toLowerCase(),
  );
  const name = parts.slice(6).join('.');
  if (!/^[0-9a-z]{1,7}$/.test(seedText!) || !/^[0-9a-z]{8,9}$/.test(optsText!)) return null;
  if (!/^[0-9a-z]{1,10}$/.test(maskText!)) return null;
  if (!/^\d{1,7}$/.test(gramsText!) || !/^\d{1,6}$/.test(elapsedText!)) return null;
  const seed = parseInt(seedText!, 36);
  if (seed > 0xffffffff) return null;

  const pick = <T>(list: readonly T[], i: number): T | undefined =>
    list[parseInt(optsText!.charAt(i), 36)];
  const durationMinutes = pick(DURATION_CODES, 0);
  if (
    durationMinutes === undefined ||
    !(SOLO_DURATIONS as readonly number[]).includes(durationMinutes)
  )
    return null;

  const mask = parseInt(maskText!, 36);
  const species = SPECIES_IDS.filter((_, i) => Math.floor(mask / 2 ** i) % 2 === 1);
  let start: Vec2 | null = null;
  if (startText) {
    const m = /^(-?\d{1,6})_(-?\d{1,6})$/.exec(startText);
    if (!m) return null;
    start = { x: Number(m[1]) / 10, y: Number(m[2]) / 10 };
  }

  const patch = {
    difficulty: pick(DIFFICULTY_CODES, 1),
    winRule: pick(WIN_RULE_CODES, 2),
    weather: pick(WEATHER_CODES, 3),
    timeOfDay: pick(TIME_CODES, 4),
    lightningPenalty: pick(PENALTY_CODES, 5),
    capsizePenalty: pick(PENALTY_CODES, 6),
    landPenalty: pick(LAND_CODES, 7),
    season: optsText!.length > 8 ? pick(SEASON_CODES, 8) : 'summer',
    species,
    start,
  };
  const ok = validateSettingsPatch(patch, 1, isValidStart);
  if (
    ok.difficulty === undefined ||
    ok.winRule === undefined ||
    ok.weather === undefined ||
    ok.timeOfDay === undefined ||
    ok.lightningPenalty === undefined ||
    ok.capsizePenalty === undefined ||
    ok.landPenalty === undefined ||
    ok.season === undefined ||
    ok.species === undefined ||
    (start !== null && !ok.start)
  )
    return null;

  return {
    seed,
    settings: {
      durationMinutes,
      difficulty: ok.difficulty,
      winRule: ok.winRule,
      species: [...ok.species],
      weather: ok.weather,
      timeOfDay: ok.timeOfDay,
      lightningPenalty: ok.lightningPenalty,
      capsizePenalty: ok.capsizePenalty,
      landPenalty: ok.landPenalty,
      season: ok.season,
      start: ok.start ?? null,
    },
    score: Number(gramsText) / 1000,
    elapsed: Number(elapsedText),
    name: sanitizeName(name),
  };
}

/** Haasteen lopputulos haastetun kannalta grammaan pyöristettynä. */
export function challengeOutcome(mine: number, theirs: number): 'won' | 'lost' | 'tie' {
  const a = Math.round(mine * 1000);
  const b = Math.round(theirs * 1000);
  return a > b ? 'won' : a < b ? 'lost' : 'tie';
}
