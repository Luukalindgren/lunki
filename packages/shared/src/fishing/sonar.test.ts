import { describe, expect, it } from 'vitest';
import { Rng } from '../rng';
import { spawnFish, type FishPopulation } from './fish';
import { sonarPing, sonarRange } from './sonar';

const world = { isWater: () => true, depthAt: () => 5 };

describe('kaikuluotain', () => {
  it('näkee keilaan osuvat kalat ja keila levenee syvemmälle', () => {
    const rng = new Rng(1);
    const pop: FishPopulation = { fish: [], nextId: 1, tick: 0 };
    const shallow = spawnFish(pop, 'perch', { x: 2.5, y: 0 }, world, rng);
    shallow.depth = 1;
    const deep = spawnFish(pop, 'pike', { x: 2.5, y: 0 }, world, rng);
    deep.depth = 4;
    const far = spawnFish(pop, 'roach', { x: 30, y: 0 }, world, rng);
    far.depth = 2;
    const ping = sonarPing({ x: 0, y: 0 }, [shallow, deep, far], 5);
    expect(ping.bottom).toBe(5);
    // 2,5 m sivulla: 1 m syvyydessä keila on 1,85 m, 4 m syvyydessä 2,9 m.
    expect(ping.echoes).toEqual([{ depth: 4, weight: deep.weight }]);
  });

  it('ei näe pohjan alle eikä poistuneita kaloja', () => {
    const rng = new Rng(2);
    const pop: FishPopulation = { fish: [], nextId: 1, tick: 0 };
    const f = spawnFish(pop, 'perch', { x: 0, y: 0 }, world, rng);
    f.depth = 3;
    expect(sonarPing({ x: 0, y: 0 }, [f], 2).echoes).toHaveLength(0);
    f.mode = 'gone';
    expect(sonarPing({ x: 0, y: 0 }, [f], 5).echoes).toHaveLength(0);
  });

  it('syvyysalue mukautuu pohjaan', () => {
    expect(sonarRange(1.2)).toBe(3);
    expect(sonarRange(4.4)).toBe(5);
    expect(sonarRange(6.5)).toBe(8);
  });
});

describe('luotain näyttää pohjan laadun ja rakenteet (#226)', () => {
  it('kova pohja ja kivi, kasvusto tai risukko välitetään näytölle', () => {
    const weed = { kind: 'weed' as const, pos: { x: 0, y: 0 }, radius: 8, height: 0.9 };
    const ping = sonarPing({ x: 0, y: 0 }, [], 2.5, { floor: 'rock', structure: weed });
    expect(ping.floor).toBe('rock');
    expect(ping.cover).toEqual({ kind: 'weed', height: 0.9 });
    const rocks = { kind: 'rocks' as const, pos: { x: 0, y: 0 }, radius: 8 };
    expect(sonarPing({ x: 0, y: 0 }, [], 2.5, { structure: rocks }).cover).toBeUndefined();
    expect(sonarPing({ x: 0, y: 0 }, [], 2.5)).toEqual({ bottom: 2.5, echoes: [] });
  });
});
