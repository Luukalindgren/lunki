import { parseErrorReport, parseFeedback } from '@lunki/shared';
import { describe, expect, it } from 'vitest';
import { openDatabase } from '../db/open';
import { FeedbackStore } from './store';

describe('FeedbackStore', () => {
  it('säilyttää vain uusimmat palautteet', () => {
    const store = new FeedbackStore(openDatabase(':memory:'), 3);
    for (let i = 1; i <= 5; i++) store.addFeedback({ name: '', text: `p${i}`, context: '' });
    expect(store.feedback().map((f) => f.text)).toEqual(['p5', 'p4', 'p3']);
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
