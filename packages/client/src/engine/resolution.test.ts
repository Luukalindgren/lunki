import { describe, expect, it } from 'vitest';
import { computeResolution } from './resolution';

describe('computeResolution', () => {
  it('Full HD → 480×270, kerroin 4', () => {
    expect(computeResolution(1920, 1080)).toEqual({ width: 480, height: 270, scale: 4 });
  });

  it('1280×720 → kerroin 3', () => {
    expect(computeResolution(1280, 720)).toEqual({ width: 427, height: 240, scale: 3 });
  });

  it('pieni ikkuna ei mene alle minimikorkeuden', () => {
    const r = computeResolution(400, 300);
    expect(r.scale).toBe(1);
    expect(r.height).toBe(300);
  });

  it('kattaa koko ruudun', () => {
    for (const [w, h] of [
      [1366, 768],
      [2560, 1440],
      [1001, 677],
    ] as const) {
      const r = computeResolution(w, h);
      expect(r.width * r.scale).toBeGreaterThanOrEqual(w);
      expect(r.height * r.scale).toBeGreaterThanOrEqual(h);
    }
  });
});
