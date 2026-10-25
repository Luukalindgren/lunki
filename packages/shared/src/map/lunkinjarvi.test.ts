import { describe, expect, it } from 'vitest';
import {
  START_SHORE_CLEARANCE,
  findLaunchPoint,
  findOpenWaterPoint,
  findStartNear,
  isValidStart,
  signedArea,
} from './geometry';
import { LUNKINJARVI } from './lunkinjarvi';
import { WaterBody } from './waterBody';

describe('Lunkinjärven kartta', () => {
  const water = new WaterBody(LUNKINJARVI);

  it('on järkevän kokoinen ja oikein suunnattu', () => {
    const { minX, maxX, minY, maxY } = LUNKINJARVI.bounds;
    expect(maxX - minX).toBeGreaterThan(1500);
    expect(maxX - minX).toBeLessThan(3000);
    expect(maxY - minY).toBeGreaterThan(700);
    expect(signedArea(LUNKINJARVI.shore)).toBeGreaterThan(0);
    // Ala noin 1–2 km²
    expect(signedArea(LUNKINJARVI.shore) / 1e6).toBeGreaterThan(0.5);
    expect(signedArea(LUNKINJARVI.shore) / 1e6).toBeLessThan(2.5);
  });

  it('löytää avovesipisteen', () => {
    const p = findOpenWaterPoint(water, LUNKINJARVI.bounds);
    expect(water.isWater(p)).toBe(true);
    expect(water.closestShorePoint(p)!.distance).toBeGreaterThan(100);
  });

  it('lähtöpaikka on vedessä lähellä rantaa', () => {
    let seed = 1;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 10; i++) {
      const p = findLaunchPoint(water, LUNKINJARVI.bounds, random);
      expect(water.isWater(p)).toBe(true);
      const d = water.closestShorePoint(p)!.distance;
      expect(d).toBeGreaterThan(14);
      expect(d).toBeLessThan(26);
    }
  });

  it('ranta pysäyttää liikkeen kaikkialla', () => {
    // Liikutaan avovedestä suoraan kohti joka suuntaa; ympyrä ei saa päätyä maalle.
    const start = findOpenWaterPoint(water, LUNKINJARVI.bounds);
    for (let a = 0; a < 16; a++) {
      const dir = { x: Math.cos((a / 16) * Math.PI * 2), y: Math.sin((a / 16) * Math.PI * 2) };
      let p = { ...start };
      for (let i = 0; i < 3000; i++) {
        const next = { x: p.x + dir.x, y: p.y + dir.y };
        p = water.moveCircle(p, next, 1.2)?.position ?? next;
        expect(water.isWater(p)).toBe(true);
      }
    }
  });

  it('satunnaiskävely pysyy vedessä', () => {
    let seed = 12345;
    const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
    let p = findOpenWaterPoint(water, LUNKINJARVI.bounds);
    let angle = 0;
    for (let i = 0; i < 20000; i++) {
      angle += (rand() - 0.5) * 0.6;
      const next = { x: p.x + Math.cos(angle) * 3, y: p.y + Math.sin(angle) * 3 };
      const hit = water.moveCircle(p, next, 1.2);
      p = hit?.position ?? next;
      expect(water.isWater(p)).toBe(true);
      if (hit) angle += Math.PI * rand();
    }
  });

  it('valittu aloituspaikka: vedessä ja irti rannasta, muut lähelle', () => {
    const open = findOpenWaterPoint(water, LUNKINJARVI.bounds);
    expect(isValidStart(water, open)).toBe(true);
    expect(isValidStart(water, { x: LUNKINJARVI.bounds.maxX + 50, y: 0 })).toBe(false);
    const shore = LUNKINJARVI.shore[0]!;
    expect(isValidStart(water, shore)).toBe(false);
    expect(isValidStart(water, { x: NaN, y: 0 })).toBe(false);
    let seed = 3;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 10; i++) {
      const p = findStartNear(water, open, 60, random);
      expect(Math.hypot(p.x - open.x, p.y - open.y)).toBeLessThanOrEqual(60);
      expect(isValidStart(water, p)).toBe(true);
      expect(water.closestShorePoint(p)!.distance).toBeGreaterThanOrEqual(START_SHORE_CLEARANCE);
    }
  });
});
