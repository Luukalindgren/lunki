import { describe, expect, it } from 'vitest';
import { MapViewport, depthBand, scaleBarMeters } from './mapViewport';

const limits = { minX: -1000, minY: -500, maxX: 1000, maxY: 500 };

describe('kartan näkymä', () => {
  it('sovittaa alueen ja muuntaa pisteet edestakaisin', () => {
    const v = new MapViewport(limits);
    v.setSize(400, 200);
    v.fit({ minX: -500, minY: -250, maxX: 500, maxY: 250 }, 0);
    expect(v.scale).toBeCloseTo(0.4);
    expect(v.toScreen({ x: 0, y: 0 })).toEqual({ x: 200, y: 100 });
    // Pohjoinen ylöspäin: suurempi y on näytöllä ylempänä.
    expect(v.toScreen({ x: 0, y: 100 }).y).toBeLessThan(100);
    const w = v.toWorld(310, 40);
    const s = v.toScreen(w);
    expect(s.x).toBeCloseTo(310);
    expect(s.y).toBeCloseTo(40);
  });

  it('zoomaus pitää osoitetun pisteen paikallaan ja pysyy rajoissa', () => {
    const v = new MapViewport(limits);
    v.setSize(400, 200);
    v.fit(limits, 0);
    const before = v.toWorld(300, 50);
    v.zoomAt(300, 50, 3);
    const after = v.toWorld(300, 50);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    v.zoomAt(200, 100, 1e6);
    expect(v.scale).toBe(MapViewport.MAX_SCALE);
    v.zoomAt(200, 100, 1e-6);
    expect(v.scale).toBeGreaterThan(0.1);
  });

  it('veto liikuttaa karttaa sormen mukana eikä vie rajojen yli', () => {
    const v = new MapViewport(limits);
    v.setSize(400, 200);
    v.scale = 1;
    v.pan(50, -20);
    expect(v.center).toEqual({ x: -50, y: -20 });
    v.pan(1e6, -1e6);
    expect(v.center).toEqual({ x: limits.minX, y: limits.minY });
  });
});

describe('syvyysvyöhykkeet ja mittakaava', () => {
  it('vyöhyke syvyyden mukaan', () => {
    expect(depthBand(0.3)).toBe(0);
    expect(depthBand(1.5)).toBe(1);
    expect(depthBand(5)).toBe(3);
    expect(depthBand(12)).toBe(5);
  });

  it('mittakaavajana on pyöreä ja mahtuu', () => {
    expect(scaleBarMeters(1)).toBe(100);
    expect(scaleBarMeters(0.15)).toBe(500);
    expect(scaleBarMeters(8)).toBe(10);
  });
});
