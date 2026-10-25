import type { DatabaseSync } from 'node:sqlite';
import type { ErrorReport, FeedbackMessage } from '@lunki/shared';

export interface StoredFeedback extends FeedbackMessage {
  id: number;
  at: string;
}

export interface StoredError extends ErrorReport {
  count: number;
  first: string;
  last: string;
}

/**
 * Testaajien palaute ja selainten virheraportit samassa tietokannassa kuin
 * ennätykset. Sama virhe tallennetaan kerran ja sen toistot lasketaan.
 */
export class FeedbackStore {
  constructor(private readonly db: DatabaseSync) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS feedback (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        text TEXT NOT NULL,
        context TEXT NOT NULL,
        at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS errors (
        message TEXT NOT NULL,
        source TEXT NOT NULL,
        stack TEXT NOT NULL,
        context TEXT NOT NULL,
        count INTEGER NOT NULL,
        first TEXT NOT NULL,
        last TEXT NOT NULL,
        PRIMARY KEY (message, source)
      );
    `);
  }

  addFeedback(f: FeedbackMessage, at = new Date()): void {
    this.db
      .prepare('INSERT INTO feedback (name, text, context, at) VALUES (?, ?, ?, ?)')
      .run(f.name, f.text, f.context, at.toISOString());
  }

  addError(e: ErrorReport, at = new Date()): void {
    const now = at.toISOString();
    this.db
      .prepare(
        `INSERT INTO errors (message, source, stack, context, count, first, last)
         VALUES (?, ?, ?, ?, 1, ?, ?)
         ON CONFLICT (message, source) DO UPDATE SET count = count + 1, last = excluded.last,
           stack = excluded.stack, context = excluded.context`,
      )
      .run(e.message, e.source, e.stack, e.context, now, now);
  }

  feedback(limit = 50): StoredFeedback[] {
    return this.db
      .prepare('SELECT id, name, text, context, at FROM feedback ORDER BY id DESC LIMIT ?')
      .all(limit) as unknown as StoredFeedback[];
  }

  errors(limit = 50): StoredError[] {
    return this.db
      .prepare(
        'SELECT message, source, stack, context, count, first, last FROM errors ORDER BY last DESC LIMIT ?',
      )
      .all(limit) as unknown as StoredError[];
  }
}
