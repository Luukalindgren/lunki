import { describe, expect, it } from 'vitest';
import {
  START_HOUR,
  TIME_OF_DAY_IDS,
  clockAt,
  daylight,
  formatClock,
  isTimeOfDay,
  moonAt,
  sunAt,
} from './timeOfDay';

const deg = (r: number) => (r * 180) / Math.PI;
/** Kompassisuunta (°, pohjoisesta myötäpäivään) pelin suunnasta. */
const compass = (az: number) => (((90 - deg(az)) % 360) + 360) % 360;

describe('pelikello', () => {
  it('alkaa vuorokaudenajan mukaan ja etenee 12 min kisaminuutissa', () => {
    expect(clockAt('morning', 0)).toBe(START_HOUR.morning);
    expect(clockAt('day', 15 * 60)).toBeCloseTo(START_HOUR.day + 3);
    // Yökisa jatkuu keskiyön yli.
    expect(clockAt('night', 30 * 60)).toBeCloseTo(5);
  });

  it('näyttää kellonajan', () => {
    expect(formatClock(4.75)).toBe('04:45');
    expect(formatClock(23.999)).toBe('23:59');
    expect(formatClock(24.5)).toBe('00:30');
  });
});

describe('aurinko ja kuu Lunkinjärvellä elokuussa', () => {
  it('aurinko nousee idän pohjoispuolelta ja laskee lännen pohjoispuolelle', () => {
    const rise = sunAt(6);
    expect(Math.abs(deg(rise.elevation))).toBeLessThan(3);
    expect(compass(rise.azimuth)).toBeGreaterThan(55);
    expect(compass(rise.azimuth)).toBeLessThan(75);
    const set = sunAt(21);
    expect(Math.abs(deg(set.elevation))).toBeLessThan(3);
    expect(compass(set.azimuth)).toBeGreaterThan(285);
    expect(compass(set.azimuth)).toBeLessThan(305);
  });

  it('keskipäivällä aurinko on etelässä noin 42 asteen korkeudella', () => {
    const noon = sunAt(13.5);
    expect(compass(noon.azimuth)).toBeCloseTo(180, -1);
    expect(deg(noon.elevation)).toBeCloseTo(42, 0);
  });

  it('täysikuu on yöllä etelässä ja päivällä horisontin alla', () => {
    const moon = moonAt(1.5);
    expect(compass(moon.azimuth)).toBeCloseTo(180, -1);
    expect(deg(moon.elevation)).toBeGreaterThan(10);
    expect(moonAt(13).elevation).toBeLessThan(0);
  });

  it('jokaisen kisan alussa aurinko on oikealla kohdalla', () => {
    expect(sunAt(START_HOUR.morning).elevation).toBeLessThan(0);
    expect(deg(sunAt(START_HOUR.day).elevation)).toBeGreaterThan(30);
    const evening = deg(sunAt(START_HOUR.evening).elevation);
    expect(evening).toBeGreaterThan(5);
    expect(evening).toBeLessThan(20);
    expect(sunAt(START_HOUR.night).elevation).toBeLessThan(0);
    expect(moonAt(START_HOUR.night).elevation).toBeGreaterThan(0);
  });
});

describe('päivänvalo', () => {
  it('valo on suurin päivällä ja pienin yöllä', () => {
    expect(daylight(13.5).light).toBeGreaterThan(0.95);
    expect(daylight(1).light).toBeLessThan(0.2);
    expect(daylight(7).light).toBeGreaterThan(daylight(1).light);
    expect(daylight(7).light).toBeLessThan(daylight(13.5).light);
  });

  it('hämärä on auringon noustessa ja laskiessa, ei päivällä eikä yöllä', () => {
    expect(daylight(6).twilight).toBeGreaterThan(0.5);
    expect(daylight(21).twilight).toBeGreaterThan(0.5);
    expect(daylight(13.5).twilight).toBe(0);
    expect(daylight(1.5).twilight).toBe(0);
  });

  it('iltakisassa valo vähenee ja aamukisassa lisääntyy', () => {
    const at = (t: 'morning' | 'evening', min: number) => daylight(clockAt(t, min * 60)).light;
    expect(at('evening', 15)).toBeLessThan(at('evening', 0));
    expect(at('morning', 15)).toBeGreaterThan(at('morning', 0));
  });
});

it('tunnistaa kelvolliset arvot', () => {
  for (const t of TIME_OF_DAY_IDS) expect(isTimeOfDay(t)).toBe(true);
  expect(isTimeOfDay('noon')).toBe(false);
  expect(isTimeOfDay('toString')).toBe(false);
});
