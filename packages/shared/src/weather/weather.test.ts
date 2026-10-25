import { describe, expect, it } from 'vitest';
import {
  SKY_EFFECTS,
  WEATHER,
  WEATHER_LEVEL_IDS,
  planWeather,
  weatherAt,
  type WeatherLevel,
} from './weather';

const RACE = 30 * 60;

/** Ukkosen ja myrskyn osuus kisa-ajasta monella siemenellä. */
function roughShare(level: WeatherLevel): number {
  let rough = 0;
  let total = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const plan = planWeather(seed, level, RACE);
    for (let t = 0; t < RACE; t += 10) {
      const sky = weatherAt(plan, t).sky;
      if (sky === 'thunder' || sky === 'storm') rough++;
      total++;
    }
  }
  return rough / total;
}

describe('sää', () => {
  it('sama siemen tuottaa saman sään', () => {
    expect(planWeather(42, 'some', RACE)).toEqual(planWeather(42, 'some', RACE));
    expect(planWeather(42, 'some', RACE)).not.toEqual(planWeather(43, 'some', RACE));
  });

  it('säätasot eroavat selvästi', () => {
    const shares = (['realistic', 'some', 'lots', 'chaos'] as const).map(roughShare);
    expect(shares[0]).toBeLessThan(0.1);
    for (let i = 1; i < shares.length; i++) expect(shares[i]).toBeGreaterThan(shares[i - 1]! * 1.3);
    expect(shares[3]).toBeGreaterThan(0.4);
  });

  it('tyyni taso pysyy tyynenä', () => {
    const plan = planWeather(7, 'calm', RACE);
    expect(plan.segments).toHaveLength(1);
    expect(weatherAt(plan, 1000).sky).toBe('calm');
    expect(weatherAt(plan, 1000).windSpeed).toBe(0);
  });

  it('tilat kestävät vähintään minimiajan ja tuuli on tilan rajoissa', () => {
    for (const level of WEATHER_LEVEL_IDS) {
      const { segments } = planWeather(5, level, RACE);
      segments.forEach((s, i) => {
        const [lo, hi] = SKY_EFFECTS[s.sky].wind;
        expect(s.windSpeed).toBeGreaterThanOrEqual(lo);
        expect(s.windSpeed).toBeLessThanOrEqual(hi);
        if (i > 0)
          expect(s.start - segments[i - 1]!.start).toBeGreaterThanOrEqual(
            WEATHER.minSegment - 1e-6,
          );
      });
    }
  });

  it('muutoksesta varoitetaan etukäteen ja siirtymä on liukuva', () => {
    // Etsitään siirtymä ukkoseen.
    for (let seed = 1; seed < 100; seed++) {
      const plan = planWeather(seed, 'lots', RACE);
      const i = plan.segments.findIndex(
        (s, j) =>
          j > 0 && s.sky === 'thunder' && SKY_EFFECTS[plan.segments[j - 1]!.sky].severity < 3,
      );
      if (i < 0) continue;
      const at = plan.segments[i]!.start;
      const before = weatherAt(plan, at - WEATHER.warning - 1);
      const warned = weatherAt(plan, at - 10);
      const after = weatherAt(plan, at + 1);
      expect(before.warnings).not.toContain('rumble');
      expect(warned.warnings).toContain('rumble');
      expect(warned.next).toBe('thunder');
      expect(warned.darkness).toBeGreaterThan(before.darkness);
      expect(warned.darkness).toBeLessThanOrEqual(after.darkness + 1e-9);
      expect(after.sky).toBe('thunder');
      return;
    }
    throw new Error('ei siirtymää ukkoseen');
  });
});
