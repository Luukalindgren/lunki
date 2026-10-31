import { describe, expect, it } from 'vitest';
import { AWARD_IDS, raceAwards, type AwardEntrant } from './awards';
import { emptyRaceStats, type RaceStats } from './raceStats';

const entrant = (
  id: string,
  stats: Partial<RaceStats> | null,
  catches: AwardEntrant['catches'] = [],
): AwardEntrant => ({
  id,
  name: id.toUpperCase(),
  catches,
  stats: stats ? { ...emptyRaceStats(), ...stats } : null,
});
const ids = (awards: ReturnType<typeof raceAwards>) => awards.map((a) => a.id);
const award = (awards: ReturnType<typeof raceAwards>, id: string) =>
  awards.find((a) => a.id === id);

describe('kisan palkinnot (#367)', () => {
  it('nollatulokset eivät saa palkintoa', () => {
    expect(raceAwards([entrant('a', {}), entrant('b', {})])).toEqual([]);
  });

  it('suurin, ensimmäinen ja pienin kala sekä lajikuningas', () => {
    const awards = raceAwards([
      entrant('a', {}, [
        { species: 'perch', weight: 0.3, time: 50 },
        { species: 'pike', weight: 2.5, time: 400 },
      ]),
      entrant('b', {}, [{ species: 'roach', weight: 0.1, time: 20 }]),
    ]);
    expect(award(awards, 'biggest')).toMatchObject({
      winners: [{ id: 'a', name: 'A' }],
      value: 2.5,
      fish: { species: 'pike', weight: 2.5 },
    });
    expect(award(awards, 'first')).toMatchObject({
      winners: [{ id: 'b' }],
      value: 20,
      fish: { species: 'roach', weight: 0.1 },
    });
    expect(award(awards, 'speciesKing')).toMatchObject({ winners: [{ id: 'a' }], value: 2 });
    // Yhden kalan saaliissa pienin olisi myös suurin: B ei ole mukana.
    expect(award(awards, 'smallest')).toMatchObject({ winners: [{ id: 'a' }], value: 0.3 });
  });

  it('tasapelissä palkinto jaetaan', () => {
    const awards = raceAwards([
      entrant('a', { capsizes: 2 }),
      entrant('b', { capsizes: 2 }),
      entrant('c', { capsizes: 1 }),
    ]);
    expect(award(awards, 'swimmer')?.winners.map((w) => w.id)).toEqual(['a', 'b']);
  });

  it('rajat: lyhyt heitto tai pari heittoa ei riitä palkintoon', () => {
    expect(ids(raceAwards([entrant('a', { longestCast: 12, casts: 5 })]))).toEqual([]);
    expect(ids(raceAwards([entrant('a', { longestCast: 31.6, casts: 15 })]))).toEqual([
      'longestCast',
      'busiest',
      'fishFriend',
    ]);
    expect(award(raceAwards([entrant('a', { longestCast: 31.6 })]), 'longestCast')?.value).toBe(32);
  });

  it('läheltä piti vain ilman osumaa, ja lähin voittaa', () => {
    const awards = raceAwards([
      entrant('a', { closestLightning: 60 }),
      entrant('b', { closestLightning: 30 }),
      entrant('c', { closestLightning: 0, lightningHits: 1 }),
    ]);
    expect(award(awards, 'closeCall')).toMatchObject({ winners: [{ id: 'b' }], value: 30 });
    expect(award(awards, 'lightningRod')).toMatchObject({ winners: [{ id: 'c' }] });
  });

  it('kalojen ystävä on jokainen kalaton ahkera heittäjä', () => {
    const fish = [{ species: 'perch' as const, weight: 0.2, time: 1 }];
    const awards = raceAwards([
      entrant('a', { casts: 12 }),
      entrant('b', { casts: 30 }),
      entrant('c', { casts: 40 }, fish),
      entrant('d', { casts: 4 }),
    ]);
    expect(award(awards, 'fishFriend')?.winners.map((w) => w.id)).toEqual(['a', 'b']);
  });

  it('täyttökisan nopein täyttäjä (#458): pienin aika, vesiltä alkanut ei mukana', () => {
    const awards = raceAwards([
      entrant('a', { inflateTime: 41.5 }),
      entrant('b', { inflateTime: 33 }),
      entrant('c', {}),
    ]);
    expect(award(awards, 'fastInflater')).toMatchObject({ value: 33, winners: [{ id: 'b' }] });
    expect(ids(raceAwards([entrant('a', {})]))).not.toContain('fastInflater');
  });

  it('ilman tilastoja (vanha palvelin) jaetaan vain kalapalkinnot', () => {
    const awards = raceAwards([
      entrant('a', null, [{ species: 'pike', weight: 1, time: 5 }]),
      entrant('b', { capsizes: 1 }),
    ]);
    expect(ids(awards)).toEqual(['biggest', 'first', 'swimmer']);
  });

  it('karannut jättiläinen ja tarkka-ampuja', () => {
    const fish = [
      { species: 'perch' as const, weight: 0.2, time: 1 },
      { species: 'perch' as const, weight: 0.3, time: 2 },
    ];
    const awards = raceAwards([
      entrant('a', { casts: 4, biggestLost: { species: 'pike', weight: 4.4 } }, fish),
      entrant('b', { casts: 8 }, fish),
    ]);
    expect(award(awards, 'theOneThatGotAway')).toMatchObject({
      value: 4.4,
      fish: { species: 'pike', weight: 4.4 },
    });
    expect(award(awards, 'sharpshooter')).toMatchObject({ winners: [{ id: 'a' }], value: 50 });
  });

  it('palkinnot tulevat näyttöjärjestyksessä', () => {
    const awards = raceAwards([
      entrant('a', { capsizes: 1, tangles: 1, snags: 3 }, [
        { species: 'perch', weight: 0.2, time: 1 },
      ]),
    ]);
    const order = ids(awards).map((id) => AWARD_IDS.indexOf(id));
    expect(order).toEqual([...order].sort((x, y) => x - y));
  });
});
