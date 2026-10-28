import { formatTime, type Award, type RaceStats, type SpeciesId } from '@lunki/shared';
import { decimal, formatWeight, t, type MsgKey } from '../i18n';
import { speciesName } from '../i18n/names';
import type { LifetimeStats } from '../game/lifetimeStats';
import { AWARD_ICON, awardIcon } from './awardIcons';
import { fishImage, fishSpriteWidth } from './fishArt';

/** Kalan kuvan leveys palkintorivillä (px): jättiläinenkin mahtuu sarakkeeseen. */
const AWARD_FISH_WIDTH = 48;
/** Palkintoja, joissa luku 1 kirjoitetaan omalla lauseellaan ("kävi uimassa"). */
const ONE_TEXT = new Set([
  'pikeDentist',
  'gardener',
  'tangleMaster',
  'swimmer',
  'pilot',
  'lightningRod',
]);

const fishText = (species: SpeciesId, weight: number) =>
  `${speciesName(species).toLowerCase()} ${formatWeight(weight)}`;

/** Matka metreinä tai kilometreinä. */
export const formatDistance = (m: number): string =>
  m < 1000 ? `${Math.round(m)} m` : `${decimal(m / 1000, 1)} km`;

/** Palkinnon selite pelaajan luvulla. */
export function awardDetail(a: Award): string {
  const key = `award.${a.id}` as const;
  if (a.value === 1 && ONE_TEXT.has(a.id)) return t(`${key}.one` as MsgKey);
  const fish = a.fish ? fishText(a.fish.species, a.fish.weight) : '';
  return t(`${key}.detail` as MsgKey, {
    n: a.value,
    fish,
    d: formatDistance(a.value),
    time: formatTime(Math.round(a.value)),
  });
}

/** Kalapalkinnossa kalan kuva, muissa palkinnon ikoni. */
function awardImage(a: Award): HTMLElement {
  const icon = AWARD_ICON[a.id];
  if (icon || !a.fish) return awardIcon(icon ?? 'crown');
  const { species, weight } = a.fish;
  const scale = Math.min(2, AWARD_FISH_WIDTH / fishSpriteWidth(species, weight));
  return fishImage(species, weight, `${scale}px`);
}

/** Palkintolista tulossivulle. `solo`: nimiä ei näytetä (kaikki ovat omia). */
export function awardList(
  awards: readonly Award[],
  opts: { myId: string; solo: boolean },
): HTMLElement {
  if (awards.length === 0) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = t('results.noAwards');
    return p;
  }
  const list = document.createElement('ul');
  list.className = 'award-list';
  for (const a of awards) {
    const li = document.createElement('li');
    li.dataset.award = a.id;
    li.classList.toggle('me', !opts.solo && a.winners.some((w) => w.id === opts.myId));
    const pic = document.createElement('span');
    pic.className = 'award-pic';
    pic.append(awardImage(a));
    const title = document.createElement('span');
    title.className = 'award-title';
    title.textContent = t(`award.${a.id}` as MsgKey);
    const detail = document.createElement('span');
    detail.className = 'award-detail';
    const who = a.winners.map((w) => w.name).join(', ');
    const text = awardDetail(a);
    detail.textContent = opts.solo ? text : `${who} · ${text}`;
    li.append(pic, title, detail);
    list.append(li);
  }
  return list;
}

export interface StatsPlayer {
  id: string;
  name: string;
  stats: RaceStats | null;
  catches: readonly { species: SpeciesId; weight: number }[];
}

type Row = [MsgKey, string, string?];

const pct = (a: number, b: number) => (b > 0 ? `${Math.round((100 * a) / b)} %` : '–');
const lost = (s: RaceStats) =>
  s.biggestLost ? fishText(s.biggestLost.species, s.biggestLost.weight) : '–';
const lightning = (s: RaceStats) =>
  s.closestLightning === null ? '–' : formatDistance(s.closestLightning);
const biggestOf = (catches: StatsPlayer['catches']) =>
  catches.reduce<StatsPlayer['catches'][number] | null>(
    (b, c) => (!b || c.weight > b.weight ? c : b),
    null,
  );

/** Tilastorivit: nimi, tämä kisa ja (omissa) kaikki kisat. */
function statRows(p: StatsPlayer, life: LifetimeStats | null): Row[] {
  const s = p.stats!;
  const l = life?.stats;
  const caught = p.catches.length;
  const big = biggestOf(p.catches);
  const both = (key: MsgKey, now: string, all?: string): Row => [key, now, all];
  const n = (k: keyof RaceStats) => (x: RaceStats | undefined) =>
    x ? String(Math.round(x[k] as number)) : undefined;
  const row = (key: MsgKey, k: keyof RaceStats) => both(key, n(k)(s)!, n(k)(l));
  const avg = (x: RaceStats) => (x.casts ? `${Math.round(x.castMeters / x.casts)} m` : '–');
  return [
    ...(life ? [both('stat.races', '1', String(life.races))] : []),
    both('stat.caught', String(caught), life ? String(life.fish) : undefined),
    both(
      'stat.totalWeight',
      formatWeight(p.catches.reduce((sum, c) => sum + c.weight, 0)),
      life ? formatWeight(life.weight) : undefined,
    ),
    both(
      'stat.biggest',
      big ? fishText(big.species, big.weight) : '–',
      life ? (life.biggest ? fishText(life.biggest.species, life.biggest.weight) : '–') : undefined,
    ),
    both(
      'stat.species',
      String(new Set(p.catches.map((c) => c.species)).size),
      life ? String(life.species.length) : undefined,
    ),
    row('stat.casts', 'casts'),
    both(
      'stat.longestCast',
      `${Math.round(s.longestCast)} m`,
      l && `${Math.round(l.longestCast)} m`,
    ),
    both('stat.averageCast', avg(s), l && avg(l)),
    row('stat.landCasts', 'landCasts'),
    row('stat.strikes', 'strikes'),
    row('stat.hooked', 'hooked'),
    both('stat.catchRate', pct(caught, s.strikes), l && life && pct(life.fish, l.strikes)),
    row('stat.missed', 'missed'),
    row('stat.escaped', 'escaped'),
    row('stat.jumps', 'jumps'),
    both('stat.biggestLost', lost(s), l && lost(l)),
    row('stat.lineBreaks', 'lineBreaks'),
    row('stat.bitOffs', 'bitOffs'),
    row('stat.luresLost', 'luresLost'),
    row('stat.snags', 'snags'),
    row('stat.fouled', 'fouled'),
    row('stat.tangles', 'tangles'),
    row('stat.capsizes', 'capsizes'),
    row('stat.flights', 'flights'),
    row('stat.lightningHits', 'lightningHits'),
    both('stat.closestLightning', lightning(s), l && lightning(l)),
    both('stat.distance', formatDistance(s.distance), l && formatDistance(l.distance)),
    both(
      'stat.idle',
      formatTime(Math.round(s.idleSeconds)),
      l && formatTime(Math.round(l.idleSeconds)),
    ),
  ];
}

/**
 * Tilastotaulukko: tämän kisan luvut ja omissa tilastoissa kaikkien
 * kisojen yhteenveto laitteelta. Ruudukko rivittyy kapealla ruudulla
 * ilman sivuttaisvieritystä.
 */
export function statsTable(p: StatsPlayer, life: LifetimeStats | null): HTMLElement {
  if (!p.stats) {
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = t('results.statsMissing');
    return hint;
  }
  const grid = document.createElement('div');
  grid.className = 'stats-table';
  grid.classList.toggle('with-life', life !== null);
  const cell = (text: string, cls: string) => {
    const c = document.createElement('span');
    c.className = cls;
    c.textContent = text;
    grid.append(c);
  };
  cell('', 'stat-head');
  cell(t('results.thisRace'), 'stat-head');
  if (life) cell(t('results.allRaces'), 'stat-head');
  for (const [key, now, all] of statRows(p, life)) {
    cell(t(key), 'stat-name');
    cell(now, 'stat-value');
    if (life) cell(all ?? '–', 'stat-value');
  }
  return grid;
}
