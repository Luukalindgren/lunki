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
});
