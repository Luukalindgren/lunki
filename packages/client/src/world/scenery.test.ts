import { describe, expect, it } from 'vitest';
import {
  LUNKINJARVI,
  LUNKINJARVI_BOTTOM,
  LUNKINJARVI_SURROUNDINGS,
  LakeBottom,
  WaterBody,
  pointInRing,
} from '@lunki/shared';
import { footprint, planPiers } from './buildings';
import { planVegetation } from './vegetation';

const map = LUNKINJARVI;
const bottom = new LakeBottom(new WaterBody(map), map.bounds, LUNKINJARVI_BOTTOM);
const inLake = (p: { x: number; y: number }) => pointInRing(p, map.shore);

describe('rantamaisema', () => {
  const plants = planVegetation(map, LUNKINJARVI_SURROUNDINGS, bottom);

  it('puut kasvavat maalla ja kaislat matalassa vedessä', () => {
    const trees = plants.filter((p) => p.kind !== 'reeds');
    const reeds = plants.filter((p) => p.kind === 'reeds');
    expect(trees.length).toBeGreaterThan(5000);
    expect(trees.length).toBeLessThan(40000);
    expect(reeds.length).toBeGreaterThan(200);
    expect(trees.every((t) => !inLake(t.pos))).toBe(true);
    expect(reeds.every((r) => inLake(r.pos))).toBe(true);
    expect(reeds.every((r) => bottom.depthAt(r.pos) <= 1.3)).toBe(true);
    // Kaikkia kolmea puulajia.
    for (const kind of ['spruce', 'pine', 'birch'])
      expect(trees.some((t) => t.kind === kind)).toBe(true);
  });

  it('sijoittelu on aina sama', () => {
    const again = planVegetation(map, LUNKINJARVI_SURROUNDINGS, bottom);
    expect(again.length).toBe(plants.length);
    expect(again[123]).toEqual(plants[123]);
  });

  it('pihoille ei kasva puita', () => {
    const corners = LUNKINJARVI_SURROUNDINGS.areas
      .filter((a) => a.kind === 'building')
      .flatMap((a) => a.rings[0]!);
    const tree = plants.find(
      (t) =>
        t.kind !== 'reeds' && corners.some((c) => Math.hypot(c.x - t.pos.x, c.y - t.pos.y) < 8),
    );
    expect(tree).toBeUndefined();
  });

  it('laiturit lähtevät rannasta järvelle', () => {
    const piers = planPiers(map, LUNKINJARVI_SURROUNDINGS);
    expect(piers.length).toBeGreaterThan(3);
    for (const p of piers) {
      expect(inLake(p.to)).toBe(true);
      expect(inLake(p.from)).toBe(false);
    }
  });

  it('pohjapiirroksen suorakaide', () => {
    const f = footprint([
      { x: 0, y: 0 },
      { x: 4, y: 4 },
      { x: 2, y: 6 },
      { x: -2, y: 2 },
    ]);
    expect(f.length).toBeCloseTo(Math.hypot(4, 4));
    expect(f.width).toBeCloseTo(Math.hypot(2, 2));
    expect(f.center.x).toBeCloseTo(1);
    expect(f.center.y).toBeCloseTo(3);
    expect(f.area).toBeCloseTo(16);
  });
});
