import { describe, expect, it } from 'vitest';
import type { CatchRecord } from './competition';
import { MIN_CATCH_INTERVAL, isPlausibleCatch, rankPlayers } from './scoreboard';

const perch = (weight: number, time: number): CatchRecord => ({
  species: 'perch',
  name: 'Ahven',
  weight,
  time,
});

const players = [
  { id: 'a', name: 'Aino', catches: [perch(0.2, 10), perch(0.3, 50)] },
  { id: 'b', name: 'Bertta', catches: [perch(0.6, 100)] },
  { id: 'c', name: 'Cecilia', catches: [] },
  { id: 'd', name: 'Daniel', catches: [perch(0.5, 20)] },
];

describe('tulostaulu', () => {
  it('yhteispaino', () => {
    const r = rankPlayers(players, 'total');
    expect(r.map((p) => p.id)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('tasapisteissä aiemmin saavuttanut edellä', () => {
    const r = rankPlayers(
      [
        { id: 'x', name: 'X', catches: [perch(0.2, 10), perch(0.3, 50)] },
        { id: 'y', name: 'Y', catches: [perch(0.5, 20)] },
      ],
      'total',
    );
    expect(r.map((p) => [p.id, p.rank])).toEqual([
      ['y', 1],
      ['x', 2],
    ]);
  });

  it('suurin kala', () => {
    const r = rankPlayers(players, 'biggest');
    expect(r.map((p) => [p.id, p.rank])).toEqual([
      ['b', 1],
      ['d', 2],
      ['a', 3],
      ['c', 4],
    ]);
  });

  it('nollatulokset jakavat sijan', () => {
    const r = rankPlayers(
      [
        { id: 'x', name: 'X', catches: [] },
        { id: 'y', name: 'Y', catches: [] },
      ],
      'total',
    );
    expect(r.map((p) => p.rank)).toEqual([1, 1]);
  });
});

describe('saaliin tarkistus', () => {
  const ok = { splashedSinceLastCatch: true, now: 100, lastCatchAt: 0 };
  it('hyväksyy järkevän', () => {
    expect(isPlausibleCatch({ species: 'perch', name: 'Ahven', weight: 0.3 }, ok)).toBe(true);
  });
  it('hylkää väärän lajin, painon tai tahdin', () => {
    expect(isPlausibleCatch({ species: 'whale' as 'perch', name: 'x', weight: 0.3 }, ok)).toBe(
      false,
    );
    expect(isPlausibleCatch({ species: 'perch', name: 'Ahven', weight: 5 }, ok)).toBe(false);
    expect(isPlausibleCatch({ species: 'perch', name: 'Ahven', weight: NaN }, ok)).toBe(false);
    expect(
      isPlausibleCatch(
        { species: 'perch', name: 'Ahven', weight: 0.3 },
        { ...ok, splashedSinceLastCatch: false },
      ),
    ).toBe(false);
    expect(
      isPlausibleCatch(
        { species: 'perch', name: 'Ahven', weight: 0.3 },
        { ...ok, lastCatchAt: 100 - MIN_CATCH_INTERVAL / 2 },
      ),
    ).toBe(false);
    expect(isPlausibleCatch(null, ok)).toBe(false);
  });
  it('hylkää lajin, jota huoneen järvessä ei ole', () => {
    const pike = { species: 'pike' as const, name: 'Hauki', weight: 2 };
    expect(isPlausibleCatch(pike, { ...ok, species: ['perch', 'pike'] })).toBe(true);
    expect(isPlausibleCatch(pike, { ...ok, species: ['perch'] })).toBe(false);
  });
});
