import { describe, expect, it } from 'vitest';
import { TUBE_RADIUS } from '../physics/tube';
import { LUNKINJARVI } from './lunkinjarvi';
import { footprint } from './piers';
import { pointInRing } from './surroundings';
import { WaterBody } from './waterBody';

const piers = LUNKINJARVI.piers ?? [];
const water = new WaterBody(LUNKINJARVI);
const withoutPiers = new WaterBody({ ...LUNKINJARVI, piers: [] });

describe('laiturit', () => {
  it('lähtevät rannasta järvelle', () => {
    expect(piers.length).toBeGreaterThan(3);
    for (const p of piers) {
      expect(pointInRing(p.to, LUNKINJARVI.shore)).toBe(true);
      expect(pointInRing(p.from, LUNKINJARVI.shore)).toBe(false);
      // Rannan ja törmäysalueen väliin ei mahdu rengas.
      expect(withoutPiers.closestShorePoint(p.base)!.distance).toBeLessThan(TUBE_RADIUS * 2);
    }
  });

  it('ovat esteitä: kansi ei ole vettä, ja rengas pysähtyy laituriin', () => {
    for (const p of piers) {
      const mid = { x: (p.base.x + p.to.x) / 2, y: (p.base.y + p.to.y) / 2 };
      expect(water.isWater(mid)).toBe(false);
      // Rengas yrittää ajaa laiturin poikki sivulta.
      const ux = (p.to.x - p.base.x) / Math.hypot(p.to.x - p.base.x, p.to.y - p.base.y);
      const uy = (p.to.y - p.base.y) / Math.hypot(p.to.x - p.base.x, p.to.y - p.base.y);
      const from = { x: mid.x - uy * 3, y: mid.y + ux * 3 };
      const to = { x: mid.x + uy * 3, y: mid.y - ux * 3 };
      if (!water.isWater(from)) continue;
      // Edetään pienin askelin kuten fysiikka (n. 3 m/s, 60 Hz).
      const d = { x: (to.x - from.x) / 120, y: (to.y - from.y) / 120 };
      let pos = from;
      for (let i = 0; i < 120; i++) {
        const next = { x: pos.x + d.x, y: pos.y + d.y };
        pos = water.moveCircle(pos, next, TUBE_RADIUS)?.position ?? next;
      }
      const side = (q: { x: number; y: number }) => (q.x - mid.x) * -uy + (q.y - mid.y) * ux;
      expect(Math.sign(side(pos))).toBe(Math.sign(side(from)));
    }
  });

  it('vesi laiturin vieressä ja kärjen takana on vettä', () => {
    for (const p of piers) {
      const len = Math.hypot(p.to.x - p.base.x, p.to.y - p.base.y);
      const beyond = {
        x: p.to.x + ((p.to.x - p.base.x) / len) * 2,
        y: p.to.y + ((p.to.y - p.base.y) / len) * 2,
      };
      expect(water.isWater(beyond)).toBe(true);
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
