import { describe, expect, it } from 'vitest';
import { roundRing, signedArea } from './geometry';

describe('roundRing', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];

  it('pyöristää vain kulmat ja pitää suorat paikallaan', () => {
    const r = roundRing(square, 5);
    expect(r.length).toBe(square.length * 8);
    // Kulmasta lähin piste on enintään muutaman metrin päässä.
    const nearCorner = Math.min(...r.map((p) => Math.hypot(p.x, p.y)));
    expect(nearCorner).toBeGreaterThan(1);
    expect(nearCorner).toBeLessThan(5);
    expect(r.every((p) => p.x >= 0 && p.x <= 100 && p.y >= 0 && p.y <= 100)).toBe(true);
    expect(signedArea(r)).toBeGreaterThan(signedArea(square) * 0.99);
  });

  it('lyhyillä sivuilla leikkaus on neljännes sivusta', () => {
    const tiny = square.map((p) => ({ x: p.x / 50, y: p.y / 50 }));
    const r = roundRing(tiny, 5, 1);
    expect(r[1]).toEqual({ x: 0.5, y: 0 });
  });
});
