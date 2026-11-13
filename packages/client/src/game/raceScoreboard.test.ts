import { rankPlayers } from '@lunki/shared';
import { describe, expect, it } from 'vitest';
import {
  CATCH_FLASH_SECONDS,
  CatchFlashes,
  scoreboardLines,
  scoreboardRows,
} from './raceScoreboard';

const nobody = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, catches: [] }));

describe('kisan tulostaulu', () => {
  it('oma rivi näkyy, kun kaikki ovat tasoissa ja itse jää kärjen alle (#276)', () => {
    const results = rankPlayers(nobody(7), 'total');
    const lines = scoreboardLines(results, 'p6');
    expect(lines).toHaveLength(7);
    expect(lines[5]).toBe('…');
    expect(lines[6]).toMatch(/^>– {2}P6/);
  });

  it('kärjessä olevaa ei toisteta', () => {
    const lines = scoreboardLines(rankPlayers(nobody(7), 'total'), 'p0');
    expect(lines).toHaveLength(5);
    expect(lines[0]).toMatch(/^>– {2}P0/);
  });

  it('ennen ensimmäistä kalaa sija on viiva, kalan saaneella numero (#517)', () => {
    const players = nobody(3).map((p, i) =>
      i === 2
        ? { ...p, catches: [{ species: 'perch' as const, name: 'Ahven', weight: 0.2, time: 30 }] }
        : p,
    );
    const lines = scoreboardLines(rankPlayers(players, 'total'), 'p0');
    expect(lines[0]).toMatch(/^ 1\. P2 /);
    expect(lines[1]).toMatch(/^>– {2}P0 /);
    expect(lines[2]).toMatch(/^ – {2}P1 /);
  });

  it('lähtenyt on tasapisteissä viimeisenä ja merkki × näkyy pitkälläkin nimellä (#517)', () => {
    const players = [
      { id: 'a', name: 'Aapo-Ville Virtanen (lähti)', catches: [], left: true },
      { id: 'b', name: 'Bertta', catches: [] },
      { id: 'c', name: 'Cecilia', catches: [] },
    ];
    const lines = scoreboardLines(rankPlayers(players, 'total'), 'b');
    expect(lines.map((l) => l.slice(4, 14))).toEqual(['Bertta    ', 'Cecilia   ', 'Aapo-Vi… ×']);
  });
});

describe('saaliin saaneen rivin korostus (#635)', () => {
  const fish = (weight: number, time: number) => ({
    species: 'pike' as const,
    name: 'Hauki',
    weight,
    time,
  });
  const board = (a: number, b: number) =>
    rankPlayers(
      [
        { id: 'a', name: 'A', catches: Array.from({ length: a }, (_, i) => fish(1 + i, i)) },
        { id: 'b', name: 'B', catches: Array.from({ length: b }, (_, i) => fish(2 + i, i)) },
      ],
      'total',
    );

  it('uusi saalis korostaa rivin kolmeksi sekunniksi', () => {
    const flashes = new CatchFlashes();
    expect(flashes.update(board(0, 0), 'me', 10).size).toBe(0);
    const fresh = flashes.update(board(1, 0), 'me', 11);
    expect([...fresh.keys()]).toEqual(['a']);
    expect(fresh.get('a')?.weight).toBe(1);
    expect(flashes.update(board(1, 0), 'me', 11 + CATCH_FLASH_SECONDS - 0.1).size).toBe(1);
    expect(flashes.update(board(1, 0), 'me', 11 + CATCH_FLASH_SECONDS).size).toBe(0);
  });

  it('ennen liittymistä saadut ja omat saaliit eivät korostu', () => {
    const flashes = new CatchFlashes();
    expect(flashes.update(board(2, 1), 'b', 50).size).toBe(0);
    expect(flashes.update(board(2, 2), 'b', 51).size).toBe(0);
  });

  it('rivit kertovat, kenen tulos niillä on', () => {
    const rows = scoreboardRows(rankPlayers(nobody(7), 'total'), 'p6');
    expect(rows.map((r) => r.id)).toEqual(['p0', 'p1', 'p2', 'p3', 'p4', null, 'p6']);
  });
});
