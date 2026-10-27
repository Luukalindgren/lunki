import { describe, expect, it } from 'vitest';
import { LUNKINJARVI } from '../map/lunkinjarvi';
import { WaterBody } from '../map/waterBody';
import { TUBE_PHYSICS, createTube, stepTube, type TubeState } from '../physics/tube';
import { distance } from '../vec2';
import {
  SPOUT,
  activeSpouts,
  flightPosition,
  planWaterspouts,
  spoutCapture,
  spoutLanding,
  spoutPosition,
  spoutPull,
  spoutWind,
  type Waterspout,
} from './waterspout';
import { planWeather, weatherAt, type WeatherLevel } from './weather';

const water = new WaterBody(LUNKINJARVI);
const { bounds } = LUNKINJARVI;
const plan = (seed: number, level: WeatherLevel) =>
  planWaterspouts(planWeather(seed, level, 1800), seed, 1800, water, bounds);

describe('trombi', () => {
  it('esiintyy vain sallituilla säätasoilla, ja kaaoksessa useimmin', () => {
    const count = (level: WeatherLevel) => {
      let n = 0;
      for (let seed = 1; seed <= 60; seed++) n += plan(seed, level).length;
      return n;
    };
    expect(count('calm')).toBe(0);
    expect(count('realistic')).toBe(0);
    const some = count('some');
    const chaos = count('chaos');
    expect(some).toBeGreaterThan(0);
    expect(chaos).toBeGreaterThan(some * 2);
  });

  it('syntyy ukkosella tai myrskyllä ja pysyy vedessä', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const weather = planWeather(seed, 'chaos', 1800);
      const spouts = planWaterspouts(weather, seed, 1800, water, bounds);
      expect(planWaterspouts(weather, seed, 1800, water, bounds)).toEqual(spouts);
      for (const s of spouts) {
        expect(['thunder', 'storm']).toContain(weatherAt(weather, s.t0).sky);
        for (let t = s.t0; t < s.t1; t += 2) expect(water.isWater(spoutPosition(s, t))).toBe(true);
        expect(activeSpouts(spouts, s.t1)).not.toContainEqual(spoutPosition(s, s.t1));
      }
    }
  });

  const spout: Waterspout = { t0: 0, t1: 1000, start: { x: 0, y: 0 }, dir: Math.PI / 2 };

  it('imee keskustaa kohti vain imualueella', () => {
    const w = spoutWind({ x: 0, y: 0 }, [spout], 0, { x: 30, y: 0 });
    expect(w.x).toBeLessThan(0);
    const calm = { x: 0, y: 0 };
    expect(spoutWind(calm, [spout], 0, { x: SPOUT.radius + 1, y: 0 })).toEqual(calm);
    expect(spoutCapture([spout], 0, { x: 3, y: 0 })!.x).toBeGreaterThan(0);
    expect(spoutCapture([spout], 0, { x: SPOUT.capture + 1, y: 0 })).toBeNull();
  });

  it('imu voimistuu keskustaa kohti ja vetää lähellä potkuja kovemmin', () => {
    const pull = (d: number) => -spoutPull([spout], 0, { x: d, y: 0 }).x;
    expect(pull(70)).toBeLessThan(pull(50));
    expect(pull(50)).toBeLessThan(pull(30));
    expect(pull(30)).toBeLessThan(pull(10));
    // Reunalla potkut voittavat selvästi, lähellä eivät pikapotkutkaan.
    expect(pull(60)).toBeLessThan(TUBE_PHYSICS.kickAccel / 2);
    expect(pull(10)).toBeGreaterThan(TUBE_PHYSICS.kickAccel * TUBE_PHYSICS.sprintFactor);
  });

  it('imu lisätään sään tuulen työntöön sen voimakkuudesta riippumatta', () => {
    const p = { x: 30, y: 0 };
    const push = (w: { x: number; y: number }) => {
      const k = TUBE_PHYSICS.windPush * Math.hypot(w.x, w.y);
      return { x: w.x * k, y: w.y * k };
    };
    const pull = spoutPull([spout], 0, p);
    for (const base of [
      { x: 0, y: 0 },
      { x: 15, y: 0 },
      { x: -8, y: 12 },
    ]) {
      const got = push(spoutWind(base, [spout], 0, p));
      const want = push(base);
      expect(got.x).toBeCloseTo(want.x + pull.x, 6);
      expect(got.y).toBeCloseTo(want.y + pull.y, 6);
    }
  });

  /**
   * Ajaa rengasta kaksi minuuttia trombin sivulta (itä), kun trombi kulkee
   * pohjoiseen: `rest` = lepää, `kick` = potkii poispäin, `sprint` = pikapotkut
   * niin kauan kuin kunto riittää.
   */
  function run(d0: number, mode: 'rest' | 'kick' | 'sprint', from = 0): boolean {
    let tube: TubeState = createTube({ x: Math.cos(from) * d0, y: Math.sin(from) * d0 });
    const dt = 1 / 60;
    for (let t = 0; t < 120; t += dt) {
      const c = spoutPosition(spout, t);
      if (spoutCapture([spout], t, tube.pos)) return true;
      if (distance(tube.pos, c) > SPOUT.radius + 5) return false;
      // Kalastaja katsoo trombia kohti, jolloin potkut vievät poispäin.
      const heading = Math.atan2(c.y - tube.pos.y, c.x - tube.pos.x);
      tube = stepTube(
        { ...tube, heading },
        { kick: mode === 'rest' ? 0 : 1, turn: 0, sprint: mode === 'sprint' && tube.stamina > 0 },
        dt,
        spoutWind({ x: 0, y: 0 }, [spout], t, tube.pos),
      );
    }
    return false;
  }

  it('imee paikallaan olevan kaukaakin, ja lähellä potkiminen ei enää auta', () => {
    expect(run(60, 'rest')).toBe(true);
    expect(run(25, 'kick')).toBe(false);
    expect(run(15, 'kick')).toBe(true);
    expect(run(15, 'sprint')).toBe(false);
    expect(run(10, 'sprint')).toBe(true);
    // Trombin edestä karkuun pääsee vain kauempaa.
    expect(run(30, 'sprint', Math.PI / 2)).toBe(true);
    expect(run(50, 'kick', Math.PI / 2)).toBe(false);
  });

  it('lennättää renkaan selälle 120–320 m päähän, poispäin trombista', () => {
    const lake = new WaterBody(LUNKINJARVI);
    let seed = 3;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const from = { x: -200, y: 200 };
    for (let i = 0; i < 20; i++) {
      const to = spoutLanding(from, { x: 4, y: 0 }, lake, rand)!;
      expect(to).not.toBeNull();
      expect(lake.isWater(to)).toBe(true);
      expect(lake.closestShorePoint(to, SPOUT.landingShore)).toBeNull();
      const d = distance(from, to);
      expect(d).toBeGreaterThan(SPOUT.minFlight * 0.2);
      expect(d).toBeLessThanOrEqual(SPOUT.maxFlight);
    }
    // Toisen trombin kohdalle ei laskeuduta.
    const spot = { x: -50, y: 200 };
    for (let i = 0; i < 20; i++) {
      const to = spoutLanding(from, { x: 4, y: 0 }, lake, rand, [spot]);
      if (to) expect(distance(to, spot)).toBeGreaterThan(SPOUT.radius);
    }
  });

  it('lento nousee ilmaan ja laskeutuu perille', () => {
    const f = { from: { x: 0, y: 0 }, to: { x: 200, y: 0 } };
    expect(flightPosition(f, 0)).toEqual({ pos: { x: 0, y: 0 }, height: 0 });
    const mid = flightPosition(f, 0.5);
    expect(mid.height).toBeGreaterThan(SPOUT.flightHeight * 0.8);
    expect(mid.pos.x).toBeCloseTo(100);
    const end = flightPosition(f, 1);
    expect(end.pos.x).toBeCloseTo(200);
    expect(end.height).toBeCloseTo(0);
  });
});
