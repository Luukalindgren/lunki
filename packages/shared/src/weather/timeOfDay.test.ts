import { describe, expect, it } from 'vitest';
import { TIME_OF_DAY_IDS, daylight, isTimeOfDay, moonAt, sunAt } from './timeOfDay';

describe('vuorokaudenaika', () => {
  it('aamulla aurinko nousee ja illalla laskee kisan aikana', () => {
    expect(sunAt('morning', 0).elevation).toBeLessThan(0);
    expect(sunAt('morning', 1).elevation).toBeGreaterThan(0);
    expect(sunAt('evening', 0).elevation).toBeGreaterThan(0);
    expect(sunAt('evening', 1).elevation).toBeLessThan(0);
  });

  it('valo on suurin päivällä ja pienin yöllä', () => {
    const light = (t: (typeof TIME_OF_DAY_IDS)[number]) => daylight(t, 0.5).light;
    expect(light('day')).toBeGreaterThan(0.95);
    expect(light('night')).toBeLessThan(0.2);
    expect(light('morning')).toBeGreaterThan(light('night'));
    expect(light('morning')).toBeLessThan(light('day'));
    expect(light('evening')).toBeLessThan(light('day'));
  });

  it('hämärä on aamulla ja illalla, ei päivällä', () => {
    expect(daylight('morning', 0.2).twilight).toBeGreaterThan(0.5);
    expect(daylight('evening', 0.8).twilight).toBeGreaterThan(0.5);
    expect(daylight('day', 0.5).twilight).toBe(0);
    expect(daylight('night', 0.5).twilight).toBe(0);
  });

  it('iltakisassa valo vähenee ja aamukisassa lisääntyy', () => {
    expect(daylight('evening', 1).light).toBeLessThan(daylight('evening', 0).light);
    expect(daylight('morning', 1).light).toBeGreaterThan(daylight('morning', 0).light);
  });

  it('kuu on taivaalla vain yöllä', () => {
    expect(moonAt('night', 0.5)!.elevation).toBeGreaterThan(0);
    expect(moonAt('day', 0.5)).toBeNull();
  });

  it('tunnistaa kelvolliset arvot', () => {
    for (const t of TIME_OF_DAY_IDS) expect(isTimeOfDay(t)).toBe(true);
    expect(isTimeOfDay('noon')).toBe(false);
    expect(isTimeOfDay('toString')).toBe(false);
  });
});
