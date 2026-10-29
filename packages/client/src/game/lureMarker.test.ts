import { describe, expect, it } from 'vitest';
import { LURE_MARKER, LureMarker, markerPosition } from './lureMarker';
import { lureColor } from './lureColor';

describe('vieheen merkki (#391)', () => {
  const input = { at: { x: 2, y: 11 }, height: 0, color: lureColor(1.2), pov: true, pixel: 0.005 };

  it('silmin kiinteä kuvapistekoko, ylhäältä metreinä ja lennossa isompana', () => {
    const m = new LureMarker();
    m.update(input);
    expect(m.shown).toBe(true);
    const sprite = m.group.children[0]!;
    expect(sprite.scale.x).toBeCloseTo(LURE_MARKER.markPx * 0.005);
    m.update({ ...input, pov: false, pixel: 0.125, height: 2 });
    expect(sprite.scale.x).toBeGreaterThan(LURE_MARKER.markPx * 0.125);
    m.hide();
    expect(m.shown).toBe(false);
  });

  it('ylhäältä lentokorkeus näkyy siirtymänä pohjoiseen', () => {
    const ground = markerPosition({ x: 0, y: 0 }, 0, false);
    const air = markerPosition({ x: 0, y: 0 }, 2, false);
    expect(air.z).toBeLessThan(ground.z);
    expect(markerPosition({ x: 0, y: 0 }, 0, true).y).toBeCloseTo(LURE_MARKER.povY);
  });

  it('pohjan pölläys ja seuraajan pyörteet eivät näy realistisella', () => {
    expect(LURE_MARKER.signs.realistic).toBe(false);
    expect(LURE_MARKER.signs.easy && LURE_MARKER.signs.normal).toBe(true);
  });
});
