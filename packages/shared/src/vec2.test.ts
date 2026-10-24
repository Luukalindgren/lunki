import { describe, expect, it } from 'vitest';
import { add, distance, fromAngle, length, normalize, scale, sub, vec2 } from './vec2';

describe('vec2', () => {
  it('laskee perusoperaatiot', () => {
    expect(add(vec2(1, 2), vec2(3, 4))).toEqual({ x: 4, y: 6 });
    expect(sub(vec2(1, 2), vec2(3, 4))).toEqual({ x: -2, y: -2 });
    expect(scale(vec2(1, -2), 3)).toEqual({ x: 3, y: -6 });
    expect(length(vec2(3, 4))).toBe(5);
    expect(distance(vec2(1, 1), vec2(4, 5))).toBe(5);
  });

  it('normalisoi ja käsittelee nollavektorin', () => {
    expect(length(normalize(vec2(10, -7)))).toBeCloseTo(1);
    expect(normalize(vec2())).toEqual({ x: 0, y: 0 });
  });

  it('muodostaa suunnan kulmasta', () => {
    const v = fromAngle(Math.PI / 2);
    expect(v.x).toBeCloseTo(0);
    expect(v.y).toBeCloseTo(1);
  });
});
