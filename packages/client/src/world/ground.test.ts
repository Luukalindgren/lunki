import { describe, expect, it } from 'vitest';
import { LUNKINJARVI, LUNKINJARVI_SURROUNDINGS, pointInRing, type Vec2 } from '@lunki/shared';
import { Ground } from './ground';

const map = LUNKINJARVI;
const ground = new Ground(map, LUNKINJARVI_SURROUNDINGS.terrain);
const inLake = (p: Vec2) =>
  pointInRing(p, map.shore) && !map.islands.some((i) => pointInRing(p, i));

/** Pisteitä rantaviivan molemmin puolin. */
function nearShore(offset: number): Vec2[] {
  const out: Vec2[] = [];
  for (const ring of [map.shore, ...map.islands]) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!;
      const b = ring[(i + 1) % ring.length]!;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      for (let s = 0; s < len; s += 3) {
        const t = s / len;
        // Vasen normaali osoittaa maalle.
        const n = { x: (b.y - a.y) / len, y: -(b.x - a.x) / len };
        out.push({
          x: a.x + (b.x - a.x) * t + n.x * offset,
          y: a.y + (b.y - a.y) * t + n.y * offset,
        });
      }
    }
  }
  return out;
}

describe('maanpinta', () => {
  it('maa ei nouse veden päälle järven puolella', () => {
    const water = [...nearShore(-2), ...nearShore(-6), ...nearShore(-15)].filter(inLake);
    expect(water.length).toBeGreaterThan(1000);
    const above = water.filter((p) => ground.heightAt(p) > 0);
    expect(above.length / water.length).toBeLessThan(0.01);
  });

  it('rannalta maa nousee rinteenä eikä seinänä', () => {
    // Viiden metrin päässä rantaviivasta enintään noin 0,5 m/m rinne
    // (mutkissa lähin ranta voi olla hieman kauempana).
    const land = nearShore(5).filter((p) => !inLake(p));
    const steep = land.filter((p) => ground.heightAt(p) > 4);
    expect(steep).toEqual([]);
    // Rannan tuntumassa maa on vedenpinnan yläpuolella.
    const dry = nearShore(12).filter((p) => !inLake(p));
    const low = dry.filter((p) => ground.heightAt(p) < 0.1);
    expect(low.length / dry.length).toBeLessThan(0.05);
  });

  it('kaukana rannasta korkeus on korkeusmallin mukainen', () => {
    const t = LUNKINJARVI_SURROUNDINGS.terrain!;
    const p = { x: t.minX + 10 * t.cell, y: t.minY + 10 * t.cell };
    expect(ground.heightAt(p)).toBeCloseTo(Math.max(0.3, t.heights[10 * t.cols + 10]!), 3);
  });
});
