import { DIFFICULTIES, type Difficulty } from '../fishing/difficulty';
import { SPECIES, type SpeciesId } from '../fishing/fish';
import {
  FLIES,
  FLY_LEADERS,
  FLY_LINES,
  FLY_RODS,
  LINES,
  LURES,
  METHODS,
  RODS,
  isLureVariant,
  lureVariant,
  type CrankDepthId,
  type FlyId,
  type FlyLeaderId,
  type FlyLineId,
  type FlyRodId,
  type JigWeightId,
  type LineId,
  type LureId,
  type Method,
  type RodId,
  type Tackle,
} from '../fishing/gear';
import { parseAppearance, type Appearance } from '../net/appearance';
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
  /** Virveli vai perho (#233); vanhoissa saaliissa puuttuu, ja ne ovat virvelillä. */
  method?: Method;
  /** Virvelin varusteet. */
  lure?: LureId;
  /** Jigin paino tai vaapun uintisyvyys (#363), kun vieheellä on säätö. */
  lureVariant?: JigWeightId | CrankDepthId;
  rod?: RodId;
  line?: LineId;
  leader?: boolean;
  /** Perhon varusteet. */
  fly?: FlyId;
  flyRod?: FlyRodId;
  flyLine?: FlyLineId;
  flyLeader?: FlyLeaderId;
  /** Kalastajan ulkonäkö punnituskorttiin (lokakuusta 2026 alkaen). */
  appearance?: Appearance;
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

/**
 * Palvelimen ollessa kiinni selain pitää saaliit tallessa ja lähettää ne
 * myöhemmin saantihetken kanssa. Näin vanhaa saantihetkeä palvelin uskoo.
 */
export const SOLO_RECORD_MAX_AGE_MS = 60 * 24 * 3600 * 1000;

/** Vastaus yksinpelin saaliiseen: sija lajin listalla, tai null jos ei päässyt listalle. */
export interface SoloRecordReply {
  place: number | null;
}

const has = <K extends string>(table: Record<K, unknown>, v: unknown): v is K =>
  typeof v === 'string' && Object.hasOwn(table, v);
const num = (v: unknown, min: number, max: number): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : undefined;
const round1 = (v: number | undefined) => (v === undefined ? undefined : Math.round(v * 10) / 10);

/** Selaimen ilmoittama saantihetki, jos uskottava; muuten palvelimen aika. */
function caughtAt(at: unknown, now: Date): Date {
  if (typeof at !== 'string') return now;
  const t = Date.parse(at);
  // Pieni jousto eteenpäin: selaimen kello voi olla hieman edellä.
  const ok =
    Number.isFinite(t) &&
    t <= now.getTime() + 5 * 60_000 &&
    t >= now.getTime() - SOLO_RECORD_MAX_AGE_MS;
  return ok ? new Date(Math.min(t, now.getTime())) : now;
}

/** Saaliin varustetiedot ennätykseen: käytössä olevan kalastustavan välineet. */
export function recordTackle(
  t: Tackle,
): Pick<
  RecordEntry,
  | 'method'
  | 'lure'
  | 'lureVariant'
  | 'rod'
  | 'line'
  | 'leader'
  | 'fly'
  | 'flyRod'
  | 'flyLine'
  | 'flyLeader'
> {
  if (t.method === 'fly')
    return {
      method: 'fly',
      fly: t.fly,
      flyRod: t.flyRod,
      flyLine: t.flyLine,
      flyLeader: t.flyLeader,
    };
  const variant = lureVariant(t);
  return {
    method: 'spin',
    lure: t.lure,
    ...(variant ? { lureVariant: variant } : {}),
    rod: t.rod,
    line: t.line,
    leader: t.leader,
  };
}

/**
 * Tarkistaa selaimen lähettämän yksinpelin saaliin. Lajin, painon ja
 * vaikeustason pitää kelvata; virheelliset lisätiedot jätetään pois.
 * Päivä ja kellonaika tulevat palvelimelta (`now`), paitsi myöhässä
 * lähetetyllä saaliilla selaimen ilmoittama saantihetki (`at`), jos se on
 * uskottava: ei tulevaisuudessa eikä vanhempi kuin SOLO_RECORD_MAX_AGE_MS.
 */
export function parseSoloRecord(v: unknown, now = new Date()): RecordEntry | null {
  const o = (v ?? {}) as Record<string, unknown>;
  if (!has(SPECIES, o.species) || !has(DIFFICULTIES, o.difficulty)) return null;
  const sp = SPECIES[o.species];
  const weight = num(o.weight, sp.minWeight, sp.maxWeight);
  if (weight === undefined) return null;
  const iso = caughtAt(o.at, now).toISOString();
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
  if (has(METHODS, o.method)) e.method = o.method;
  if (e.method === 'fly') {
    if (has(FLIES, o.fly)) e.fly = o.fly;
    if (has(FLY_RODS, o.flyRod)) e.flyRod = o.flyRod;
    if (has(FLY_LINES, o.flyLine)) e.flyLine = o.flyLine;
    if (has(FLY_LEADERS, o.flyLeader)) e.flyLeader = o.flyLeader;
  } else {
    if (has(LURES, o.lure)) e.lure = o.lure;
    if (isLureVariant(o.lureVariant)) e.lureVariant = o.lureVariant;
    if (has(RODS, o.rod)) e.rod = o.rod;
    if (has(LINES, o.line)) e.line = o.line;
    if (typeof o.leader === 'boolean') e.leader = o.leader;
  }
  const look = parseAppearance(o.appearance);
  if (look) e.appearance = look;
  return e;
}
