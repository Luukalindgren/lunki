import { describe, expect, it } from 'vitest';
import { canStand } from '../physics/shore';
import { LUNKINJARVI, LUNKINJARVI_SURROUNDINGS } from './lunkinjarvi';
import { footprint, pierDeckRing } from './piers';
import { pointInRing } from './surroundings';
import { WaterBody } from './waterBody';

const water = new WaterBody(LUNKINJARVI);
const buildings = LUNKINJARVI_SURROUNDINGS.areas
  .filter((a) => a.kind === 'building')
  .map((a) => a.rings[0]!);

describe('rantarakennukset', () => {
  it('yksikään rakennus ei ulotu järven päälle', () => {
    const wet = buildings.filter((ring) => ring.some((p) => water.isWater(p)));
    expect(wet.map((r) => footprint(r).center)).toEqual([]);
  });

  it('laiturin kansi ei ala rakennuksen sisältä', () => {
    for (const pier of LUNKINJARVI.piers ?? []) {
      const deck = pierDeckRing(pier);
      expect(buildings.some((r) => deck.some((c) => pointInRing(c, r)))).toBe(false);
    }
  });

  it('rannan rakennusten läpi ei kävellä', () => {
    const near = LUNKINJARVI.buildings ?? [];
    expect(near.length).toBeGreaterThan(5);
    for (const ring of near) {
      const f = footprint(ring);
      expect(water.isLand(f.center)).toBe(false);
      expect(canStand(water, f.center)).toBe(false);
      // Seinän vieressä ulkopuolella seistään (metrin päässä kulmasta poispäin).
      const corner = ring[0]!;
      const out = Math.hypot(corner.x - f.center.x, corner.y - f.center.y);
      const p = {
        x: corner.x + ((corner.x - f.center.x) / out) * 1,
        y: corner.y + ((corner.y - f.center.y) / out) * 1,
      };
      if (!water.isWater(p)) expect(water.isLand(p)).toBe(true);
    }
  });
});
