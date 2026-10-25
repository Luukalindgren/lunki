import { describe, expect, it } from 'vitest';
import { LUNKINJARVI } from '../map/lunkinjarvi';
import { WaterBody } from '../map/waterBody';
import { createTube, stepTube, type TubeState } from '../physics/tube';
import { distance } from '../vec2';
import {
  SPOUT,
  activeSpouts,
  planWaterspouts,
  spoutCapture,
  spoutPosition,
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

  /** Ajaa renkaan minuutin: `flee` = pikapotkut poispäin trombista. */
  function run(start: TubeState, flee: boolean): { caught: boolean; end: number } {
    let tube = start;
    const dt = 1 / 60;
    for (let t = 0; t < 60; t += dt) {
      const c = spoutPosition(spout, t);
      if (spoutCapture([spout], t, tube.pos)) return { caught: true, end: 0 };
      // Kalastaja katsoo trombia kohti, jolloin potkut vievät poispäin.
      const heading = Math.atan2(c.y - tube.pos.y, c.x - tube.pos.x);
      tube = stepTube(
        { ...tube, heading },
        { kick: flee ? 1 : 0, turn: 0, sprint: flee },
        dt,
        spoutWind([spout], t, tube.pos),
      );
    }
    return { caught: false, end: distance(tube.pos, spoutPosition(spout, 60)) };
  }

  it('imee paikallaan olevan, mutta karkuun ehtii', () => {
    const start = createTube({ x: 25, y: 0 });
    expect(run(start, false).caught).toBe(true);
    const fled = run(start, true);
    expect(fled.caught).toBe(false);
    expect(fled.end).toBeGreaterThan(SPOUT.radius);
  });
});
