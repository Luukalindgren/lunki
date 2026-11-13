import { describe, expect, it } from 'vitest';
import { LUNKINJARVI } from '@lunki/shared';
import { seeded } from './shapes';
import { SHORE_REACH, ShoreField } from './shoreField';

describe('ShoreField', () => {
  const field = new ShoreField(LUNKINJARVI);

  it('antaa etäisyyden merkin vesialueen mukaan: maalla positiivinen, vedessä negatiivinen', () => {
    const rand = seeded(5);
    const { minX, minY, maxX, maxY } = LUNKINJARVI.bounds;
    let near = 0;
    for (let i = 0; i < 20000; i++) {
      const p = { x: minX + rand() * (maxX - minX), y: minY + rand() * (maxY - minY) };
      const d = field.signed(p.x, p.y);
      expect(d < 0, `${p.x}, ${p.y}`).toBe(field.isWater(p));
      if (Math.abs(d) < SHORE_REACH) near++;
    }
    expect(near).toBeGreaterThan(1000);
  });

  it('on rantaviivalla nolla ja kasvaa maalle päin', () => {
    const a = LUNKINJARVI.shore[10]!;
    const b = LUNKINJARVI.shore[11]!;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    expect(field.distance(mid.x, mid.y)).toBeCloseTo(0, 5);
    // Maa on kulkusuunnasta oikealla.
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = { x: (b.y - a.y) / len, y: -(b.x - a.x) / len };
    expect(field.signed(mid.x + n.x, mid.y + n.y)).toBeCloseTo(1, 1);
    expect(field.signed(mid.x - n.x, mid.y - n.y)).toBeCloseTo(-1, 1);
  });

  it('kaukana rannasta etäisyys on haun raja', () => {
    expect(field.near(0, 5000)).toBe(false);
    expect(field.signed(0, 5000)).toBe(SHORE_REACH);
  });
});
