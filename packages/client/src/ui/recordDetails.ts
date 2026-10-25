import {
  LINES,
  LURES,
  RODS,
  SKY_NAMES,
  SPECIES,
  TIME_OF_DAY_NAMES,
  formatTime,
  formatWeight,
  type RecordEntry,
  type SpeciesId,
} from '@lunki/shared';

/** Ennätyskartan merkin väri lajin mukaan. */
export const SPECIES_PIN_COLORS: Record<SpeciesId, string> = {
  perch: '#f6a53a',
  pike: '#8fd16a',
  roach: '#e05a4f',
  zander: '#c3cbd2',
  trout: '#d98ee6',
};

const fi = (v: number) => String(v).replace('.', ',');
const two = (n: number) => String(n).padStart(2, '0');

/** 2026-10-25 → 25.10.2026 */
export const formatDate = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${Number(d)}.${Number(m)}.${y}` : iso;
};

/** Saantihetki pelaajan omassa ajassa, esim. "25.10.2026 klo 19.40". */
function when(r: RecordEntry): string {
  const d = r.at ? new Date(r.at) : null;
  if (!d || Number.isNaN(d.getTime())) return formatDate(r.date);
  return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()} klo ${d.getHours()}.${two(d.getMinutes())}`;
}

/** Otsikko, esim. "Hauki 3,20 kg". */
export const recordTitle = (r: RecordEntry) =>
  `${SPECIES[r.species]?.name ?? r.species} ${formatWeight(r.weight)}`;

/**
 * Ennätyskalan tiedot riveinä [otsikko, arvo]. `spot` on saantipaikan
 * kuvaus (syvyys ja pohja), jos paikka on tallessa.
 */
export function recordDetails(r: RecordEntry, spot?: string | null): [string, string][] {
  const rows: [string, string][] = [
    ['Kalastaja', r.angler],
    ['Saatu', when(r)],
  ];
  if (r.timeOfDay) {
    const race = r.raceTime !== undefined ? `, ${formatTime(r.raceTime)} kisan alusta` : '';
    rows.push(['Kisa', `${TIME_OF_DAY_NAMES[r.timeOfDay] ?? r.timeOfDay}${race}`]);
  }
  if (r.sky) {
    const wind = r.wind !== undefined ? `, tuuli ${fi(r.wind)} m/s` : '';
    rows.push(['Sää', `${SKY_NAMES[r.sky] ?? r.sky}${wind}`]);
  }
  if (r.lure) rows.push(['Viehe', LURES[r.lure]?.name ?? r.lure]);
  const gear = [
    r.rod && (RODS[r.rod]?.name ?? r.rod),
    r.line && `siima ${LINES[r.line]?.name ?? r.line}`,
    r.leader && 'teräsperuke',
  ].filter(Boolean);
  if (gear.length > 0) rows.push(['Varusteet', gear.join(', ')]);
  rows.push([
    'Paikka',
    r.x !== undefined && r.y !== undefined
      ? (spot ?? 'Tallessa')
      : 'Ei tallessa: saalis on ajalta ennen paikkojen tallennusta',
  ]);
  return rows;
}
