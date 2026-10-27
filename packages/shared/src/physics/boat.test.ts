import { describe, expect, it } from 'vitest';
import { BIG_WAVE, boatCapsizes } from '../weather/bigWaves';
import {
  BOAT_PHYSICS,
  BoatSeat,
  CRAFTS,
  SEAT_OFFSET,
  passengerInput,
  rowerInput,
  seatPos,
} from './boat';
import { TUBE_PHYSICS, createTube, stepTube, type TubeState } from './tube';

const DT = 1 / 60;

/** Huippunopeus jatkuvalla soudulla tai potkuilla (m/s). */
function topSpeed(physics = TUBE_PHYSICS, seconds = 60): number {
  let s: TubeState = createTube({ x: 0, y: 0 }, 0);
  let best = 0;
  for (let i = 0; i < seconds * 60; i++) {
    s = stepTube(s, { kick: 1, turn: 0, sprint: false }, DT, undefined, 1, physics);
    if (i > (seconds - 10) * 60) best = Math.max(best, Math.hypot(s.vel.x, s.vel.y));
  }
  return best;
}

describe('vene (#263)', () => {
  it('soutaen vene kulkee hieman rengasta nopeammin ja keula edellä', () => {
    const tube = topSpeed();
    const boat = topSpeed(BOAT_PHYSICS);
    expect(boat / tube).toBeGreaterThan(1.1);
    expect(boat / tube).toBeLessThan(1.6);
    // Soutaja katsoo perään (heading 0 = itään), joten vene kulkee länteen.
    let s = createTube({ x: 0, y: 0 }, 0);
    for (let i = 0; i < 120; i++)
      s = stepTube(s, { kick: 1, turn: 0, sprint: false }, DT, undefined, 1, BOAT_PHYSICS);
    expect(s.pos.x).toBeLessThan(-0.5);
  });

  it('vene liukuu airovetojen jälkeen pidemmälle kuin rengas', () => {
    const glide = (physics: typeof BOAT_PHYSICS) => {
      let s = { ...createTube({ x: 0, y: 0 }, 0), vel: { x: -1.5, y: 0 } };
      for (let i = 0; i < 300; i++)
        s = stepTube(s, { kick: 0, turn: 0, sprint: false }, DT, undefined, 1, physics);
      return -s.pos.x;
    };
    expect(glide(BOAT_PHYSICS)).toBeGreaterThan(glide(TUBE_PHYSICS) * 1.3);
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

  it('aluksen säde ja liike kisan lajin mukaan', () => {
    expect(CRAFTS.boat.radius).toBeGreaterThan(CRAFTS.tube.radius);
    expect(CRAFTS.tube.physics).toBe(TUBE_PHYSICS);
  });
});
