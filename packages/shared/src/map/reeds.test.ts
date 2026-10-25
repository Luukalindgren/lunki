import { describe, expect, it } from 'vitest';
import { stepPlayerTube } from '../net/tubeSync';
import { createTube } from '../physics/tube';
import { LakeBottom } from './bottom';
import { isValidStart, signedArea } from './geometry';
import { LUNKINJARVI, LUNKINJARVI_BOTTOM } from './lunkinjarvi';
import { REEDS, distanceToRing } from './reeds';
import { pointInRing } from './surroundings';
import { WaterBody } from './waterBody';

const water = new WaterBody(LUNKINJARVI);
const bottom = new LakeBottom(water, LUNKINJARVI.bounds, LUNKINJARVI_BOTTOM, LUNKINJARVI.reeds);
const beds = LUNKINJARVI.reeds ?? [];
const centroid = (ring: { x: number; y: number }[]) => ({
  x: ring.reduce((s, p) => s + p.x, 0) / ring.length,
  y: ring.reduce((s, p) => s + p.y, 0) / ring.length,
});

describe('Lunkinjärven saaret', () => {
  it('ovat järvellä, myötäpäivään ja maata', () => {
    expect(LUNKINJARVI.islands.length).toBeGreaterThanOrEqual(8);
    for (const island of LUNKINJARVI.islands) {
      expect(signedArea(island)).toBeLessThan(0);
      const c = centroid(island);
      expect(pointInRing(c, LUNKINJARVI.shore)).toBe(true);
      expect(water.isWater(c)).toBe(false);
      expect(bottom.depthAt(c)).toBe(0);
      expect(isValidStart(water, c)).toBe(false);
    }
  });

  it('rengas ei aja saaren läpi', () => {
    const island = LUNKINJARVI.islands.reduce((a, b) =>
      Math.abs(signedArea(a)) > Math.abs(signedArea(b)) ? a : b,
    );
    const c = centroid(island);
    // Lähdetään 40 m saaren länsipuolelta ja potkitaan itään (selkä edellä: katse länteen).
    let tube = createTube({ x: c.x - 40, y: c.y }, Math.PI);
    for (let i = 0; i < 60 * 60; i++)
      tube = stepPlayerTube(tube, { kick: 1, turn: 0, sprint: false }, water);
    expect(water.isWater(tube.pos)).toBe(true);
    expect(tube.pos.x).toBeLessThan(c.x);
  });
});

describe('Lunkinjärven kaislikot', () => {
  it('ovat enimmäkseen vedessä', () => {
    expect(beds.length).toBeGreaterThanOrEqual(10);
    for (const bed of beds) {
      const wet = bed.ring.filter((p) => pointInRing(p, LUNKINJARVI.shore)).length;
      expect(wet / bed.ring.length).toBeGreaterThan(0.3);
    }
  });

  it('löytyvät pisteestä ja madaltavat pohjaa', () => {
    // Kaislikon syvin sisäpiste: kauimpana reunasta.
    for (const bed of beds) {
      const xs = bed.ring.map((p) => p.x);
      const ys = bed.ring.map((p) => p.y);
      let best = { p: bed.ring[0]!, d: 0 };
      for (let x = Math.min(...xs); x < Math.max(...xs); x += 1)
        for (let y = Math.min(...ys); y < Math.max(...ys); y += 1) {
          const p = { x, y };
          if (!pointInRing(p, bed.ring) || !water.isWater(p)) continue;
          const d = distanceToRing(p, bed.ring);
          if (d > best.d) best = { p, d };
        }
      expect(water.reedsAt(best.p)).toBe(bed);
      expect(bottom.structureAt(best.p)?.kind).toBe('reeds');
      if (best.d >= REEDS.edge)
        expect(bottom.depthAt(best.p)).toBeLessThanOrEqual(REEDS.depth + 1e-3);
    }
  });

  it('hidastavat rengasta', () => {
    const bed = beds[0]!;
    const start = { x: 210, y: 420 };
    expect(water.reedsAt(start)).toBe(bed);
    const kick = { kick: 1, turn: 0, sprint: false };
    let inReeds = createTube(start);
    let open = createTube({ x: 0, y: 0 });
    for (let i = 0; i < 60; i++) {
      inReeds = stepPlayerTube(inReeds, kick, water);
      open = stepPlayerTube(open, kick, water);
    }
    const speed = (t: typeof open) => Math.hypot(t.vel.x, t.vel.y);
    expect(speed(inReeds)).toBeLessThan(speed(open) * 0.75);
  });
});
