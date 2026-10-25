import { describe, expect, it } from 'vitest';
import { findTangles, segmentsCross } from './tangle';

describe('siimojen sotkeutuminen', () => {
  it('ristissä olevat janat leikkaavat', () => {
    expect(
      segmentsCross({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 }),
    ).toEqual({ x: 5, y: 5 });
    // Rinnakkaiset ja toisistaan erillään olevat eivät.
    expect(
      segmentsCross({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 1 }, { x: 10, y: 1 }),
    ).toBeNull();
    expect(
      segmentsCross({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 5, y: 0 }, { x: 4, y: 1 }),
    ).toBeNull();
    // Pelkkä päätepisteen kosketus ei riitä.
    expect(
      segmentsCross({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }),
    ).toBeNull();
  });

  const line = (id: string, x1: number, y1: number, x2: number, y2: number, reeling: boolean) => ({
    id,
    tip: { x: x1, y: y1 },
    lure: { x: x2, y: y2 },
    reeling,
  });

  it('sotkeutuu vain, kun jompikumpi kelaa', () => {
    const a = line('a', 0, 0, 20, 20, false);
    const b = line('b', 0, 20, 20, 0, false);
    expect(findTangles([a, b])).toEqual([]);
    expect(findTangles([a, { ...b, reeling: true }])).toEqual([
      { a: 'a', b: 'b', at: { x: 10, y: 10 } },
    ]);
  });

  it('kukin siima sotkeutuu vain yhteen kerrallaan', () => {
    const tangles = findTangles([
      line('a', 0, 0, 20, 20, true),
      line('b', 0, 20, 20, 0, true),
      line('c', 0, 10, 20, 10, true),
    ]);
    expect(tangles).toHaveLength(1);
  });
});
