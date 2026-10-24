import { describe, expect, it } from 'vitest';
import { distance } from '../vec2';
import {
  CAST,
  chargePower,
  clampCastAngle,
  launchLure,
  predictLanding,
  rodTip,
  stepFlight,
} from './cast';

describe('heitto', () => {
  const origin = { x: 0, y: 0 };

  it('täysi heitto lentää 40–55 m, kevyt alle 12 m', () => {
    expect(distance(origin, predictLanding(origin, 0, 1))).toBeGreaterThan(40);
    expect(distance(origin, predictLanding(origin, 0, 1))).toBeLessThan(55);
    expect(distance(origin, predictLanding(origin, 0, 0.2))).toBeLessThan(12);
  });

  it('pituus kasvaa voiman mukana', () => {
    let prev = 0;
    for (const p of [0.1, 0.3, 0.5, 0.7, 0.9, 1]) {
      const d = distance(origin, predictLanding(origin, 0, p));
      expect(d).toBeGreaterThan(prev);
      prev = d;
    }
  });

  it('osuu tähtäyssuuntaan', () => {
    const angle = 2.2;
    const p = predictLanding(origin, angle, 0.7);
    expect(Math.atan2(p.y, p.x)).toBeCloseTo(angle, 6);
  });

  it('lento päättyy vedenpintaan ja laskee lennetyn matkan', () => {
    const f = launchLure(origin, 0, 0.6);
    let steps = 0;
    while (!stepFlight(f, 1 / 60)) steps++;
    expect(f.height).toBe(0);
    expect(steps).toBeGreaterThan(30);
    expect(f.travelled).toBeCloseTo(distance(origin, f.pos), 6);
  });

  it('voimamittari nousee ja laskee', () => {
    expect(chargePower(0)).toBe(0);
    expect(chargePower(CAST.chargeTime / 2)).toBeCloseTo(0.5);
    expect(chargePower(CAST.chargeTime)).toBeCloseTo(1);
    expect(chargePower(CAST.chargeTime * 1.5)).toBeCloseTo(0.5);
  });

  it('ei heitä selän taakse', () => {
    expect(clampCastAngle(Math.PI, 0)).toBeCloseTo(CAST.maxSideAngle);
    expect(clampCastAngle(0.3, 0)).toBeCloseTo(0.3);
  });

  it('vavan kärki on katsesuunnassa', () => {
    const tip = rodTip({ x: 10, y: 0 }, Math.PI / 2);
    expect(tip.x).toBeCloseTo(10);
    expect(tip.y).toBeCloseTo(CAST.rodReach);
  });
});
