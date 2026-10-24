import { describe, expect, it } from 'vitest';
import { length, sub } from '../vec2';
import type { LakeMap } from './types';
import { WaterBody } from './waterBody';

// 200 × 100 m järvi, jonka keskellä 20 × 20 m saari.
const lake: LakeMap = {
  name: 'testi',
  attribution: '',
  origin: { e: 0, n: 0 },
  shore: [
    { x: -100, y: -50 },
    { x: 100, y: -50 },
    { x: 100, y: 50 },
    { x: -100, y: 50 },
  ],
  islands: [
    [
      { x: -10, y: -10 },
      { x: -10, y: 10 },
      { x: 10, y: 10 },
      { x: 10, y: -10 },
    ],
  ],
  bounds: { minX: -100, minY: -50, maxX: 100, maxY: 50 },
};

describe('WaterBody', () => {
  const water = new WaterBody(lake);

  it('tunnistaa veden, rannan ja saaren', () => {
    expect(water.isWater({ x: 50, y: 0 })).toBe(true);
    expect(water.isWater({ x: 0, y: 0 })).toBe(false);
    expect(water.isWater({ x: 150, y: 0 })).toBe(false);
    expect(water.isWater({ x: -99, y: 49 })).toBe(true);
  });

  it('löytää lähimmän rantapisteen', () => {
    const c = water.closestShorePoint({ x: 50, y: 40 })!;
    expect(c.distance).toBeCloseTo(10);
    expect(c.point).toEqual({ x: 50, y: 50 });
    const far = water.closestShorePoint({ x: 50, y: 0 })!;
    expect(far.distance).toBeCloseTo(40);
  });

  it('ei korjaa vapaassa vedessä olevaa ympyrää', () => {
    expect(water.resolveCircle({ x: 50, y: 0 }, 2)).toBeNull();
  });

  it('työntää rantaan osuvan ympyrän takaisin veteen', () => {
    const hit = water.resolveCircle({ x: 50, y: 49 }, 2)!;
    expect(hit.position.y).toBeCloseTo(48);
    expect(hit.normal).toEqual({ x: 0, y: -1 });
  });

  it('palauttaa maalle joutuneen ympyrän veteen', () => {
    const hit = water.resolveCircle({ x: 0, y: 8 }, 2)!;
    expect(hit.position.y).toBeCloseTo(12);
    expect(water.isWater(hit.position)).toBe(true);
    const outside = water.resolveCircle({ x: 120, y: 0 }, 2)!;
    expect(outside.position.x).toBeCloseTo(98);
    expect(length(sub(outside.position, { x: 98, y: 0 }))).toBeCloseTo(0);
  });
});
