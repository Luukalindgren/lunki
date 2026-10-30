import { describe, expect, it } from 'vitest';
import { SEASONS, SEASON_IDS, isPlayableSeason, isSeason, seasonOf } from './season';
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
    expect(clockAt('morning', 0)).toBeCloseTo(START_HOUR.morning);
    expect(clockAt('day', 15 * 60)).toBeCloseTo(START_HOUR.day + 3);
    // Yökisa jatkuu keskiyön yli.
    expect(clockAt('night', 30 * 60)).toBeCloseTo(5.5);
  });

  it('näyttää kellonajan', () => {
    expect(formatClock(4.75)).toBe('04:45');
    expect(formatClock(23.999)).toBe('23:59');
    expect(formatClock(24.5)).toBe('00:30');
  });
});

describe('aurinko ja kuu Lunkinjärvellä', () => {
  it('kesällä aurinko nousee koillisesta ja laskee luoteeseen', () => {
    const rise = sunAt(3.93);
    expect(Math.abs(deg(rise.elevation))).toBeLessThan(3);
    expect(compass(rise.azimuth)).toBeGreaterThan(25);
    expect(compass(rise.azimuth)).toBeLessThan(45);
    const set = sunAt(23);
    expect(Math.abs(deg(set.elevation))).toBeLessThan(3);
    expect(compass(set.azimuth)).toBeGreaterThan(315);
    expect(compass(set.azimuth)).toBeLessThan(335);
  });

  it('kesäyönä aurinko käy vain vähän horisontin alla (yötön yö)', () => {
    let lowest = 90;
    for (let h = 0; h < 24; h += 0.1) lowest = Math.min(lowest, deg(sunAt(h).elevation));
    expect(lowest).toBeGreaterThan(-7);
    expect(lowest).toBeLessThan(-4);
  });

  it('keskipäivällä aurinko on etelässä: kesällä 52°, syksyllä 26°', () => {
    const summer = sunAt(13.4);
    expect(compass(summer.azimuth)).toBeCloseTo(180, -1);
    expect(deg(summer.elevation)).toBeCloseTo(52, 0);
    const autumn = sunAt(13.2, 'autumn');
    expect(compass(autumn.azimuth)).toBeCloseTo(180, -1);
    expect(deg(autumn.elevation)).toBeCloseTo(26, 0);
  });

  it('syksyllä aurinko nousee idästä ja laskee länteen', () => {
    expect(compass(sunAt(7.45, 'autumn').azimuth)).toBeCloseTo(94, -1);
    expect(compass(sunAt(18.98, 'autumn').azimuth)).toBeCloseTo(265, -1);
    expect(Math.abs(deg(sunAt(18.98, 'autumn').elevation))).toBeLessThan(3);
  });

  it('täysikuu on yöllä etelässä ja päivällä horisontin alla', () => {
    const moon = moonAt(1.2, 'autumn');
    expect(compass(moon.azimuth)).toBeCloseTo(180, -1);
    expect(deg(moon.elevation)).toBeGreaterThan(25);
    expect(moonAt(13, 'autumn').elevation).toBeLessThan(0);
  });

  it('jokaisen kisan alussa aurinko on oikealla kohdalla joka kaudella', () => {
    for (const season of SEASON_IDS.filter((s) => SEASONS[s].available)) {
      const start = SEASONS[season].startHour;
      const sun = (h: number) => deg(sunAt(h, season).elevation);
      expect(sun(start.morning)).toBeLessThan(0);
      expect(sun(start.morning)).toBeGreaterThan(-9);
      expect(sun(start.day)).toBeGreaterThan(25);
      expect(sun(start.evening)).toBeGreaterThan(5);
      expect(sun(start.evening)).toBeLessThan(20);
      expect(sun(start.night)).toBeLessThan(0);
      expect(moonAt(start.night, season).elevation).toBeGreaterThan(0);
    }
  });

  it('kesän alkamisajat ovat oletus', () => {
    expect(START_HOUR).toEqual(SEASONS.summer.startHour);
    expect(clockAt('morning', 0, 'autumn')).toBe(SEASONS.autumn.startHour.morning);
  });
});

describe('päivänvalo', () => {
  it('valo on suurin päivällä ja pienin yöllä', () => {
    expect(daylight(13.5).light).toBeGreaterThan(0.95);
    expect(daylight(1).light).toBeLessThan(0.2);
    expect(daylight(6).light).toBeGreaterThan(daylight(1).light);
    expect(daylight(6).light).toBeLessThan(daylight(13.5).light);
  });

  it('hämärä on auringon noustessa ja laskiessa, ei päivällä eikä syksyn yönä', () => {
    expect(daylight(4.5).twilight).toBeGreaterThan(0.5);
    expect(daylight(22.5).twilight).toBeGreaterThan(0.5);
    expect(daylight(13.5).twilight).toBe(0);
    expect(daylight(7.5, 'autumn').twilight).toBeGreaterThan(0.5);
    expect(daylight(1.5, 'autumn').twilight).toBe(0);
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

it('talvi on kausi, mutta ei vielä pelattava', () => {
  for (const s of SEASON_IDS) expect(isSeason(s)).toBe(true);
  expect(isSeason('toString')).toBe(false);
  expect(isPlayableSeason('autumn')).toBe(true);
  expect(isPlayableSeason('winter')).toBe(false);
  expect(seasonOf({ season: 'winter' })).toBe('summer');
  expect(seasonOf({})).toBe('summer');
  expect(seasonOf({ season: 'spring' })).toBe('spring');
});
