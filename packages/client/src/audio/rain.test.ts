import { Rng } from '@lunki/shared';
import { describe, expect, it } from 'vitest';
import { RAIN_LAYER_RMS, rainPatter } from './rain';

const SR = 48000;
const rms = (b: Float32Array) => Math.sqrt(b.reduce((s, v) => s + v * v, 0) / b.length);
const peak = (b: Float32Array) => b.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

describe('rainPatter', () => {
  it('on tasaisen äänekäs ja pysyy rajoissa', () => {
    const rng = new Rng(1);
    const buf = rainPatter(SR, 2, 60, () => rng.next());
    expect(buf.length).toBe(2 * SR);
    expect(rms(buf)).toBeCloseTo(RAIN_LAYER_RMS, 1);
    expect(peak(buf)).toBeLessThanOrEqual(1);
  });

  it('on ropinaa eikä suhinaa: suurin osa hetkistä on pisaroiden välissä hiljaa', () => {
    const rng = new Rng(2);
    const buf = rainPatter(SR, 2, 30, () => rng.next());
    const win = SR * 0.005;
    const windows: number[] = [];
    for (let i = 0; i + win <= buf.length; i += win) windows.push(rms(buf.subarray(i, i + win)));
    windows.sort((a, b) => a - b);
    const median = windows[Math.floor(windows.length / 2)]!;
    expect(median).toBeLessThan(rms(buf) * 0.3);
  });

  it('silmukan sauma ei napsahda', () => {
    const rng = new Rng(3);
    const buf = rainPatter(SR, 1, 120, () => rng.next());
    expect(Math.abs(buf[0]! - buf[buf.length - 1]!)).toBeLessThan(0.2);
  });
});

describe('rainPatter rankkasade', () => {
  it('kovia iskuja on enemmän kuin tavallisessa sateessa', () => {
    const loud = (hard: boolean) => {
      const rng = new Rng(4);
      const buf = rainPatter(SR, 2, 120, () => rng.next(), hard);
      return buf.filter((v) => Math.abs(v) > RAIN_LAYER_RMS * 3).length;
    };
    expect(loud(true)).toBeGreaterThan(loud(false));
  });
});
