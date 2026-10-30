import {
  FLIES,
  isPlayableSeason,
  SPECIES,
  type Season,
  type FlyId,
  type Sky,
  type SpeciesId,
  type TimeOfDay,
} from '@lunki/shared';
import { profileKey } from '../net/identity';
import { parseSlot, sameSlot, type LureSlot } from './tackleBox';

/**
 * Saalispäiväkirja (#415): omat saaliit vieheineen ja oloineen nimimerkin
 * profiilissa. Viehepakki näyttää siitä, mikä viehe on toiminut ja missä
 * oloissa. Pelkkä asiakas: palvelin ja ennätykset eivät muutu, ja
 * moninpelissä kirjataan vain omat saaliit.
 */
export interface JournalEntry {
  species: SpeciesId;
  weight: number;
  /** Viehe säätöineen tai perho. */
  bait: LureSlot | FlyId;
  sky: Sky;
  timeOfDay: TimeOfDay;
  /** Kisan vuodenaika (#427); vanhat saaliit ovat kesältä. */
  season: Season;
  /** Vieheen syvyys tärpin hetkellä (m). */
  depth: number;
  x: number;
  y: number;
  /** Aikaleima (ms). */
  at: number;
}

/** Näin monta viimeisintä saalista säilytetään. */
export const JOURNAL_MAX = 200;
/** "Parhaiten"-vinkki vasta, kun saaliita on näin monta: harvasta ei voi päätellä. */
export const BEST_MIN = 3;

const SKIES: readonly Sky[] = ['calm', 'windy', 'rain', 'thunder', 'storm'];
const TIMES: readonly TimeOfDay[] = ['morning', 'day', 'evening', 'night'];

/** Syvyysvyöhykkeiden ylärajat (m); viimeinen vyöhyke on näitä syvempi. */
export const DEPTH_BANDS = [1, 2, 3, 5] as const;
export type DepthBand = 0 | 1 | 2 | 3 | 4;

export const depthBand = (depth: number) =>
  DEPTH_BANDS.filter((edge) => depth >= edge).length as DepthBand;

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function parseBait(v: unknown): LureSlot | FlyId | null {
  if (typeof v === 'string') return Object.hasOwn(FLIES, v) ? (v as FlyId) : null;
  return parseSlot(v);
}

function parseEntry(v: unknown): JournalEntry | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const bait = parseBait(o.bait);
  const weight = num(o.weight);
  if (
    !bait ||
    typeof o.species !== 'string' ||
    !Object.hasOwn(SPECIES, o.species) ||
    weight === null ||
    weight <= 0
  )
    return null;
  return {
    species: o.species as SpeciesId,
    weight,
    bait,
    sky: SKIES.includes(o.sky as Sky) ? (o.sky as Sky) : 'calm',
    timeOfDay: TIMES.includes(o.timeOfDay as TimeOfDay) ? (o.timeOfDay as TimeOfDay) : 'day',
    season: isPlayableSeason(o.season) ? o.season : 'summer',
    depth: Math.max(0, num(o.depth) ?? 0),
    x: num(o.x) ?? 0,
    y: num(o.y) ?? 0,
    at: num(o.at) ?? 0,
  };
}

/** Tallennettu päiväkirja: kelvottomat rivit pudotetaan, rikki tallennus on tyhjä. */
export function parseJournal(v: unknown): JournalEntry[] {
  if (!Array.isArray(v)) return [];
  return v
    .map(parseEntry)
    .filter((e): e is JournalEntry => e !== null)
    .slice(-JOURNAL_MAX);
}

export function loadJournal(): JournalEntry[] {
  try {
    return parseJournal(JSON.parse(localStorage.getItem(profileKey('journal')) ?? 'null'));
  } catch {
    return [];
  }
}

/** Kirjaa saaliin; vanhimmat putoavat pois, kun rivejä on yli JOURNAL_MAX. */
export function addJournalEntry(entry: JournalEntry): void {
  const next = [...loadJournal(), entry].slice(-JOURNAL_MAX);
  try {
    localStorage.setItem(profileKey('journal'), JSON.stringify(next));
  } catch {
    // Muisti täynnä tai estetty: saalis on silti kisassa ja ennätyksissä.
  }
}

const sameBait = (a: LureSlot | FlyId, b: LureSlot | FlyId) =>
  typeof a === 'string' || typeof b === 'string' ? a === b : sameSlot(a, b);

export interface BaitSummary {
  count: number;
  /** Lajit saalismäärän mukaan, eniten ensin. */
  species: [SpeciesId, number][];
  /** Yleisimmät olot, kun saaliita on vähintään BEST_MIN. */
  best: { season: Season; sky: Sky; timeOfDay: TimeOfDay; depth: DepthBand } | null;
}

/** Yleisin arvo; tasapelissä se, joka on tuoreemmissa saaliissa. */
function most<T>(newestFirst: readonly T[]): T {
  const counts = new Map<T, number>();
  for (const v of newestFirst) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = newestFirst[0] as T;
  for (const [v, n] of counts) if (n > (counts.get(best) ?? 0)) best = v;
  return best;
}

/** Vieheen tai perhon saaliit päiväkirjasta viehepakin lokeroon ja vihjeeseen. */
export function baitSummary(journal: readonly JournalEntry[], bait: LureSlot | FlyId): BaitSummary {
  const mine = journal.filter((e) => sameBait(e.bait, bait)).reverse();
  const bySpecies = new Map<SpeciesId, number>();
  for (const e of mine) bySpecies.set(e.species, (bySpecies.get(e.species) ?? 0) + 1);
  return {
    count: mine.length,
    species: [...bySpecies].sort((a, b) => b[1] - a[1]),
    best:
      mine.length >= BEST_MIN
        ? {
            season: most(mine.map((e) => e.season)),
            sky: most(mine.map((e) => e.sky)),
            timeOfDay: most(mine.map((e) => e.timeOfDay)),
            depth: most(mine.map((e) => depthBand(e.depth))),
          }
        : null,
  };
}
