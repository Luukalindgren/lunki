import { describe, expect, it } from 'vitest';
import { QUIET_CASTS, QuietSpot } from './quietSpot';

const here = { x: 0, y: 0 };

/** Heittää kerran samalta paikalta ja kelaa tyhjänä takaisin. */
function emptyCast(q: QuietSpot, pos = here): boolean {
  q.cast(pos);
  return q.home();
}

describe('hiljainen paikka', () => {
  it('vinkkaa kerran, kun heitot menevät tyhjiin', () => {
    const q = new QuietSpot();
    const told = Array.from({ length: QUIET_CASTS + 3 }, () => emptyCast(q));
    expect(told.indexOf(true)).toBe(QUIET_CASTS - 1);
    expect(told.filter(Boolean)).toHaveLength(1);
  });

  it('kiinnostunut kala nollaa laskurin', () => {
    const q = new QuietSpot();
    emptyCast(q);
    emptyCast(q);
    q.cast(here);
    q.noticed();
    expect(q.home()).toBe(false);
    expect(emptyCast(q)).toBe(false);
    expect(emptyCast(q)).toBe(false);
    expect(emptyCast(q)).toBe(true);
  });

  it('uudella paikalla lasketaan alusta ja vinkataan uudelleen', () => {
    const q = new QuietSpot();
    for (let i = 0; i < QUIET_CASTS; i++) emptyCast(q);
    const there = { x: 100, y: 0 };
    expect(emptyCast(q, there)).toBe(false);
    expect(emptyCast(q, { x: 110, y: 10 })).toBe(false);
    expect(emptyCast(q, there)).toBe(true);
  });
});
