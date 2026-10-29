import { describe, expect, it } from 'vitest';
import { LURE_MARKER, LureMarker, lureShade, markerParts, type MarkerInput } from './lureMarker';
import { lureColor } from './lureColor';

const deep = { depth: 1.2, range: 11, onLand: false, flying: false };
const shallow = { depth: 0.3, range: 11, onLand: false, flying: false };

describe('vieheen merkki vaikeustason mukaan (#391)', () => {
  it('helpolla tilan värinen merkki molemmissa näkymissä', () => {
    for (const pov of [true, false])
      expect(markerParts('easy', pov, deep)).toEqual({
        mark: true,
        image: false,
        entry: false,
        dot: false,
      });
  });

  it('normaalilla silmin vesiraja aina ja viehe vain matalalta tai läheltä', () => {
    expect(markerParts('normal', true, deep)).toMatchObject({ entry: true, image: false });
    expect(markerParts('normal', true, shallow)).toMatchObject({ entry: true, image: true });
    expect(markerParts('normal', true, { ...deep, range: LURE_MARKER.seeRange - 1 })).toMatchObject(
      { image: true },
    );
    // Lennossa ja maalla ei ole vesirajaa.
    expect(markerParts('normal', true, { ...shallow, flying: true }).entry).toBe(false);
    expect(markerParts('normal', false, deep)).toMatchObject({ image: true, entry: false });
  });

  it('realistisella silmin ei merkkiä, ylhäältä pieni merkki', () => {
    expect(Object.values(markerParts('realistic', true, shallow)).some(Boolean)).toBe(false);
    expect(markerParts('realistic', true, { ...deep, onLand: true }).image).toBe(true);
    expect(markerParts('realistic', false, deep)).toMatchObject({ dot: true, mark: false });
  });

  it('pohjan pölläys ja seuraajan pyörteet eivät näy realistisella', () => {
    expect(LURE_MARKER.signs.realistic).toBe(false);
    expect(LURE_MARKER.signs.easy && LURE_MARKER.signs.normal).toBe(true);
  });

  it('syvä viehe tummuu', () => {
    expect(lureShade(0)).toBe(1);
    expect(lureShade(5)).toBeCloseTo(LURE_MARKER.deepShade);
  });
});

describe('LureMarker', () => {
  const input = (over: Partial<MarkerInput> = {}): MarkerInput => ({
    at: { x: 0, y: 11 },
    height: 0,
    depth: 1.2,
    from: { x: 0, y: 0 },
    onLand: false,
    flying: false,
    moving: true,
    color: lureColor(1.2),
    art: 'spoon',
    difficulty: 'normal',
    pov: true,
    pixel: 0.005,
    ...over,
  });

  it('vana näkyy vain liikkuvalla vieheellä', () => {
    const m = new LureMarker();
    m.update(input());
    expect(m.shown).toMatchObject({ entry: true, wake: true, image: false });
    m.update(input({ moving: false }));
    expect(m.shown).toMatchObject({ entry: true, wake: false });
  });

  it('tuntemattoman vieheen kuvan tilalla on pieni merkki', () => {
    const m = new LureMarker();
    m.update(input({ art: null, pov: false }));
    expect(m.shown).toMatchObject({ image: false, dot: true });
  });

  it('piilotettuna mikään osa ei näy', () => {
    const m = new LureMarker();
    m.update(input({ difficulty: 'easy' }));
    expect(m.shown.mark).toBe(true);
    m.hide();
    expect(Object.values(m.shown).some(Boolean)).toBe(false);
  });
});
