import { describe, expect, it } from 'vitest';
import { LOOKS, SkyView, lookAt } from './skyView';

const calm = { x: 0, y: 0 };

describe('vuorokaudenajan ilme', () => {
  it('taivas tummuu zeniittiä kohti ja pilvisyys on 0–1', () => {
    const luma = (hex: number) => ((hex >> 16) & 0xff) * 0.3 + ((hex >> 8) & 0xff) * 0.59;
    for (const [, look] of LOOKS) {
      expect(luma(look.zenith)).toBeLessThan(luma(look.horizon));
      expect(look.clouds).toBeGreaterThanOrEqual(0);
      expect(look.clouds).toBeLessThanOrEqual(1);
    }
  });

  it('hetket ovat kellonajan mukaan järjestyksessä ja vuorokausi sulkeutuu', () => {
    for (let i = 1; i < LOOKS.length; i++) expect(LOOKS[i]![0]).toBeGreaterThan(LOOKS[i - 1]![0]);
    expect(LOOKS[0]![0]).toBe(0);
    expect(LOOKS[LOOKS.length - 1]![0]).toBe(24);
    expect(lookAt(24.5)).toEqual(lookAt(0.5));
  });

  it('ilme liukuu kultaisesta tunnista auringonlaskuun', () => {
    const golden = lookAt(19);
    const sunset = lookAt(20.9);
    const between = lookAt(20);
    expect(between.mul[1]).toBeLessThan(golden.mul[1]);
    expect(between.mul[1]).toBeGreaterThan(sunset.mul[1]);
  });

  it('kultainen tunti on kellertävän ruskea: punaista lisää, sinistä vähemmän', () => {
    const golden = lookAt(19);
    expect(golden.mul[0]).toBeGreaterThan(1.1);
    expect(golden.mul[2]).toBeLessThan(golden.mul[1]);
    expect(golden.add[0]).toBeGreaterThan(golden.add[2]);
  });

  it('päivällä paletti pysyy ennallaan', () => {
    const sky = new SkyView();
    sky.update(13, 0, 0, calm);
    expect(sky.grade.mul.toArray()).toEqual([1, 1, 1]);
    expect(sky.grade.add.toArray()).toEqual([0, 0, 0]);
    expect(sky.grade.sat).toBe(1);
  });

  it('yöllä paletti tummuu, mutta salama valaisee hetkeksi', () => {
    const sky = new SkyView();
    sky.update(1, 0, 0, calm);
    expect(sky.grade.mul.y).toBeLessThan(0.7);
    sky.update(1, 0, 1, calm);
    expect(sky.grade.mul.y).toBeGreaterThan(1);
    // Kaukainen salama (heikompi välähdys) ei muuta yötä päiväksi.
    sky.update(1, 0, 0.3, calm);
    expect(sky.grade.mul.y).toBeLessThan(1);
  });

  it('pilvisyys himmentää kuvan ja pilvinen yötaivas on tumma', () => {
    const sky = new SkyView();
    sky.update(12, 0, 0, calm);
    const clear = sky.grade.mul.y;
    sky.update(12, 0.75, 0, calm);
    expect(sky.grade.mul.y).toBeLessThan(clear * 0.75);
    expect(sky.grade.sat).toBeLessThan(1);
    const day = sky.lighting.horizon.r;
    sky.update(1, 0.35, 0, calm);
    expect(sky.lighting.horizon.r).toBeLessThan(day * 0.3);
  });

  it('aamulla on usvaa, joka hälvenee tuulessa', () => {
    const sky = new SkyView();
    sky.update(4.75, 0, 0, calm);
    expect(sky.mist).toBeGreaterThan(0.9);
    sky.update(4.75, 0, 0, { x: 9, y: 0 });
    expect(sky.mist).toBe(0);
  });

  it('matala aurinko kimaltaa vedessä, paksu pilvi peittää sen', () => {
    const sky = new SkyView();
    sky.update(20.5, 0, 0, calm);
    expect(sky.glitter.amount).toBeGreaterThan(0);
    sky.update(20.5, 0.75, 0, calm);
    expect(sky.glitter.amount).toBe(0);
  });

  it('yöllä kimaltaa kuu, keskipäivällä ei mikään', () => {
    const sky = new SkyView();
    sky.update(1.5, 0, 0, calm);
    expect(sky.glitter.amount).toBeGreaterThan(0);
    expect(sky.glitter.dir.y).toBeGreaterThan(0);
    sky.update(13.5, 0, 0, calm);
    expect(sky.glitter.amount).toBe(0);
  });
});
