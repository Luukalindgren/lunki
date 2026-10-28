import { describe, expect, it } from 'vitest';
import type { CatchRecord } from './competition';
import { MIN_CATCH_INTERVAL, isPlausibleCatch, rankPlayers, rankTeams } from './scoreboard';

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

describe('venekunnat joukkueina (#263)', () => {
  const players = [
    { id: 'a', name: 'Aino', boat: 1 },
    { id: 'b', name: 'Bertta', boat: 2 },
    { id: 'c', name: 'Cecilia', boat: 1 },
    { id: 'd', name: 'Dora', boat: 0 },
  ];
  const name = (n: number) => `Vene ${n}`;
  const by = (player: string, boat: number) => ({ player, angler: player, boat });

  it('veneen saaliit lasketaan yhteen, renkaalla kukin kisaa itse', () => {
    const r = rankTeams(
      [
        { ...perch(0.4, 10), ...by('a', 1) },
        { ...perch(0.6, 30), ...by('b', 2) },
        { ...perch(0.3, 50), ...by('c', 1) },
        { ...perch(0.65, 60), ...by('d', 0) },
      ],
      players,
      'total',
      name,
    );
    expect(r.map((t) => [t.name, t.rank, t.summary.score])).toEqual([
      ['Vene 1', 1, 0.7],
      ['Dora', 2, 0.65],
      ['Vene 2', 3, 0.6],
    ]);
    expect(r[0]!.members?.map((m) => m.name)).toEqual(['Aino', 'Cecilia']);
    expect(r[1]!.members).toBeUndefined();
  });

  it('lähteneen saalis jää veneelle tai renkaalla hänelle itselleen', () => {
    const r = rankTeams(
      [
        { ...perch(0.5, 10), ...by('x', 3) },
        { ...perch(0.4, 20), player: 'y', angler: 'Ylva', boat: 0 },
      ],
      players,
      'biggest',
      name,
    );
    expect(r.map((t) => t.id)).toEqual(['boat:3', 'y', 'd', 'boat:1', 'boat:2']);
    expect(r[0]!.members).toEqual([]);
    expect(r[1]!.name).toBe('Ylva');
  });
});
