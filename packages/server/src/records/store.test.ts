import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RECORDS_PER_SPECIES, type RecordEntry } from '@lunki/shared';
import { openDatabase } from '../db/open';
import { RecordStore } from './store';

const entry = (weight: number, p: Partial<RecordEntry> = {}): RecordEntry => ({
  species: 'perch',
  weight,
  angler: 'Luuka',
  difficulty: 'normal',
  date: '2026-10-25',
  ...p,
});

describe('ennätykset', () => {
  it('listaa suurimmat lajeittain ja vaikeustasoittain', () => {
    const s = new RecordStore(openDatabase(':memory:'));
    expect(s.add(entry(0.3))).toBe(1);
    expect(s.add(entry(0.5))).toBe(1);
    expect(s.add(entry(0.4))).toBe(2);
    // Tasapaino: aiempi pysyy edellä.
    expect(s.add(entry(0.4, { angler: 'Kaveri' }))).toBe(3);
    s.add(entry(2, { species: 'pike' }));
    s.add(entry(9, { difficulty: 'easy' }));
    for (let i = 0; i < 10; i++) s.add(entry(0.1));
    const b = s.board();
    expect(b.normal?.perch?.map((r) => r.weight)).toEqual([0.5, 0.4, 0.4, 0.3, 0.1]);
    expect(b.normal?.perch?.[1]?.angler).toBe('Luuka');
    expect(b.normal?.perch).toHaveLength(RECORDS_PER_SPECIES);
    expect(b.normal?.pike?.[0]?.weight).toBe(2);
    expect(b.easy?.perch?.[0]?.weight).toBe(9);
    expect(b.realistic).toBeUndefined();
    s.close();
  });

  it('säilyvät tiedostossa uudelleenkäynnistyksen yli', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lunki-'));
    try {
      const path = join(dir, 'data', 'lunki.sqlite');
      const a = new RecordStore(openDatabase(path));
      a.add(entry(1.25, { species: 'zander' }));
      a.close();
      const b = new RecordStore(openDatabase(path));
      expect(b.board().normal?.zander).toEqual([entry(1.25, { species: 'zander' })]);
      b.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('tallentaa saantipaikan, varusteet ja olosuhteet', () => {
    const s = new RecordStore(openDatabase(':memory:'));
    const full = entry(1.5, {
      species: 'pike',
      at: '2026-10-25T17:40:12.000Z',
      x: 120.5,
      y: -40.2,
      raceTime: 312,
      timeOfDay: 'evening',
      sky: 'rain',
      wind: 5.3,
      lure: 'wobbler',
      rod: 'heavy',
      line: 'thick',
      leader: true,
    });
    s.add(full);
    s.add(entry(0.2, { leader: false }));
    const b = s.board();
    expect(b.normal?.pike).toEqual([full]);
    expect(b.normal?.perch?.[0]).toEqual(entry(0.2, { leader: false }));
    s.close();
  });

  it('lisää sarakkeet vanhaan tietokantaan ja säilyttää vanhat saaliit', () => {
    const db = openDatabase(':memory:');
    db.exec(`
      CREATE TABLE catches (
        id INTEGER PRIMARY KEY,
        species TEXT NOT NULL,
        weight REAL NOT NULL,
        angler TEXT NOT NULL,
        difficulty TEXT NOT NULL,
        date TEXT NOT NULL
      );
      INSERT INTO catches (species, weight, angler, difficulty, date)
        VALUES ('perch', 0.7, 'Vanha', 'normal', '2026-10-20');
    `);
    const s = new RecordStore(db);
    s.add(entry(0.5, { x: 1, y: 2 }));
    expect(s.board().normal?.perch).toEqual([
      entry(0.7, { angler: 'Vanha', date: '2026-10-20' }),
      entry(0.5, { x: 1, y: 2 }),
    ]);
    s.close();
  });

  it('yksinpelin lista on erillään moninpelin listasta', () => {
    const s = new RecordStore(openDatabase(':memory:'));
    s.add(entry(0.5));
    expect(s.place(entry(0.4), 'solo')).toBe(1);
    expect(s.add(entry(0.4), 'solo')).toBe(1);
    expect(s.add(entry(0.6), 'solo')).toBe(1);
    expect(s.place(entry(0.45), 'solo')).toBe(2);
    expect(s.board().normal?.perch?.map((r) => r.weight)).toEqual([0.5]);
    expect(s.board(RECORDS_PER_SPECIES, 'solo').normal?.perch?.map((r) => r.weight)).toEqual([
      0.6, 0.4,
    ]);
    s.close();
  });
});
