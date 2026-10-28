import { describe, expect, it } from 'vitest';
import { LUNKINJARVI } from '../map/lunkinjarvi';
import { findLaunchPoint } from '../map/geometry';
import { WaterBody } from '../map/waterBody';
import { stepPlayerTube } from '../net/tubeSync';
import { Rng } from '../rng';
import { BIG_WAVE, boatCapsizes } from '../weather/bigWaves';
import {
  BOAT_PHYSICS,
  BoatSeat,
  CRAFTS,
  SEAT_OFFSET,
  SWIVEL_RATE,
  craftCircles,
  passengerInput,
  rowerInput,
  seatPos,
  stepSwivel,
} from './boat';
import { TUBE_PHYSICS, createTube, stepTube, type CraftPhysics, type TubeState } from './tube';

const DT = 1 / 60;

/** Huippunopeus jatkuvalla soudulla tai potkuilla (m/s). */
function topSpeed(physics: CraftPhysics = TUBE_PHYSICS, seconds = 60): number {
  let s: TubeState = createTube({ x: 0, y: 0 }, 0);
  let best = 0;
  for (let i = 0; i < seconds * 60; i++) {
    s = stepTube(s, { kick: 1, turn: 0, sprint: false }, DT, undefined, 1, physics);
    if (i > (seconds - 10) * 60) best = Math.max(best, Math.hypot(s.vel.x, s.vel.y));
  }
  return best;
}

/** Vauhti (m/s) näin monen sekunnin soudun tai potkimisen jälkeen levosta. */
function speedAfter(physics: CraftPhysics, seconds: number): number {
  let s: TubeState = createTube({ x: 0, y: 0 }, 0);
  for (let i = 0; i < seconds * 60; i++)
    s = stepTube(s, { kick: 1, turn: 0, sprint: false }, DT, undefined, 1, physics);
  return Math.hypot(s.vel.x, s.vel.y);
}

describe('vene (#263)', () => {
  it('soutaen vene kulkee rengasta nopeammin ja keula edellä', () => {
    const tube = topSpeed();
    const boat = topSpeed(BOAT_PHYSICS);
    expect(boat / tube).toBeGreaterThan(1.4);
    expect(boat / tube).toBeLessThan(1.7);
    // Soutaja katsoo perään (heading 0 = itään), joten vene kulkee länteen.
    let s = createTube({ x: 0, y: 0 }, 0);
    for (let i = 0; i < 120; i++)
      s = stepTube(s, { kick: 1, turn: 0, sprint: false }, DT, undefined, 1, BOAT_PHYSICS);
    expect(s.pos.x).toBeLessThan(-0.5);
  });

  it('vene kiihtyy rengasta hitaammin', () => {
    // Parin sekunnin päästä rengas on jo lähes täydessä vauhdissa, vene vasta lähdössä.
    expect(speedAfter(BOAT_PHYSICS, 1)).toBeLessThan(speedAfter(TUBE_PHYSICS, 1) * 0.8);
    expect(speedAfter(BOAT_PHYSICS, 2)).toBeLessThan(speedAfter(TUBE_PHYSICS, 2) * 0.8);
    expect(speedAfter(BOAT_PHYSICS, 2) / topSpeed(BOAT_PHYSICS)).toBeLessThan(0.55);
    // Vähän pidemmän soudun jälkeen vene kulkee jo rengasta kovempaa.
    expect(speedAfter(BOAT_PHYSICS, 8)).toBeGreaterThan(topSpeed(TUBE_PHYSICS));
  });

  it('vene liukuu airovetojen jälkeen pidemmälle kuin rengas', () => {
    const glide = (physics: CraftPhysics) => {
      let s = { ...createTube({ x: 0, y: 0 }, 0), vel: { x: -1.5, y: 0 } };
      for (let i = 0; i < 300; i++)
        s = stepTube(s, { kick: 0, turn: 0, sprint: false }, DT, undefined, 1, physics);
      return -s.pos.x;
    };
    expect(glide(BOAT_PHYSICS)).toBeGreaterThan(glide(TUBE_PHYSICS) * 1.6);
  });

  it('keula ja perä eivät työnny rantaan', () => {
    const water = new WaterBody(LUNKINJARVI);
    const rng = new Rng(7);
    for (let n = 0; n < 6; n++) {
      const start = findLaunchPoint(water, LUNKINJARVI.bounds, () => rng.next());
      const shore = water.closestShorePoint(start)!.point;
      // Soutaja selkä rantaan: veto vie keulan suoraan rantaan, sitten perä edellä takaisin.
      let s = createTube(start, Math.atan2(start.y - shore.y, start.x - shore.x));
      for (let i = 0; i < 60 * 30; i++) {
        const kick = i < 60 * 20 ? 1 : -1;
        s = stepPlayerTube(
          s,
          { kick, turn: i % 300 < 60 ? 1 : 0, sprint: true },
          water,
          DT,
          undefined,
          CRAFTS.boat,
        );
        for (const c of craftCircles(s, CRAFTS.boat)) {
          expect(water.isWater(c)).toBe(true);
          expect(water.closestShorePoint(c, c.r)?.distance ?? c.r).toBeGreaterThan(c.r * 0.85);
        }
      }
    }
  });

  it('soutaja kääntyy tuhdolla kalastaessaan ja takaisin airoihin soutaessaan', () => {
    let look = 0;
    for (let i = 0; i < 60; i++) look = stepSwivel(look, 1, false, DT);
    expect(look).toBeCloseTo(SWIVEL_RATE, 6);
    for (let i = 0; i < 30; i++) look = stepSwivel(look, 0, true, DT);
    expect(look).toBeCloseTo(0, 9);
    // Kalastaessa voi kääntyä ympäri; kulma pysyy välillä ±π.
    for (let i = 0; i < 300; i++) look = stepSwivel(look, -1, false, DT);
    expect(Math.abs(look)).toBeLessThanOrEqual(Math.PI);
  });

  it('paikat: perä soutajan edessä, keula selän takana', () => {
    const boat = { pos: { x: 10, y: 5 }, heading: Math.PI / 2 };
    expect(seatPos(boat, BoatSeat.rower)).toEqual({ x: 10, y: 5 });
    const stern = seatPos(boat, BoatSeat.stern);
    const bow = seatPos(boat, BoatSeat.bow);
    expect(stern.x).toBeCloseTo(10);
    expect(stern.y).toBeCloseTo(5 + SEAT_OFFSET);
    expect(bow.y).toBeCloseTo(5 - SEAT_OFFSET);
  });

  it('matkustaja vain kääntyy, ja kalastava soutaja ei soua', () => {
    const row = { kick: 1, turn: -1, sprint: true };
    expect(passengerInput(row)).toEqual({ kick: 0, turn: -1, sprint: false });
    expect(rowerInput(row, false)).toBe(row);
    expect(rowerInput(row, true)).toEqual({ kick: 0, turn: 0, sprint: false });
  });

  it('vene kaatuu vain korkeasta aallosta kyljen puolelta', () => {
    const high = BIG_WAVE.capsizeHeight * 2.5;
    // Aalto kulkee itään (0): kylki aaltoon = heading pohjoiseen.
    expect(boatCapsizes(Math.PI / 2, 0, high)).toBe(true);
    expect(boatCapsizes(0, 0, high)).toBe(false);
    expect(boatCapsizes(Math.PI, 0, high)).toBe(false);
    // Rengas kaatuisi tästä aallosta, vene ei.
    expect(boatCapsizes(Math.PI / 2, 0, BIG_WAVE.capsizeHeight * 1.2)).toBe(false);
  });

  it('aluksen runko ja liike lajin mukaan', () => {
    expect(CRAFTS.boat.radius).toBeGreaterThan(CRAFTS.tube.radius);
    expect(CRAFTS.boat.mass).toBeGreaterThan(CRAFTS.tube.mass);
    expect(CRAFTS.tube.physics).toBe(TUBE_PHYSICS);
    // Rungon ympyrät peittävät veneen keulasta perään.
    const hull = craftCircles({ pos: { x: 0, y: 0 }, heading: 0 }, CRAFTS.boat);
    expect(Math.max(...hull.map((c) => c.x + c.r))).toBeGreaterThan(1.5);
    expect(Math.min(...hull.map((c) => c.x - c.r))).toBeLessThan(-1.7);
  });
});
