import { describe, expect, it } from 'vitest';
import { TIME_OF_DAY_IDS } from '@lunki/shared';
import { LOOKS, SkyView, lookAt } from './skyView';

describe('vuorokaudenajan ilme', () => {
  it('taivas tummuu zeniittiä kohti ja pilvisyys on 0–1', () => {
    const luma = (hex: number) => ((hex >> 16) & 0xff) * 0.3 + ((hex >> 8) & 0xff) * 0.59;
    for (const time of TIME_OF_DAY_IDS)
      for (const [, look] of LOOKS[time]) {
        expect(luma(look.zenith)).toBeLessThan(luma(look.horizon));
        expect(look.clouds).toBeGreaterThanOrEqual(0);
        expect(look.clouds).toBeLessThanOrEqual(1);
      }
  });

  it('ilme liukuu hetkestä toiseen', () => {
    const start = lookAt('evening', 0);
    const end = lookAt('evening', 1);
    const mid = lookAt('evening', 0.3);
    expect(mid.mul[1]).toBeLessThan(start.mul[1]);
    expect(mid.mul[1]).toBeGreaterThan(end.mul[1]);
    expect(lookAt('evening', 2)).toEqual(end);
  });

  it('päivällä paletti pysyy ennallaan', () => {
    const sky = new SkyView('day');
    sky.update(0.5, 0, 0, { x: 0, y: 0 });
    expect(sky.grade.mul.toArray()).toEqual([1, 1, 1]);
    expect(sky.grade.add.toArray()).toEqual([0, 0, 0]);
    expect(sky.grade.sat).toBe(1);
  });

  it('yöllä paletti tummuu, mutta salama valaisee hetkeksi', () => {
    const sky = new SkyView('night');
    sky.update(0.5, 0, 0, { x: 0, y: 0 });
    expect(sky.grade.mul.y).toBeLessThan(0.7);
    sky.update(0.5, 0, 1, { x: 0, y: 0 });
    expect(sky.grade.mul.y).toBe(1);
  });

  it('aamulla on usvaa, joka hälvenee tuulessa', () => {
    const sky = new SkyView('morning');
    sky.update(0, 0, 0, { x: 0, y: 0 });
    expect(sky.mist).toBeGreaterThan(0.9);
    sky.update(0, 0, 0, { x: 9, y: 0 });
    expect(sky.mist).toBe(0);
  });

  it('paksu pilvi peittää auringon hehkun ja kimalluksen', () => {
    const sky = new SkyView('evening');
    sky.update(0.5, 0, 0, { x: 0, y: 0 });
    expect(sky.glitter.amount).toBeGreaterThan(0);
    sky.update(0.5, 0.75, 0, { x: 0, y: 0 });
    expect(sky.glitter.amount).toBe(0);
  });
});
