import { describe, expect, it } from 'vitest';
import { WaterBody } from '../map/waterBody';
import type { LakeMap } from '../map/types';
import {
  collideTubeWithShore,
  createTube,
  stepTube,
  wrapAngle,
  type TubeInput,
  type TubeState,
} from './tube';

const DT = 1 / 60;
const idle: TubeInput = { kick: 0, turn: 0, sprint: false };
const kick: TubeInput = { kick: 1, turn: 0, sprint: false };

function run(s: TubeState, input: TubeInput, seconds: number): TubeState {
  for (let i = 0; i < Math.round(seconds / DT); i++) s = stepTube(s, input, DT);
  return s;
}

const speed = (s: TubeState) => Math.hypot(s.vel.x, s.vel.y);

describe('stepTube', () => {
  it('on deterministinen', () => {
    const a = run(createTube({ x: 0, y: 0 }), { kick: 1, turn: 0.3, sprint: false }, 10);
    const b = run(createTube({ x: 0, y: 0 }), { kick: 1, turn: 0.3, sprint: false }, 10);
    expect(a).toEqual(b);
  });

  it('potkiessa liikutaan selkä edellä', () => {
    // Katse pohjoiseen → liike etelään
    const s = run(createTube({ x: 0, y: 0 }, Math.PI / 2), kick, 5);
    expect(s.pos.y).toBeLessThan(-3);
    expect(Math.abs(s.pos.x)).toBeLessThan(1e-9);
  });

  it('huippunopeus on kelluntarenkaalle sopiva', () => {
    const cruise = speed(run(createTube({ x: 0, y: 0 }), kick, 30));
    expect(cruise).toBeGreaterThan(1.2);
    expect(cruise).toBeLessThan(2.5);
    const sprint = speed(run(createTube({ x: 0, y: 0 }), { ...kick, sprint: true }, 30));
    expect(sprint).toBeGreaterThan(cruise * 1.3);
    expect(sprint).toBeLessThan(4);
  });

  it('eteenpäin meloessa ollaan hitaampia', () => {
    const fwd = speed(run(createTube({ x: 0, y: 0 }), { ...kick, kick: -1 }, 30));
    const back = speed(run(createTube({ x: 0, y: 0 }), kick, 30));
    expect(fwd).toBeLessThan(back * 0.8);
  });

  it('vedenvastus pysäyttää renkaan', () => {
    const moving = run(createTube({ x: 0, y: 0 }), kick, 10);
    const stopped = run(moving, idle, 20);
    expect(speed(stopped)).toBeLessThan(0.02);
  });

  it('kääntyy ja kulma pysyy välillä (-π, π]', () => {
    const s = run(createTube({ x: 0, y: 0 }, 0), { kick: 0, turn: 1, sprint: false }, 1);
    expect(s.heading).toBeGreaterThan(0.5);
    for (const a of [-7, -Math.PI, 0, Math.PI, 7, 100]) {
      const w = wrapAngle(a);
      expect(w).toBeGreaterThan(-Math.PI - 1e-9);
      expect(w).toBeLessThanOrEqual(Math.PI + 1e-9);
    }
  });
});

describe('collideTubeWithShore', () => {
  const lake: LakeMap = {
    name: 't',
    attribution: '',
    origin: { e: 0, n: 0 },
    shore: [
      { x: -50, y: -50 },
      { x: 50, y: -50 },
      { x: 50, y: 50 },
      { x: -50, y: 50 },
    ],
    islands: [],
    bounds: { minX: -50, minY: -50, maxX: 50, maxY: 50 },
  };
  const water = new WaterBody(lake);

  it('pysäyttää rantaan ja poistaa rantaan päin olevan nopeuden', () => {
    let s = createTube({ x: 0, y: 40 }, -Math.PI / 2); // katse etelään → liike pohjoiseen
    for (let i = 0; i < 60 * 30; i++) s = collideTubeWithShore(s, stepTube(s, kick, DT), water);
    expect(s.pos.y).toBeLessThanOrEqual(50 - 0.8 + 1e-6);
    expect(s.pos.y).toBeGreaterThan(48);
    expect(s.vel.y).toBeLessThan(0.1);
  });
});
