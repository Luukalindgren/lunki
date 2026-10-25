import { describe, expect, it } from 'vitest';
import { flashCurve, shakeCurve } from './lightningView';

describe('salaman välähdys', () => {
  it('useampi kirkas isku, välissä pimeitä hetkiä, sitten hiipuu', () => {
    expect(flashCurve(0)).toBe(1);
    expect(flashCurve(0.1)).toBeLessThan(0.5);
    expect(flashCurve(0.2)).toBe(1);
    expect(flashCurve(0.3)).toBeLessThan(0.5);
    expect(flashCurve(0.4)).toBeGreaterThan(0.5);
    expect(flashCurve(0.8)).toBeLessThan(flashCurve(0.5));
    expect(flashCurve(1.2)).toBe(0);
    expect(flashCurve(Infinity)).toBe(0);
  });

  it('tärinä alkaa täysillä ja hiipuu alle sekunnissa', () => {
    expect(shakeCurve(0)).toBe(1);
    expect(shakeCurve(0.4)).toBeLessThan(0.5);
    expect(shakeCurve(1)).toBe(0);
  });
});
