import { describe, expect, it } from 'vitest';
import { LUNKINJARVI, LUNKINJARVI_SURROUNDINGS, pierDeckRing, pointInRing } from '@lunki/shared';
import { planTreeLines } from './shoreScenery';
import { planVegetation } from './vegetation';

const map = LUNKINJARVI;
const onIsland = (p: { x: number; y: number }) => map.islands.some((i) => pointInRing(p, i));
const inLake = (p: { x: number; y: number }) => pointInRing(p, map.shore) && !onIsland(p);
const inReeds = (p: { x: number; y: number }) =>
  (map.reeds ?? []).some((r) => pointInRing(p, r.ring));

describe('rantamaisema', () => {
  const plants = planVegetation(map, LUNKINJARVI_SURROUNDINGS);

  it('puut kasvavat maalla ja saarilla, kaislat kartan kaislikoissa', () => {
    const trees = plants.filter((p) => p.kind !== 'reeds');
    const reeds = plants.filter((p) => p.kind === 'reeds');
    expect(trees.length).toBeGreaterThan(5000);
    expect(trees.length).toBeLessThan(40000);
    expect(reeds.length).toBeGreaterThan(200);
    expect(trees.every((t) => !inLake(t.pos))).toBe(true);
    expect(reeds.every((r) => inLake(r.pos))).toBe(true);
    expect(reeds.every((r) => inReeds(r.pos))).toBe(true);
    // Jokaisella saarella kasvaa puita.
    for (const island of map.islands)
      expect(trees.some((t) => pointInRing(t.pos, island))).toBe(true);
    // Kaikkia kolmea puulajia.
    for (const kind of ['spruce', 'pine', 'birch'])
      expect(trees.some((t) => t.kind === kind)).toBe(true);
  });

  it('sijoittelu on aina sama', () => {
    const again = planVegetation(map, LUNKINJARVI_SURROUNDINGS);
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

  it('laiturin kannen läpi ei kasva kaislaa eikä juuressa ole puuta', () => {
    const piers = map.piers ?? [];
    expect(piers.length).toBeGreaterThan(20);
    for (const pier of piers) {
      const deck = pierDeckRing(pier);
      expect(plants.some((p) => p.kind === 'reeds' && pointInRing(p.pos, deck))).toBe(false);
      const root = pier.from;
      const tree = plants.find(
        (t) => t.kind !== 'reeds' && Math.hypot(t.pos.x - root.x, t.pos.y - root.y) < 3,
      );
      expect(tree).toBeUndefined();
    }
  });

  it('metsänreunan siluetti ei kulje rakennusten läpi', () => {
    const buildings = LUNKINJARVI_SURROUNDINGS.areas
      .filter((a) => a.kind === 'building')
      .map((a) => a.rings[0]!);
    const cut: string[] = [];
    for (const line of planTreeLines(map, LUNKINJARVI_SURROUNDINGS)) {
      line.forEach((a, i) => {
        const b = line[(i + 1) % line.length]!;
        for (let t = 0; t <= 1; t += 0.05) {
          // Seinämän korkeus tässä kohtaa; matala reuna (pelto) ei peitä taloa.
          if (a.height + (b.height - a.height) * t < 1) continue;
          const q = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
          if (buildings.some((r) => pointInRing(q, r)))
            cut.push(`${q.x.toFixed(0)},${q.y.toFixed(0)}`);
        }
      });
    }
    expect(cut).toEqual([]);
  });

  it('metsänreuna jatkuu rakennusten takana eikä katkea pihoille', () => {
    const flat = (lines: { height: number }[][]) =>
      lines.flat().filter((p) => p.height === 0).length;
    const withBuildings = flat(planTreeLines(map, LUNKINJARVI_SURROUNDINGS));
    const without = flat(
      planTreeLines(map, {
        ...LUNKINJARVI_SURROUNDINGS,
        areas: LUNKINJARVI_SURROUNDINGS.areas.filter((a) => a.kind !== 'building'),
      }),
    );
    // Kapeilla niemillä seinämää ei ole muutenkaan. Pihat saavat lisätä vain
    // vähän aukkoja (noin 3 % pisteistä); talon takana näkyi taivas, kun
    // aukkoja oli lähes 500.
    expect(withBuildings - without).toBeLessThan(100);
  });
});
