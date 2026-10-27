import { describe, expect, it } from 'vitest';
import { LUNKINJARVI, LUNKINJARVI_SURROUNDINGS } from './lunkinjarvi';
import { LandCover, RingIndex, pointInRing } from './surroundings';
import type { AreaKind, LakeSurroundings } from './types';
import type { Vec2 } from '../vec2';

/** Alkuperäinen hidas haku: jokainen alue testataan erikseen. */
function slowKindAt(s: LakeSurroundings, p: Vec2): AreaKind | null {
  let kind: AreaKind | null = null;
  for (const a of s.areas) {
    if (a.kind === 'building' || !pointInRing(p, a.rings[0]!)) continue;
    if (a.rings.slice(1).some((hole) => pointInRing(p, hole))) continue;
    kind = a.kind;
  }
  return kind;
}

/** Ruudukko maaston alueelta, siirrettynä irti tasaluvuista, ja lisäksi renkaiden kärkipisteet. */
function samples(): Vec2[] {
  const t = LUNKINJARVI_SURROUNDINGS.terrain!;
  const points: Vec2[] = [];
  for (let j = 0; j < t.rows * 2; j++)
    for (let i = 0; i < t.cols * 2; i++)
      points.push({ x: t.minX + i * t.cell * 0.5 + 0.37, y: t.minY + j * t.cell * 0.5 + 0.11 });
  for (const a of LUNKINJARVI_SURROUNDINGS.areas) for (const r of a.rings) points.push(...r);
  points.push(...LUNKINJARVI.shore);
  return points;
}

describe('maankäyttö (#327)', () => {
  it('antaa saman tuloksen kuin alueiden läpikäynti joka pisteessä', () => {
    const cover = new LandCover(LUNKINJARVI_SURROUNDINGS);
    const points = samples();
    let differences = 0;
    const kinds = new Set<AreaKind | null>();
    for (const p of points) {
      const kind = cover.kindAt(p);
      kinds.add(kind);
      if (kind !== slowKindAt(LUNKINJARVI_SURROUNDINGS, p)) differences++;
    }
    expect(differences).toBe(0);
    // Testi kattaa useita maankäyttöluokkia.
    expect(kinds.size).toBeGreaterThan(3);
  });

  it('ottaa reiän huomioon ja pienin alue voittaa', () => {
    const square = (x0: number, y0: number, size: number): Vec2[] => [
      { x: x0, y: y0 },
      { x: x0 + size, y: y0 },
      { x: x0 + size, y: y0 + size },
      { x: x0, y: y0 + size },
    ];
    const s: LakeSurroundings = {
      attribution: [],
      lines: [],
      terrain: null,
      areas: [
        { kind: 'forest', rings: [square(0, 0, 100), square(10, 10, 20)] },
        { kind: 'field', rings: [square(50, 50, 20)] },
        { kind: 'building', rings: [square(55, 55, 5)] },
      ],
    };
    const cover = new LandCover(s);
    expect(cover.kindAt({ x: 5, y: 5 })).toBe('forest');
    expect(cover.kindAt({ x: 15, y: 15 })).toBeNull();
    expect(cover.kindAt({ x: 60, y: 60 })).toBe('field');
    expect(cover.kindAt({ x: 57, y: 57 })).toBe('field');
    expect(cover.kindAt({ x: 150, y: 5 })).toBeNull();
  });
});

describe('RingIndex', () => {
  it('löytää samat renkaat kuin pointInRing', () => {
    const rings = [LUNKINJARVI.shore, ...LUNKINJARVI.islands];
    const index = new RingIndex(rings);
    for (const p of samples()) {
      const expected = rings.flatMap((r, i) => (pointInRing(p, r) ? [i] : []));
      expect([...index.containing(p)]).toEqual(expected);
    }
  });
});
