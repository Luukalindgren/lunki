import type { DatabaseSync } from 'node:sqlite';
import { RECORDS_PER_SPECIES, type RecordBoard, type RecordEntry } from '@lunki/shared';

/** Saaliin lisätiedot: RecordEntryn kenttä ja sarake, johon se tallennetaan. */
const DETAILS = [
  ['at', 'at', 'TEXT'],
  ['x', 'x', 'REAL'],
  ['y', 'y', 'REAL'],
  ['raceTime', 'race_time', 'REAL'],
  ['timeOfDay', 'time_of_day', 'TEXT'],
  ['sky', 'sky', 'TEXT'],
  ['wind', 'wind', 'REAL'],
  ['lure', 'lure', 'TEXT'],
  ['rod', 'rod', 'TEXT'],
  ['line', 'line', 'TEXT'],
  ['leader', 'leader', 'INTEGER'],
] as const satisfies readonly (readonly [keyof RecordEntry, string, string])[];

type Row = Record<string, string | number | null>;

/** Tietokannan rivi merkinnäksi: puuttuvat lisätiedot jäävät pois. */
function toEntry(r: Row): RecordEntry {
  const e: Record<string, unknown> = {
    species: r.species,
    weight: r.weight,
    angler: r.angler,
    difficulty: r.difficulty,
    date: r.date,
  };
  for (const [key, col] of DETAILS) {
    const v = r[col];
    if (v !== null && v !== undefined) e[key] = key === 'leader' ? v === 1 : v;
  }
  return e as unknown as RecordEntry;
}

/**
 * Ennätykset SQLite-tiedostossa pelikoneella. Kaikki punnitut saaliit
 * tallennetaan; listat lasketaan kyselyllä, joten rajaa voi muuttaa myöhemmin.
 */
export class RecordStore {
  private readonly db: DatabaseSync;

  /** `db` on yhteinen palvelimen tietokanta, ks. openDatabase. */
  constructor(db: DatabaseSync) {
    this.db = db;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS catches (
        id INTEGER PRIMARY KEY,
        species TEXT NOT NULL,
        weight REAL NOT NULL,
        angler TEXT NOT NULL,
        difficulty TEXT NOT NULL,
        date TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS catches_board ON catches (difficulty, species, weight DESC);
    `);
    // Lisätiedot tulivat myöhemmin: vanha tiedosto saa puuttuvat sarakkeet.
    const columns = new Set(
      (db.prepare('PRAGMA table_info(catches)').all() as { name: string }[]).map((c) => c.name),
    );
    for (const [, col, type] of DETAILS)
      if (!columns.has(col)) db.exec(`ALTER TABLE catches ADD COLUMN ${col} ${type}`);
  }

  /** Tallentaa saaliin ja palauttaa sen sijan lajin listalla (1 = ennätys). */
  add(e: RecordEntry): number {
    const above = this.db
      .prepare(
        'SELECT COUNT(*) AS n FROM catches WHERE difficulty = ? AND species = ? AND weight >= ?',
      )
      .get(e.difficulty, e.species, e.weight) as { n: number };
    const cols = DETAILS.map(([, col]) => col);
    const details = DETAILS.map(([key]) => {
      const v = e[key];
      return v === undefined ? null : typeof v === 'boolean' ? Number(v) : v;
    });
    this.db
      .prepare(
        `INSERT INTO catches (species, weight, angler, difficulty, date, ${cols.join(', ')})
         VALUES (?, ?, ?, ?, ?, ${cols.map(() => '?').join(', ')})`,
      )
      .run(e.species, e.weight, e.angler, e.difficulty, e.date, ...details);
    return above.n + 1;
  }

  /** Suurimmat kalat vaikeustasoittain ja lajeittain. Tasapelissä aiempi saalis ensin. */
  board(limit = RECORDS_PER_SPECIES): RecordBoard {
    const rows = this.db
      .prepare(
        `SELECT * FROM (
           SELECT *, ROW_NUMBER() OVER (
             PARTITION BY difficulty, species ORDER BY weight DESC, id ASC
           ) AS place FROM catches
         ) WHERE place <= ? ORDER BY difficulty, species, place`,
      )
      .all(limit) as Row[];
    const board: RecordBoard = {};
    for (const row of rows) {
      const r = toEntry(row);
      ((board[r.difficulty] ??= {})[r.species] ??= []).push(r);
    }
    return board;
  }

  close(): void {
    this.db.close();
  }
}
