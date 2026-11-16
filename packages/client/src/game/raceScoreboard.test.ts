import { rankPlayers } from '@lunki/shared';
import { describe, expect, it } from 'vitest';
import { lineParts } from '../ui/columns';
import {
  CATCH_FLASH_SECONDS,
  CatchFlashes,
  scoreboardHead,
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

describe('tulostaulun sijasarake (#739)', () => {
  const fish = (weight: number) => ({ species: 'perch' as const, name: 'Ahven', weight, time: 30 });
  const anglers = (n: number) =>
    rankPlayers(
      nobody(n).map((p, i) => ({ ...p, catches: i < n - 1 ? [fish(n - i)] : [] })),
      'total',
    );

  it('sijasta 10 alkaen rivit ovat yhtä pitkiä ja nimet samassa sarakkeessa', () => {
    const lines = scoreboardLines(anglers(12), 'p10', Infinity);
    expect(lines).toHaveLength(12);
    expect(new Set(lines.map((l) => l.length)).size).toBe(1);
    expect(lines[0]).toMatch(/^ {2}1\. P0 /);
    expect(lines[8]).toMatch(/^ {2}9\. P8 /);
    expect(lines[9]).toMatch(/^ 10\. P9 /);
    expect(lines[10]).toMatch(/^>11\. P10 /);
    // Saaliittoman viiva on ykkösten kohdalla.
    expect(lines[11]).toMatch(/^ {2}– {2}P11 /);
  });

  it('sarake levenee vain, kun kaksinumeroinen sija on näkyvissä', () => {
    // Kärki ja oma rivi sijalla 11: leveä sarake.
    const mine = scoreboardLines(anglers(12), 'p10');
    expect(mine[0]).toMatch(/^ {2}1\. P0 /);
    expect(mine[6]).toMatch(/^>11\. P10 /);
    // Pelkkä kärki: kaksi merkkiä kuten ennenkin.
    const top = scoreboardLines(anglers(12), 'p0');
    expect(top[0]).toMatch(/^>1\. P0 /);
  });

  it('oman rivin merkki ja sija ovat omat sarakkeensa, sija oikealle tasattuna', () => {
    const row = scoreboardRows(anglers(12), 'p9', Infinity)[9]!;
    expect(row.columns.slice(0, 2)).toEqual([{ text: '>' }, { text: '10.', right: true }]);
    expect(
      lineParts(row)
        .map((p) => p.text)
        .join(''),
    ).toBe(row.text);
  });

  it('yli kymmenen kilon paino ei työnnä riviä muita pidemmäksi', () => {
    const lines = scoreboardLines(anglers(12), 'p0', Infinity);
    expect(lines[0]).toMatch(/ 12,00 kg$/);
    expect(lines[3]).toMatch(/ {2}9,00 kg$/);
    expect(lines[11]).toMatch(/ {5}0 g$/);
    // Alle kymmenen kilon taulu on entisen levyinen.
    const small = scoreboardLines(anglers(5), 'p0');
    expect(small[0]).toBe('>1. P0         5,00 kg');
  });
});

describe('koko tulostaulu (#743)', () => {
  const fish = (weight: number) => ({ species: 'perch' as const, name: 'Ahven', weight, time: 30 });
  const players = rankPlayers(
    [
      { id: 'a', name: 'Muikku-Mauri', catches: [fish(2), fish(1)] },
      { id: 'b', name: 'Bo', catches: [fish(1.5)] },
      { id: 'c', name: 'Aapo-Ville Virtanen', catches: [] },
    ],
    'total',
  );
  const labels = { count: 'kalat', score: 'paino' };

  it('nimet ovat kokonaan (enintään 14 merkkiä) ja rivillä on kalojen määrä', () => {
    const lines = scoreboardLines(players, 'b', Infinity, true);
    expect(lines[0]).toBe(' 1. Muikku-Mauri       2  3,00 kg');
    expect(lines[1]).toBe('>2. Bo                 1  1,50 kg');
    expect(lines[2]).toBe(' –  Aapo-Ville Vi…     0      0 g');
  });

  it('otsikko on samoissa sarakkeissa kuin rivit', () => {
    const rows = scoreboardRows(players, 'b', Infinity, true);
    const head = scoreboardHead('Tulostaulu', rows, labels);
    expect(typeof head).toBe('object');
    const text = typeof head === 'string' ? head : head.text;
    expect(text).toBe('Tulostaulu         kalat    paino');
    expect(text.length).toBe(rows[0]!.text.length);
  });

  it('pieni taulu on ennallaan ja sen otsikko on pelkkä teksti', () => {
    const rows = scoreboardRows(players, 'b');
    expect(rows[0]!.text).toBe(' 1. Muikku-Ma… 3,00 kg');
    expect(scoreboardHead('Tulostaulu', rows, labels)).toBe('Tulostaulu');
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

  it('koko taulussa ovat kaikki ilman väliviivaa (#735)', () => {
    const rows = scoreboardRows(rankPlayers(nobody(12), 'total'), 'p6', Infinity);
    expect(rows).toHaveLength(12);
    expect(rows.every((r) => r.id !== null)).toBe(true);
  });
});
