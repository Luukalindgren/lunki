import { describe, expect, it } from 'vitest';
import { NO_SCULL, turnScull } from './turnScull';

describe('turnScull', () => {
  it('paikallaan räpylät ovat levossa', () => {
    expect(turnScull(1.2, 0).strength).toBe(0);
    expect(NO_SCULL.strength).toBe(0);
  });

  it('räpylät liikkuvat käännöksen tahdissa ja vaihe jatkuu ±π:n yli', () => {
    const a = turnScull(0.1, 1);
    const b = turnScull(0.3, 1);
    expect(a.strength).toBe(1);
    expect(a.wave).not.toBeCloseTo(b.wave);
    expect(turnScull(Math.PI, 1).wave).toBeCloseTo(turnScull(-Math.PI, 1).wave);
  });

  it('hidas käännös liikuttaa vähemmän ja suunta näkyy käännössä', () => {
    const slow = turnScull(0.4, 0.15);
    expect(slow.strength).toBeGreaterThan(0);
    expect(slow.strength).toBeLessThan(0.5);
    expect(turnScull(0.4, -1).turn).toBe(-1);
    expect(turnScull(0.4, 3).turn).toBe(1);
  });
});
