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
  const lines = top.map((r) => scoreLine(r, r.id === myId));
  const me = results.find((r) => r.id === myId);
  if (me && !top.includes(me)) lines.push('…', scoreLine(me, true));
  return lines;
}

function scoreLine(r: PlayerResult, me: boolean): string {
  const name = r.name.length > 10 ? `${r.name.slice(0, 9)}…` : r.name;
  return `${me ? '>' : ' '}${r.rank}. ${name.padEnd(10)} ${formatWeight(r.summary.score).padStart(7)}`;
}
