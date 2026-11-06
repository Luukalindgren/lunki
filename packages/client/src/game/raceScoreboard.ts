import type { PlayerResult } from '@lunki/shared';
import { formatWeight } from '../i18n';

/** Kisan aikaisen tulostaulun rivejä kärjestä. */
export const SCOREBOARD_TOP = 5;

/**
 * Kisan aikainen tulostaulu: kärki ja oma rivi, vaikka oma sijoitus olisi
 * tasapisteiden takia kärjen numeroissa mutta listassa sen alapuolella (#276).
 */
export function scoreboardLines(results: readonly PlayerResult[], myId: string): string[] {
  const top = results.slice(0, SCOREBOARD_TOP);
  const lines = top.map((r) => scoreLine(r, isMine(r, myId)));
  const me = results.find((r) => isMine(r, myId));
  if (me && !top.includes(me)) lines.push('…', scoreLine(me, true));
  return lines;
}

/** Oma rivi: oma tulos tai oman venekunnan rivi. */
export const isMine = (r: PlayerResult, myId: string) =>
  r.id === myId || (r.members?.some((m) => m.id === myId) ?? false);

/** Nimen leveys tulostaulussa (merkkiä). */
const NAME_WIDTH = 10;

/**
 * Tulostaulun rivi. Ennen ensimmäistä kalaa sija on viiva kuten taukovalikossa
 * (#488, #517): nollien tasapeli ei ole johto. Lähteneen nimen perään tulee
 * lyhyt merkki ×, joka jää näkyviin, vaikka nimi katkeaa.
 */
function scoreLine(r: PlayerResult, me: boolean): string {
  return `${me ? '>' : ' '}${rankLabel(r).padEnd(2)} ${nameField(r)} ${formatWeight(r.summary.score).padStart(7)}`;
}

/**
 * Sija tekstinä: "1." tai saaliittomalle viiva. Sama sääntö kisan taulussa,
 * tulossivulla ja kopioiduissa tuloksissa (#528): nollien tasapeli ei ole sija.
 */
export const rankLabel = (r: PlayerResult): string => (r.summary.count > 0 ? `${r.rank}.` : '–');

function nameField(r: PlayerResult): string {
  // Lähteneen nimessä on tulossivun merkintä "(lähti)": taulussa sen tilalla ×.
  const name = r.left ? r.name.replace(/\s*\([^)]*\)$/, '') : r.name;
  const room = r.left ? NAME_WIDTH - 2 : NAME_WIDTH;
  const short = name.length > room ? `${name.slice(0, room - 1)}…` : name;
  return (r.left ? `${short} ×` : short).padEnd(NAME_WIDTH);
}
