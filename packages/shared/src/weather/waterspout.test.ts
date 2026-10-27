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
  spoutStrength,
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
    const w = spoutWind([spout], 0, { x: 30, y: 0 });
    expect(w.x).toBeLessThan(0);
    expect(spoutWind([spout], 0, { x: SPOUT.radius + 1, y: 0 })).toEqual({ x: 0, y: 0 });
    expect(spoutCapture([spout], 0, { x: 3, y: 0 })!.x).toBeGreaterThan(0);
    expect(spoutCapture([spout], 0, { x: SPOUT.capture + 1, y: 0 })).toBeNull();
  });

  /**
   * Ajaa renkaan puolitoista minuuttia `start` metrin päästä trombista.
   * `flee` = potkut poispäin trombista, pikapotkuin kunnon riittäessä.
   */
  function run(start: number, flee: 'none' | 'kick' | 'sprint', angle = 0): boolean {
    let tube: TubeState = createTube({ x: Math.cos(angle) * start, y: Math.sin(angle) * start });
    const dt = 1 / 60;
    for (let t = 0; t < 90; t += dt) {
      const c = spoutPosition(spout, t);
      if (spoutCapture([spout], t, tube.pos)) return true;
      // Kalastaja katsoo trombia kohti, jolloin potkut vievät poispäin.
      const heading = Math.atan2(c.y - tube.pos.y, c.x - tube.pos.x);
      tube = stepTube(
        { ...tube, heading },
        { kick: flee === 'none' ? 0 : 1, turn: 0, sprint: flee === 'sprint' && tube.stamina > 0.3 },
        dt,
        spoutWind([spout], t, tube.pos),
      );
    }
    return false;
  }
  /** Montako kahdeksasta suunnasta lähteneistä trombi nappasi. */
  const caught = (start: number, flee: 'none' | 'kick' | 'sprint') =>
    [...Array(8).keys()].filter((i) => run(start, flee, (i * Math.PI) / 4)).length;

  it('imee paikallaan ajelehtivan kaukaakin', () => {
    expect(caught(60, 'none')).toBe(8);
    expect(caught(80, 'none')).toBeGreaterThan(0);
  });

  it('vetää lähellä sisään, mutta kauempaa ehtii potkia karkuun', () => {
    expect(caught(12, 'sprint')).toBe(8);
    expect(caught(20, 'kick')).toBe(8);
    expect(caught(45, 'sprint')).toBe(0);
    expect(caught(55, 'kick')).toBe(0);
  });

  it('imu kovenee keskustaa kohti', () => {
    const pull = (d: number) => -spoutPull([spout], 0, { x: d, y: 0 }).x;
    expect(pull(10)).toBeGreaterThan(pull(30));
    expect(pull(30)).toBeGreaterThan(pull(60));
    expect(pull(60)).toBeGreaterThan(0);
    // Lähellä imu voittaa pikapotkut, imualueen reunalla tavalliset potkut.
    expect(pull(15)).toBeGreaterThan(TUBE_PHYSICS.kickAccel * TUBE_PHYSICS.sprintFactor);
    expect(pull(60)).toBeLessThan(TUBE_PHYSICS.kickAccel);
    expect(spoutStrength([spout], 0, { x: 0.5, y: 0 })).toBeCloseTo(1, 1);
    expect(spoutStrength([spout], 0, { x: SPOUT.radius + 1, y: 0 })).toBe(0);
  });

  it('imu tuulena työntää rengasta juuri imun verran', () => {
    const p = { x: 25, y: -10 };
    const w = spoutWind([spout], 0, p);
    const a = spoutPull([spout], 0, p);
    const k = TUBE_PHYSICS.windPush * Math.hypot(w.x, w.y);
    expect(w.x * k).toBeCloseTo(a.x, 6);
    expect(w.y * k).toBeCloseTo(a.y, 6);
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
