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

function scoreLine(r: PlayerResult, me: boolean): string {
  const name = r.name.length > 10 ? `${r.name.slice(0, 9)}…` : r.name;
  return `${me ? '>' : ' '}${r.rank}. ${name.padEnd(10)} ${formatWeight(r.summary.score).padStart(7)}`;
}
