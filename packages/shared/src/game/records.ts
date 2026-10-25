import { DIFFICULTIES, type Difficulty } from '../fishing/difficulty';
import { SPECIES, type SpeciesId } from '../fishing/fish';
import { LINES, LURES, RODS, type LineId, type LureId, type RodId } from '../fishing/gear';
import { sanitizeName } from '../net/protocol';
import { SKY_NAMES, type Sky } from '../weather/weather';
import { TIME_OF_DAY_NAMES, type TimeOfDay } from '../weather/timeOfDay';

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

/**
 * Yksinpelin ennätyslista: saaliit ilmoittaa pelaajan oma selain, koska
 * palvelin ei näe yksinpeliä. Siksi lista on erillään moninpelin listasta.
 * GET hakee listan (RecordBoard), POST lähettää saaliin (SoloRecordReply).
 */
export const SOLO_RECORDS_PATH = '/records/solo';

/** Kumpi ennätyslista: moninpelin palvelimella punnitut vai yksinpelin ilmoitetut. */
export type RecordMode = 'race' | 'solo';

/** Vastaus yksinpelin saaliiseen: sija lajin listalla, tai null jos ei päässyt listalle. */
export interface SoloRecordReply {
  place: number | null;
}

const has = <K extends string>(table: Record<K, unknown>, v: unknown): v is K =>
  typeof v === 'string' && Object.hasOwn(table, v);
const num = (v: unknown, min: number, max: number): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : undefined;
const round1 = (v: number | undefined) => (v === undefined ? undefined : Math.round(v * 10) / 10);

/**
 * Tarkistaa selaimen lähettämän yksinpelin saaliin. Lajin, painon ja
 * vaikeustason pitää kelvata; virheelliset lisätiedot jätetään pois.
 * Päivä ja kellonaika tulevat palvelimelta (`now`).
 */
export function parseSoloRecord(v: unknown, now = new Date()): RecordEntry | null {
  const o = (v ?? {}) as Record<string, unknown>;
  if (!has(SPECIES, o.species) || !has(DIFFICULTIES, o.difficulty)) return null;
  const sp = SPECIES[o.species];
  const weight = num(o.weight, sp.minWeight, sp.maxWeight);
  if (weight === undefined) return null;
  const iso = now.toISOString();
  const e: RecordEntry = {
    species: o.species,
    weight: Math.round(weight * 1000) / 1000,
    angler: sanitizeName(o.angler),
    difficulty: o.difficulty,
    date: iso.slice(0, 10),
    at: iso,
  };
  const x = round1(num(o.x, -1e5, 1e5));
  const y = round1(num(o.y, -1e5, 1e5));
  if (x !== undefined && y !== undefined) Object.assign(e, { x, y });
  const raceTime = num(o.raceTime, 0, 24 * 3600);
  if (raceTime !== undefined) e.raceTime = Math.round(raceTime);
  if (has(TIME_OF_DAY_NAMES, o.timeOfDay)) e.timeOfDay = o.timeOfDay;
  if (has(SKY_NAMES, o.sky)) e.sky = o.sky;
  const wind = round1(num(o.wind, 0, 100));
  if (wind !== undefined) e.wind = wind;
  if (has(LURES, o.lure)) e.lure = o.lure;
  if (has(RODS, o.rod)) e.rod = o.rod;
  if (has(LINES, o.line)) e.line = o.line;
  if (typeof o.leader === 'boolean') e.leader = o.leader;
  return e;
}
