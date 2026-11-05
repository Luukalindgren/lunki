import { rankPlayers } from '@lunki/shared';
import { describe, expect, it } from 'vitest';
import { setLangForTest } from '../i18n';
import { resultsText } from './resultsText';

describe('tulokset tekstinä (#507)', () => {
  it('otsikko päivämäärineen, säännöt ja sijoitukset rivi riviltä', () => {
    setLangForTest('fi');
    const results = rankPlayers(
      [
        {
          id: 'a',
          name: 'Antti',
          catches: [{ species: 'perch', name: 'x', weight: 0.41, time: 9 }],
        },
        {
          id: 'b',
          name: 'Bertta',
          catches: [
            { species: 'pike', name: 'x', weight: 1.2, time: 5 },
            { species: 'perch', name: 'x', weight: 0.3, time: 7 },
          ],
        },
        { id: 'c', name: 'Cecilia (lähti)', catches: [], left: true },
      ],
      'total',
    );
    const text = resultsText(
      results,
      { winRule: 'total', difficulty: 'normal', durationMinutes: 15 },
      new Date(2026, 10, 11, 19, 5),
    );
    expect(text.split('\n')).toEqual([
      'Lunkinjärvi, kisan tulokset 11.11.2026 klo 19.05',
      expect.stringContaining('15 min'),
      '',
      '1. Bertta 1,50 kg (2 kpl, suurin 1,20 kg)',
      '2. Antti 410 g (1 kpl, suurin 410 g)',
      '3. Cecilia (lähti) 0 g (0 kpl)',
    ]);
  });
});
