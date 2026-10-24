import { describe, expect, it } from 'vitest';
import { toTm35fin } from './projection';

describe('toTm35fin', () => {
  it('keskimeridiaanilla itäkoordinaatti on 500 000', () => {
    const p = toTm35fin(27, 60);
    expect(p.e).toBeCloseTo(500000, 3);
    // GRS80-meridiaanikaaren pituus 60°:een × 0,9996
    expect(p.n).toBeCloseTo(6654072.82 * 0.9996, 0);
  });

  it('Tammelan seutu osuu oikeaan ruutuun', () => {
    // Noin Forssan–Tammelan seudulla
    const p = toTm35fin(23.75, 60.8);
    expect(p.e).toBeGreaterThan(300000);
    expect(p.e).toBeLessThan(330000);
    expect(p.n).toBeGreaterThan(6735000);
    expect(p.n).toBeLessThan(6755000);
  });

  it('säilyttää etäisyydet metreinä', () => {
    // 0,01° leveysastetta ≈ 1113 m
    const a = toTm35fin(23.75, 60.8);
    const b = toTm35fin(23.75, 60.81);
    expect(Math.hypot(b.e - a.e, b.n - a.n)).toBeGreaterThan(1105);
    expect(Math.hypot(b.e - a.e, b.n - a.n)).toBeLessThan(1120);
  });
});
