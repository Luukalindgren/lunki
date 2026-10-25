import { parseErrorReport, parseFeedback } from '@lunki/shared';
import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../db/open';
import { FeedbackStore } from './store';

describe('FeedbackStore', () => {
  it('säilyttää vain uusimmat palautteet', () => {
    const store = new FeedbackStore(openDatabase(':memory:'), 3);
    for (let i = 1; i <= 5; i++) store.addFeedback({ name: '', text: `p${i}`, context: '' });
    expect(store.feedback().map((f) => f.text)).toEqual(['p5', 'p4', 'p3']);
  });

  it('viemättömät palautteet vanhimmasta alkaen, viedyt jäävät pois', () => {
    const store = new FeedbackStore(openDatabase(':memory:'));
    for (let i = 1; i <= 3; i++) store.addFeedback({ name: '', text: `p${i}`, context: '' });
    const [first] = store.pending();
    expect(first?.text).toBe('p1');
    expect(store.markExported(first!.id, 158)).toBe(true);
    expect(store.pending().map((f) => f.text)).toEqual(['p2', 'p3']);
    expect(store.markExported(999, 1)).toBe(false);
  });

  it('vanhaan tietokantaan lisätään issue-sarake', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(
      'CREATE TABLE feedback (id INTEGER PRIMARY KEY, name TEXT, text TEXT, context TEXT, at TEXT)',
    );
    db.exec(
      "INSERT INTO feedback (name, text, context, at) VALUES ('', 'vanha', '', '2026-10-25')",
    );
    const store = new FeedbackStore(db);
    expect(store.pending().map((f) => f.text)).toEqual(['vanha']);
    new FeedbackStore(db);
  });

  it('säilyttää vain viimeksi sattuneet virheet', () => {
    const store = new FeedbackStore(openDatabase(':memory:'), 2);
    const err = (message: string, s: number) =>
      store.addError({ message, source: '', stack: '', context: '' }, new Date(s * 1000));
    err('a', 1);
    err('b', 2);
    err('a', 3);
    err('c', 4);
    expect(store.errors().map((e) => e.message)).toEqual(['c', 'a']);
  });
});

describe('palautteen siistiminen', () => {
  it('ohjausmerkit pois, rivinvaihdot jäävät', () => {
    const f = parseFeedback({
      name: 'L\u001b[2Juuka',
      text: 'rivi 1\nrivi 2\u009b31m\r',
      context: '',
    });
    expect(f).toEqual({ name: 'L[2Juuka', text: 'rivi 1\nrivi 231m', context: '' });
    expect(parseErrorReport({ message: '\u001b]0;x\u0007virhe' })?.message).toBe(']0;xvirhe');
  });
});
