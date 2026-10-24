import { describe, expect, it } from 'vitest';
import { FIXED_DT, FixedStepAccumulator } from './loop';

describe('FixedStepAccumulator', () => {
  it('ajaa yhden askeleen 60 fps -ruudulla', () => {
    const acc = new FixedStepAccumulator();
    expect(acc.advance(FIXED_DT).steps).toBe(1);
  });

  it('kerää vajaat askeleet seuraavalle ruudulle', () => {
    const acc = new FixedStepAccumulator();
    const first = acc.advance(FIXED_DT * 0.5);
    expect(first.steps).toBe(0);
    expect(first.alpha).toBeCloseTo(0.5);
    expect(acc.advance(FIXED_DT * 0.6).steps).toBe(1);
  });

  it('ajaa useita askelia hitaalla ruudulla', () => {
    const acc = new FixedStepAccumulator();
    expect(acc.advance(FIXED_DT * 3.01).steps).toBe(3);
  });

  it('rajoittaa pitkän tauon', () => {
    const acc = new FixedStepAccumulator();
    expect(acc.advance(10).steps).toBe(Math.floor(0.25 / FIXED_DT));
  });
});
