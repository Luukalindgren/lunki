import { describe, expect, it } from 'vitest';
import { SKY_EFFECTS, weatherAt, type WeatherPlan } from '@lunki/shared';
import { FRONT, frontWeather, stormFront } from './stormFront';

// Tuuli puhaltaa itään, joten rintama tulee lännestä.
const plan: WeatherPlan = {
  level: 'realistic',
  segments: [
    { start: 0, sky: 'calm', windSpeed: 1, windDir: 0 },
    { start: 300, sky: 'thunder', windSpeed: 7, windDir: 0 },
    { start: 600, sky: 'rain', windSpeed: 5, windDir: 0 },
  ],
};
const at = (t: number) => {
  const now = weatherAt(plan, t);
  const front = stormFront(plan, t, now);
  return { now, front, shown: frontWeather(now, front) };
};

describe('ukkosrintama', () => {
  it('nousee tuulen yläpuolelta ennakkoajan alussa', () => {
    expect(at(300 - FRONT.time - 1).front).toBeNull();
    const { front } = at(300 - FRONT.time + 1);
    expect(front).not.toBeNull();
    expect(front!.dir.x).toBeCloseTo(-1);
    expect(front!.dir.y).toBeCloseTo(0);
    expect(front!.thunder).toBe(true);
  });

  it('lähestyy ja ohittaa kalastajan ennen säämuutosta', () => {
    expect(at(240).front!.distance).toBeCloseTo(FRONT.speed * (60 - FRONT.pass));
    expect(at(300 - FRONT.pass).front!.distance).toBeCloseTo(0);
    expect(at(299).front!.distance).toBeLessThan(0);
  });

  it('sade ja synkkyys alkavat vasta reunan kohdalla', () => {
    const before = at(250).shown;
    expect(before.rain).toBe(SKY_EFFECTS.calm.rain);
    expect(before.darkness).toBeLessThan(SKY_EFFECTS.thunder.darkness);
    // Kaukana rintama ei vielä hämärrä.
    expect(at(185).shown.darkness).toBe(SKY_EFFECTS.calm.darkness);
    const passed = at(299).shown;
    expect(passed.rain).toBeCloseTo(SKY_EFFECTS.thunder.rain);
    expect(passed.darkness).toBeCloseTo(SKY_EFFECTS.thunder.darkness);
  });

  it('jatkuu saumatta uuteen säähän', () => {
    const last = at(299.99).shown;
    const next = weatherAt(plan, 300);
    expect(last.darkness).toBeCloseTo(next.darkness, 2);
    expect(last.rain).toBeCloseTo(next.rain, 2);
  });

  it('ei tule, kun taivas kirkastuu', () => {
    expect(at(550).front).toBeNull();
    const { now, shown } = at(580);
    expect(shown).toEqual({ darkness: now.darkness, rain: now.rain });
  });
});
