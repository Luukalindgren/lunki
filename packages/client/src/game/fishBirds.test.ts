import { describe, expect, it } from 'vitest';
import {
  DAYTIME,
  type Fish,
  type FishConditions,
  type FishPopulation,
  type School,
} from '@lunki/shared';
import type { BirdEvent, BirdPose } from './birdPose';
import { FISH_BIRDS, FishBirds, type FishBirdsInput } from './fishBirds';

const school = (feeding: boolean, x = 100): School => ({
  species: 'perch',
  home: { x, y: 0 },
  center: { x, y: 0 },
  heading: 0,
  spread: 1,
  excitement: 0,
  flee: 0,
  bout: { feeding, timer: 999 },
});

const roach = (depth: number): Fish =>
  ({
    id: 1,
    gen: 0,
    species: 'roach',
    weight: 0.3,
    pos: { x: 0, y: 120 },
    home: { x: 0, y: 120 },
    depth,
    heading: 0,
    mode: 'roam',
  }) as Fish;

/** Parven ahvenet pintavedessä (parvi `index`). */
const perch = (index: number, x: number, depth = 1): Fish[] =>
  [0, 1, 2].map(
    (i) =>
      ({
        id: 100 + index * 10 + i,
        species: 'perch',
        weight: 0.1,
        pos: { x, y: 0 },
        depth,
        mode: 'roam',
        school: index,
      }) as Fish,
  );

/** Kaikki syövät parvet ajavat pintaan, ellei testi muuta sitä. */
FISH_BIRDS.surface.normal = 1;
FISH_BIRDS.surface.easy = 1;

function input(pop: FishPopulation, cond: Partial<FishConditions> = {}): FishBirdsInput {
  return {
    pop,
    cond: { ...DAYTIME, season: 'summer', ...cond },
    near: { x: 0, y: 0 },
    crafts: [{ x: 0, y: 0 }],
    difficulty: 'normal',
  };
}

function run(b: FishBirds, inp: FishBirdsInput, seconds: number): BirdEvent[] {
  const events: BirdEvent[] = [];
  for (let t = 0; t < seconds; t += 1 / 30) b.update(1 / 30, inp, events);
  return events;
}

describe('FishBirds (#571)', () => {
  it('lokit kaartelevat ja syöksyvät syövän ahvenparven päällä', () => {
    const feeding = school(true);
    const resting = school(false, -100);
    const pop: FishPopulation = {
      fish: [...perch(0, 100), ...perch(1, -100)],
      nextId: 0,
      tick: 0,
      schools: [feeding, resting],
    };
    const b = new FishBirds(8);
    const events = run(b, input(pop), 60);
    expect(b.state.flocks).toEqual([feeding]);
    expect(events.some((e) => e.kind === 'dive')).toBe(true);
    expect(events.some((e) => e.kind === 'cry')).toBe(true);
    const dives = events.filter((e) => e.kind === 'dive');
    for (const d of dives) expect(Math.hypot(d.pos.x - 100, d.pos.y)).toBeLessThan(10);
    const poses: BirdPose[] = [];
    b.poses(poses);
    expect(poses.some((p) => p.kind === 'tern')).toBe(true);
  });

  it('helpolla kalat syövät koko ajan, joten linnut tulevat lepäävänkin parven päälle', () => {
    const pop: FishPopulation = {
      fish: perch(0, 100),
      nextId: 0,
      tick: 0,
      schools: [school(false)],
    };
    const b = new FishBirds(8);
    run(b, { ...input(pop), difficulty: 'easy' }, 5);
    expect(b.state.flocks).toHaveLength(1);
  });

  it('yöllä, ukkosella ja kaukana parvea ei näy, ja lähtiessä linnut lentävät pois', () => {
    const s = school(true);
    const pop: FishPopulation = { fish: perch(0, 100), nextId: 0, tick: 0, schools: [s] };
    for (const cond of [{ light: 0.1 }, { storm: true }]) {
      const b = new FishBirds(8);
      run(b, input(pop, cond), 5);
      expect(b.state.flocks).toHaveLength(0);
    }
    const b = new FishBirds(8);
    run(b, input(pop), 5);
    expect(b.state.flocks).toHaveLength(1);
    s.bout = { feeding: false, timer: 999 };
    run(b, input(pop), 20);
    const poses: BirdPose[] = [];
    b.poses(poses);
    expect(b.state.flocks).toHaveLength(0);
    expect(poses).toHaveLength(0);
  });

  it('syvällä uiva parvi ja vain osa syöntijaksoista näkyy linnuille', () => {
    const deep: FishPopulation = {
      fish: perch(0, 100, 5),
      nextId: 0,
      tick: 0,
      schools: [school(true)],
    };
    const b = new FishBirds(8);
    run(b, input(deep), 5);
    expect(b.state.flocks).toHaveLength(0);
    FISH_BIRDS.surface.normal = 0.35;
    let seen = 0;
    for (let i = 0; i < 200; i++) {
      const pop: FishPopulation = {
        fish: perch(0, 100),
        nextId: 0,
        tick: 0,
        schools: [school(true)],
      };
      const birds = new FishBirds(i);
      run(birds, input(pop), 2.1);
      if (birds.state.flocks.length > 0) seen++;
    }
    FISH_BIRDS.surface.normal = 1;
    expect(seen).toBeGreaterThan(40);
    expect(seen).toBeLessThan(100);
  });

  it('kalasääski syöksyy pintavedessä uivan kalan perään kesällä', () => {
    const fish = roach(0.5);
    const pop: FishPopulation = { fish: [fish], nextId: 1, tick: 0, schools: [] };
    const b = new FishBirds(8);
    const events = run(b, input(pop), 600);
    const catches = events.filter((e) => e.kind === 'catch');
    expect(catches.length).toBeGreaterThan(0);
    expect(Math.hypot(catches[0]!.pos.x - fish.pos.x, catches[0]!.pos.y - fish.pos.y)).toBeLessThan(
      2,
    );
  });

  it('syksyllä sääksi on muuttanut, eikä syvällä uiva kala kelpaa', () => {
    const b = new FishBirds(8);
    const autumn = { fish: [roach(0.5)], nextId: 1, tick: 0, schools: [] };
    expect(run(b, input(autumn, { season: 'autumn' }), 900).some((e) => e.kind === 'catch')).toBe(
      false,
    );
    const deep = { fish: [roach(4)], nextId: 1, tick: 0, schools: [] };
    expect(run(new FishBirds(8), input(deep), 900).some((e) => e.kind === 'catch')).toBe(false);
  });
});
