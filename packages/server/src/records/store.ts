import type { DatabaseSync } from 'node:sqlite';
import {
  parseAppearance,
  RECORDS_PER_SPECIES,
  type RecordBoard,
  type RecordEntry,
  type RecordMode,
} from '@lunki/shared';

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
  ['method', 'method', 'TEXT'],
  ['fly', 'fly', 'TEXT'],
  ['flyRod', 'fly_rod', 'TEXT'],
  ['flyLine', 'fly_line', 'TEXT'],
  ['flyLeader', 'fly_leader', 'TEXT'],
  ['appearance', 'appearance', 'TEXT'],
] as const satisfies readonly (readonly [keyof RecordEntry, string, string])[];

type Row = Record<string, string | number | null>;

/** Ulkonäkö tallennetaan JSON-tekstinä; rikkinäinen arvo jää pois. */
function readAppearance(v: string | number): RecordEntry['appearance'] {
  try {
    return parseAppearance(JSON.parse(String(v))) ?? undefined;
  } catch {
    return undefined;
  }
}

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
    if (v === null || v === undefined) continue;
    if (key === 'appearance') {
      const look = readAppearance(v);
      if (look) e.appearance = look;
    } else e[key] = key === 'leader' ? v === 1 : v;
  }
  return e as unknown as RecordEntry;
}

/**
 * Ennätykset SQLite-tiedostossa pelikoneella. Kaikki punnitut saaliit
 * tallennetaan; listat lasketaan kyselyllä, joten rajaa voi muuttaa myöhemmin.
 * Moninpelin (race) ja yksinpelin (solo) listat ovat erilliset.
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
    // Yksinpelin lista tuli myöhemmin: vanhat rivit ovat moninpelin saaliita.
    if (!columns.has('mode'))
      db.exec("ALTER TABLE catches ADD COLUMN mode TEXT NOT NULL DEFAULT 'race'");
    db.exec(
      'CREATE INDEX IF NOT EXISTS catches_mode_board ON catches (mode, difficulty, species, weight DESC)',
    );
  }

  /** Sija, jolle saalis tulisi lajin listalla (1 = ennätys); tasapainossa aiempi edellä. */
  place(e: RecordEntry, mode: RecordMode = 'race'): number {
    const above = this.db
      .prepare(
        'SELECT COUNT(*) AS n FROM catches WHERE mode = ? AND difficulty = ? AND species = ? AND weight >= ?',
      )
      .get(mode, e.difficulty, e.species, e.weight) as { n: number };
    return above.n + 1;
  }

  /** Tallentaa saaliin ja palauttaa sen sijan lajin listalla (1 = ennätys). */
  add(e: RecordEntry, mode: RecordMode = 'race'): number {
    const place = this.place(e, mode);
    const cols = DETAILS.map(([, col]) => col);
    const details = DETAILS.map(([key]) => {
      const v = e[key];
      if (v === undefined) return null;
      if (typeof v === 'object') return JSON.stringify(v);
      return typeof v === 'boolean' ? Number(v) : v;
    });
    this.db
      .prepare(
        `INSERT INTO catches (mode, species, weight, angler, difficulty, date, ${cols.join(', ')})
         VALUES (?, ?, ?, ?, ?, ?, ${cols.map(() => '?').join(', ')})`,
      )
      .run(mode, e.species, e.weight, e.angler, e.difficulty, e.date, ...details);
    return place;
  }

  /** Suurimmat kalat vaikeustasoittain ja lajeittain. Tasapelissä aiempi saalis ensin. */
  board(limit = RECORDS_PER_SPECIES, mode: RecordMode = 'race'): RecordBoard {
    const rows = this.db
      .prepare(
        `SELECT * FROM (
           SELECT *, ROW_NUMBER() OVER (
             PARTITION BY difficulty, species ORDER BY weight DESC, id ASC
           ) AS place FROM catches WHERE mode = ?
         ) WHERE place <= ? ORDER BY difficulty, species, place`,
      )
      .all(mode, limit) as Row[];
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
