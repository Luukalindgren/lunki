import type { DatabaseSync } from 'node:sqlite';
import { RECORDS_PER_SPECIES, type RecordBoard, type RecordEntry } from '@lunki/shared';

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
  }

  /** Tallentaa saaliin ja palauttaa sen sijan lajin listalla (1 = ennätys). */
  add(e: RecordEntry): number {
    const above = this.db
      .prepare(
        'SELECT COUNT(*) AS n FROM catches WHERE difficulty = ? AND species = ? AND weight >= ?',
      )
      .get(e.difficulty, e.species, e.weight) as { n: number };
    this.db
      .prepare(
        'INSERT INTO catches (species, weight, angler, difficulty, date) VALUES (?, ?, ?, ?, ?)',
      )
      .run(e.species, e.weight, e.angler, e.difficulty, e.date);
    return above.n + 1;
  }

  /** Suurimmat kalat vaikeustasoittain ja lajeittain. Tasapelissä aiempi saalis ensin. */
  board(limit = RECORDS_PER_SPECIES): RecordBoard {
    const rows = this.db
      .prepare(
        `SELECT species, weight, angler, difficulty, date FROM (
           SELECT *, ROW_NUMBER() OVER (
             PARTITION BY difficulty, species ORDER BY weight DESC, id ASC
           ) AS place FROM catches
         ) WHERE place <= ? ORDER BY difficulty, species, place`,
      )
      .all(limit) as unknown as RecordEntry[];
    const board: RecordBoard = {};
    for (const r of rows) ((board[r.difficulty] ??= {})[r.species] ??= []).push({ ...r });
    return board;
  }

  close(): void {
    this.db.close();
  }
}
