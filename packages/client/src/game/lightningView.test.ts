import { describe, expect, it } from 'vitest';
import { flashCurve } from './lightningView';

describe('salaman välähdys', () => {
  it('kaksi kirkasta iskua, välissä pimeä hetki, sitten hiipuu', () => {
    expect(flashCurve(0)).toBe(1);
    expect(flashCurve(0.1)).toBeLessThan(0.5);
    expect(flashCurve(0.2)).toBeGreaterThan(0.5);
    expect(flashCurve(0.4)).toBeLessThan(flashCurve(0.3));
    expect(flashCurve(1)).toBe(0);
    expect(flashCurve(Infinity)).toBe(0);
  });
});
