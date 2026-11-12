import { describe, expect, it } from 'vitest';
import { TangleBook, findTangles, segmentsCross } from './tangle';

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

describe('TangleBook', () => {
  const line = (id: string, x: number, reeling: boolean, crossed = true) => ({
    id,
    // Kaksi siimaa ristissä pisteessä (0, 5), tai rinnakkain.
    tip: { x, y: 0 },
    lure: { x: crossed ? -x : x, y: 10 },
    reeling,
  });

  it('sotkee ristissä olevat siimat, kun jompikumpi kelaa, ja selvittää kelaamalla', () => {
    const book = new TangleBook();
    expect(book.step([line('a', -3, false), line('b', 3, false)], 0, 0.1).started).toHaveLength(0);
    const { started } = book.step([line('a', -3, true), line('b', 3, false)], 0.1, 0.1);
    expect(started).toHaveLength(1);
    expect(book.of('a')?.at.y).toBeCloseTo(5);
    expect(book.of('b')).toBe(book.of('a'));
    // Yksi kelaa: 6 s. Kaksi kelaa: puolet nopeammin.
    let now = 0.1;
    let done = 0;
    for (let i = 0; i < 31 && done === 0; i++) {
      now += 0.1;
      done = book.step([line('a', -3, true), line('b', 3, true)], now, 0.1).untangled.length;
    }
    expect(done).toBe(1);
    expect(now).toBeGreaterThan(2.9);
    expect(book.of('a')).toBeNull();
    // Heti selvityksen jälkeen samat siimat eivät sotkeudu uudelleen.
    expect(book.step([line('a', -3, true), line('b', 3, true)], now + 1, 0.1).started).toHaveLength(
      0,
    );
    expect(book.step([line('a', -3, true), line('b', 3, true)], now + 3, 0.1).started).toHaveLength(
      1,
    );
  });

  it('purkaa sotkun, kun siima katkaistaan tai katoaa', () => {
    const book = new TangleBook();
    book.step([line('a', -3, true), line('b', 3, false)], 0, 0.1);
    expect(book.cut('b', 1)?.a).toBe('a');
    expect(book.active).toHaveLength(0);
    book.step([line('a', -3, true), line('b', 3, false)], 5, 0.1);
    expect(book.active).toHaveLength(1);
    expect(book.step([line('a', -3, true)], 5.1, 0.1).dropped).toHaveLength(1);
    expect(book.active).toHaveLength(0);
  });
});
