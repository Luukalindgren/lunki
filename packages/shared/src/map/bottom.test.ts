import { describe, expect, it } from 'vitest';
import { distance } from '../vec2';
import { LakeBottom, type BottomFeature } from './bottom';
import { LUNKINJARVI, LUNKINJARVI_BOTTOM } from './lunkinjarvi';
import type { LakeMap } from './types';
import { WaterBody } from './waterBody';

/** 400 × 400 m neliöjärvi. */
const square: LakeMap = {
  name: 'Neliö',
  attribution: '',
  origin: { e: 0, n: 0 },
  shore: [
    { x: -200, y: -200 },
    { x: 200, y: -200 },
    { x: 200, y: 200 },
    { x: -200, y: 200 },
  ],
  islands: [],
  bounds: { minX: -200, minY: -200, maxX: 200, maxY: 200 },
};
const water = new WaterBody(square);
const make = (features: BottomFeature[] = [], maxDepth = 8) =>
  new LakeBottom(water, square.bounds, { maxDepth, features });

describe('laskennallinen pohja', () => {
  const plain = make();

  it('syvenee rannasta keskelle kohti arvioitua maksimia', () => {
    expect(plain.depthAt({ x: 300, y: 0 })).toBe(0);
    const near = plain.depthAt({ x: 195, y: 0 });
    const mid = plain.depthAt({ x: 120, y: 0 });
    const center = plain.depthAt({ x: 0, y: 0 });
    expect(near).toBeLessThan(1.2);
    expect(mid).toBeGreaterThan(near);
    expect(center).toBeGreaterThan(mid);
    expect(center).toBeGreaterThan(6);
    expect(plain.maxDepth).toBeLessThanOrEqual(8.6);
  });

  it('matalikko nostaa ja syvänne laskee pohjaa', () => {
    const b = make([
      { type: 'shoal', x: 0, y: 0, radius: 30, depth: 1 },
      { type: 'hole', x: 100, y: 100, radius: 30, depth: 12 },
    ]);
    expect(b.depthAt({ x: 0, y: 0 })).toBeLessThan(1.4);
    expect(b.depthAt({ x: 100, y: 100 })).toBeGreaterThan(plain.depthAt({ x: 100, y: 100 }) + 3);
    // Kaukana muodoista pohja on ennallaan.
    expect(b.depthAt({ x: -100, y: -100 })).toBeCloseTo(plain.depthAt({ x: -100, y: -100 }), 5);
  });

  it('jyrkänteen reuna putoaa muutamassa metrissä', () => {
    const b = make([{ type: 'dropoff', x: 0, y: 0, radius: 40, depth: 2 }]);
    expect(b.depthAt({ x: 30, y: 0 })).toBeLessThan(2.3);
    expect(b.depthAt({ x: 46, y: 0 }) - b.depthAt({ x: 34, y: 0 })).toBeGreaterThan(3);
  });

  it('jyrkkä ranta syvenee nopeammin', () => {
    const steep = make([{ type: 'steep', x: 200, y: 0, radius: 150, steepness: 2.5 }]);
    expect(steep.depthAt({ x: 170, y: 0 })).toBeGreaterThan(plain.depthAt({ x: 170, y: 0 }) + 0.5);
  });

  it('tunnistaa kivikon ja kaatuneen puun oksat', () => {
    const b = make([
      { type: 'rocks', x: -50, y: 0, radius: 10 },
      { type: 'tree', x: 200, y: 50, length: 12, angle: Math.PI },
    ]);
    expect(b.structureAt({ x: -45, y: 3 })?.kind).toBe('rocks');
    expect(b.structureAt({ x: 192, y: 51 })?.kind).toBe('tree');
    expect(b.structureAt({ x: 192, y: 56 })).toBeNull();
    expect(b.structureAt({ x: 0, y: 0 })).toBeNull();
  });
});

describe('Lunkinjärven pohja', () => {
  const lake = new WaterBody(LUNKINJARVI);
  const t0 = Date.now();
  const bottom = new LakeBottom(lake, LUNKINJARVI.bounds, LUNKINJARVI_BOTTOM);
  const ms = Date.now() - t0;

  it('lasketaan nopeasti ja syvänne on syvin kohta', () => {
    expect(ms).toBeLessThan(1500);
    expect(bottom.maxDepth).toBeGreaterThan(9.5);
    expect(bottom.maxDepth).toBeLessThan(11);
  });

  it('erikoismuodot ovat vedessä ja puut lähtevät rannasta', () => {
    for (const f of LUNKINJARVI_BOTTOM.features) {
      if (f.type === 'tree') {
        const tip = {
          x: f.x + Math.cos(f.angle) * f.length,
          y: f.y + Math.sin(f.angle) * f.length,
        };
        expect(lake.isWater(tip), f.name).toBe(true);
        expect(lake.closestShorePoint(f)!.distance, f.name).toBeLessThan(1);
      } else if (f.type !== 'steep') {
        expect(lake.isWater(f), f.name).toBe(true);
        expect(distance(f, lake.closestShorePoint(f)!.point), f.name).toBeGreaterThan(10);
      }
    }
  });
});
