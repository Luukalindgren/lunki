import { describe, expect, it } from 'vitest';
import {
  LUNKINJARVI,
  LUNKINJARVI_BOTTOM,
  LUNKINJARVI_SURROUNDINGS,
  LakeBottom,
  WaterBody,
  pointInRing,
} from '@lunki/shared';
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
});
