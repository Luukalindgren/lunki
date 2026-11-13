import { describe, expect, it } from 'vitest';
import { defaultStyle } from './controlStyle';

describe('ohjaustavan oletus', () => {
  const fresh = { off: false, done: [] };

  it('uusi pelaaja saa yksinkertaisen ohjauksen', () => {
    expect(defaultStyle(null, fresh)).toBe('simple');
    expect(defaultStyle(null, { off: false, done: ['move', 'cast'] })).toBe('simple');
  });

  it('tallennettu valinta pysyy', () => {
    expect(defaultStyle('full', fresh)).toBe('full');
    expect(defaultStyle('simple', { off: true, done: ['catch'] })).toBe('simple');
  });

  it('jo kalan saanut tai opastuksen ohittanut jatkaa täydellä', () => {
    expect(defaultStyle(null, { off: false, done: ['move', 'cast', 'reel', 'catch'] })).toBe(
      'full',
    );
    expect(defaultStyle(null, { off: true, done: [] })).toBe('full');
  });
});
