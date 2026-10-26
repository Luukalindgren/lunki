import { rankPlayers } from '@lunki/shared';
import { describe, expect, it } from 'vitest';
import { scoreboardLines } from './raceScoreboard';

const nobody = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, catches: [] }));

describe('kisan tulostaulu', () => {
  it('oma rivi näkyy, kun kaikki ovat tasoissa ja itse jää kärjen alle (#276)', () => {
    const results = rankPlayers(nobody(7), 'total');
    const lines = scoreboardLines(results, 'p6');
    expect(lines).toHaveLength(7);
    expect(lines[5]).toBe('…');
    expect(lines[6]).toMatch(/^>1\. P6/);
  });

  it('kärjessä olevaa ei toisteta', () => {
    const lines = scoreboardLines(rankPlayers(nobody(7), 'total'), 'p0');
    expect(lines).toHaveLength(5);
    expect(lines[0]).toMatch(/^>1\. P0/);
  });
});
