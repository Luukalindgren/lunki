import {
  FLIES,
  FLY_LEADERS,
  FLY_LINES,
  FLY_RODS,
  LINES,
  LURES,
  METHODS,
  RODS,
  SKY_NAMES,
  SPECIES,
  TIME_OF_DAY_NAMES,
  formatTime,
  type FlyId,
  type FlyLeaderId,
  type FlyLineId,
  type FlyRodId,
  type LineId,
  type Method,
  type LureId,
  type RecordEntry,
  type RodId,
  type Sky,
  type SpeciesId,
  type TimeOfDay,
} from '@lunki/shared';
import { formatClock, formatDay, formatWeight, shortDecimal, t } from '../i18n';
import {
  flyLeaderName,
  flyLineName,
  flyName,
  flyRodName,
  lineName,
  lureName,
  methodName,
  rodName,
  skyName,
  speciesName,
  timeOfDayName,
} from '../i18n/names';

/** Ennätyskartan merkin väri lajin mukaan. */
export const SPECIES_PIN_COLORS: Record<SpeciesId, string> = {
  perch: '#f6a53a',
  pike: '#8fd16a',
  roach: '#e05a4f',
  zander: '#c3cbd2',
  trout: '#d98ee6',
};

/** 2026-10-25 → 25.10.2026 (englanniksi 25 Oct 2026) */
export const formatDate = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return y && m && d ? formatDay(Number(d), Number(m), y) : iso;
};

/** Saantihetki pelaajan omassa ajassa, esim. "25.10.2026 klo 19.40". */
function when(r: RecordEntry): string {
  const d = r.at ? new Date(r.at) : null;
  if (!d || Number.isNaN(d.getTime())) return formatDate(r.date);
  return `${formatDay(d.getDate(), d.getMonth() + 1, d.getFullYear())} ${formatClock(d.getHours(), d.getMinutes())}`;
}

/** Tallennetun arvon nimi, jos se tunnetaan; muuten arvo sellaisenaan. */
const known = <T extends string>(table: object, v: T, name: (v: T) => string) =>
  Object.hasOwn(table, v) ? name(v) : v;

/** Otsikko, esim. "Hauki 3,20 kg". */
export const recordTitle = (r: RecordEntry) =>
  `${known<SpeciesId>(SPECIES, r.species, speciesName)} ${formatWeight(r.weight)}`;

/**
 * Ennätyskalan tiedot riveinä [otsikko, arvo]. `spot` on saantipaikan
 * kuvaus (syvyys ja pohja), jos paikka on tallessa.
 */
export function recordDetails(r: RecordEntry, spot?: string | null): [string, string][] {
  const rows: [string, string][] = [
    [t('common.angler'), r.angler],
    [t('records.caught'), when(r)],
  ];
  if (r.timeOfDay) {
    const race =
      r.raceTime !== undefined ? t('records.raceTime', { time: formatTime(r.raceTime) }) : '';
    rows.push([
      t('records.race'),
      `${known<TimeOfDay>(TIME_OF_DAY_NAMES, r.timeOfDay, timeOfDayName)}${race}`,
    ]);
  }
  if (r.sky) {
    const wind = r.wind !== undefined ? t('records.wind', { wind: shortDecimal(r.wind) }) : '';
    rows.push([t('settings.weather'), `${known<Sky>(SKY_NAMES, r.sky, skyName)}${wind}`]);
  }
  // Virveli vai perho (#233): vanhat saaliit ovat virvelillä.
  if (r.method) rows.push([t('records.method'), known<Method>(METHODS, r.method, methodName)]);
  if (r.fly) rows.push([t('records.fly'), known<FlyId>(FLIES, r.fly, flyName)]);
  if (r.lure) rows.push([t('records.lure'), known<LureId>(LURES, r.lure, lureName)]);
  const gear =
    r.method === 'fly'
      ? [
          r.flyRod && known<FlyRodId>(FLY_RODS, r.flyRod, flyRodName),
          r.flyLine &&
            t('records.line', { name: known<FlyLineId>(FLY_LINES, r.flyLine, flyLineName) }),
          r.flyLeader &&
            `${t('tackle.flyLeader')} ${known<FlyLeaderId>(FLY_LEADERS, r.flyLeader, flyLeaderName)}`.toLowerCase(),
        ].filter(Boolean)
      : [
          r.rod && known<RodId>(RODS, r.rod, rodName),
          r.line && t('records.line', { name: known<LineId>(LINES, r.line, lineName) }),
          r.leader && t('records.leader'),
        ].filter(Boolean);
  if (gear.length > 0) rows.push([t('records.gear'), gear.join(', ')]);
  rows.push([
    t('records.place'),
    r.x !== undefined && r.y !== undefined
      ? (spot ?? t('records.placeKept'))
      : t('records.placeMissing'),
  ]);
  return rows;
}
