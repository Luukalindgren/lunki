import { Rng } from '@lunki/shared';
import { describe, expect, it } from 'vitest';
import { thunderClap } from './thunder';

const SR = 48000;
const rms = (b: Float32Array) => Math.sqrt(b.reduce((s, v) => s + v * v, 0) / b.length);
const peak = (b: Float32Array) => b.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

/** Kaistan osuus energiasta Goertzel-tyyppisellä yksinkertaisella suotimella. */
function bandRms(b: Float32Array, lo: number, hi: number): number {
  const aLo = 1 - Math.exp((-2 * Math.PI * lo) / SR);
  const aHi = 1 - Math.exp((-2 * Math.PI * hi) / SR);
  let l = 0;
  let h = 0;
  let sum = 0;
  for (const x of b) {
    h += aHi * (x - h);
    l += aLo * (h - l);
    sum += (h - l) ** 2;
  }
  return Math.sqrt(sum / b.length);
}

describe('thunderClap', () => {
  it('lähellä jyrähdys on lyhyt, kova ja alkaa heti', () => {
    const rng = new Rng(1);
    const buf = thunderClap(SR, 100, () => rng.next());
    expect(buf.length / SR).toBeGreaterThan(4);
    expect(peak(buf)).toBeCloseTo(1, 5);
    expect(rms(buf.subarray(0, SR * 0.3))).toBeGreaterThan(0.2);
    // Tuhti ääni: keskimääräinen taso pysyy korkeana koko jyrähdyksen ajan.
    expect(rms(buf)).toBeGreaterThan(0.12);
  });

  it('kaukana alku on pehmeä', () => {
    const rng = new Rng(2);
    const buf = thunderClap(SR, 3000, () => rng.next());
    expect(rms(buf.subarray(0, SR * 0.05))).toBeLessThan(rms(buf) * 0.3);
  });

  it('jyrinää kuuluu myös puhelimen kaiuttimen taajuuksilla', () => {
    const rng = new Rng(3);
    const buf = thunderClap(SR, 1500, () => rng.next());
    expect(bandRms(buf, 200, 700)).toBeGreaterThan(rms(buf) * 0.3);
  });
});
