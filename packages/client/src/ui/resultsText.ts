import { isBotId, type PlayerResult, type RoomSettings } from '@lunki/shared';
import { formatClock, formatDay, formatWeight, t } from '../i18n';
import { difficultyName, lengthText, winRuleName } from '../i18n/names';
import { rankLabel } from '../game/raceScoreboard';

/** Tulossivun lista tiivistyy, kun kalastajia on tätä enemmän (#507). */
export const COMPACT_RESULTS_OVER = 6;

/**
 * Tulosrivin nimi ja rivin loppuun tulevat merkinnät. Botin (#624) ja kesken
 * kisan lähteneen (#506) merkintä on nimessä sulkeissa ("Kuha-Kalle (botti)
 * (lähti)"); rivillä ne siirretään loppuun ("· botti · lähti"), etteivät ne
 * katkea nimen lyhennykseen (#631).
 */
export function resultRowName(r: Pick<PlayerResult, 'id' | 'name' | 'left'>): {
  name: string;
  tags: string[];
} {
  let name = r.name;
  const tags: string[] = [];
  const leftSuffix = t('results.left', { name: '' });
  if (r.left && name.endsWith(leftSuffix)) {
    name = name.slice(0, -leftSuffix.length);
    tags.push(t('results.leftTag'));
  }
  const botSuffix = t('results.bot', { name: '' });
  if (isBotId(r.id) && name.endsWith(botSuffix)) {
    name = name.slice(0, -botSuffix.length);
    tags.unshift(t('results.botTag'));
  }
  return { name, tags };
}

/** Kisan säännöt yhdellä rivillä: voittoehto, vaikeustaso ja kesto. */
export function rulesLine(s: Pick<RoomSettings, 'winRule' | 'difficulty' | 'durationMinutes'>) {
  return `${winRuleName(s.winRule)} · ${difficultyName(s.difficulty)} · ${t('common.minutes', { n: s.durationMinutes })}`;
}

/**
 * Kisan tulokset tekstinä leikepöydälle (#507): otsikko päivämäärineen,
 * säännöt ja sijoitukset rivi riviltä, esim. "1. Antti 895 g (5 kpl, suurin
 * 410 g)". Saaliittoman sija on viiva (#528). LAN-illan järjestäjä kirjaa näistä useamman kisan tulokset.
 */
export function resultsText(
  results: readonly PlayerResult[],
  settings: Pick<RoomSettings, 'winRule' | 'difficulty' | 'durationMinutes'>,
  now: Date,
): string {
  const when = `${formatDay(now.getDate(), now.getMonth() + 1, now.getFullYear())} ${formatClock(now.getHours(), now.getMinutes())}`;
  const rows = results.map((r) => {
    const crew = r.members?.length ? ` (${r.members.map((m) => m.name).join(', ')})` : '';
    const big = r.summary.biggest;
    return t('results.copyRow', {
      rank: rankLabel(r),
      name: `${r.name}${crew}`,
      total: formatWeight(r.summary.total),
      count: r.summary.count,
      biggest: big
        ? t('results.copyBiggest', {
            weight: formatWeight(big.weight),
            length: lengthText(big.species, big.weight),
          })
        : '',
    });
  });
  return [t('results.copyTitle', { when }), rulesLine(settings), '', ...rows].join('\n');
}
