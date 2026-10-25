import { describe, expect, it } from 'vitest';
import { bearingDeg, stripOffset } from './compass';

describe('kompassi', () => {
  it('muuntaa katsesuunnan kompassisuunnaksi', () => {
    expect(bearingDeg(Math.PI / 2)).toBeCloseTo(0); // pohjoinen
    expect(bearingDeg(0)).toBeCloseTo(90); // itä
    expect(bearingDeg(-Math.PI / 2)).toBeCloseTo(180); // etelä
    expect(bearingDeg(Math.PI)).toBeCloseTo(270); // länsi
    expect(bearingDeg((3 * Math.PI) / 4)).toBeCloseTo(315); // luode
  });

  it('siirtää kaistaletta kokonaisin pikselein ja pohjoinen osuu keskelle', () => {
    // Pohjoinen (0°) on kaistaleella kohdassa 180° / 2,5 = 72 u, keskikohta 40 u.
    expect(stripOffset(0)).toBe(40 - 72);
    expect(stripOffset(359.9)).toBe(Math.round(40 - 539.9 / 2.5));
    for (const b of [0, 13, 90, 271.3]) expect(Number.isInteger(stripOffset(b))).toBe(true);
  });
});
