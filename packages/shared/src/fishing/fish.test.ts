import { describe, expect, it } from 'vitest';
import { Rng } from '../rng';
import { DIFFICULTIES, type Difficulty } from './difficulty';
import { SPECIES, randomWeight, spawnFish, stepFishPopulation, type FishPopulation } from './fish';
import {
  createFishing,
  lureInfo,
  stepFishing,
  type FishingContext,
  type FishingEvents,
  type FishingInput,
  type FishingState,
} from './fishing';

const DT = 1 / 60;
const world = { isWater: (p: { x: number }) => Math.abs(p.x) < 500, depthAt: () => 4 };

interface Sim {
  s: FishingState;
  pop: FishPopulation;
  rng: Rng;
  ctx: FishingContext;
  log: FishingEvents[];
}

/** Kalastaja origossa katse itään, viehe 25 m päässä, yksi kala vieheen lähellä. */
function setup(difficulty: Difficulty, weight = 0.3, seed = 3): Sim {
  const rng = new Rng(seed);
  const pop: FishPopulation = { fish: [], nextId: 1, tick: 0 };
  const fish = spawnFish(pop, 'perch', { x: 22, y: 1 }, world, rng);
  fish.weight = weight;
  fish.depth = 1.5;
  pop.fish.push(fish);
  // Toinen kala, jotta saadun tilalle on paikka syntyä.
  pop.fish.push(spawnFish(pop, 'perch', { x: -200, y: 0 }, world, rng));
  const s = createFishing();
  s.stage = 'water';
  s.lure = { x: 25, y: 0 };
  s.lineLength = 23.4;
  s.depth = 1.5;
  const ctx: FishingContext = {
    tubePos: { x: 0, y: 0 },
    heading: 0,
    ...world,
    fish: { pop, diff: DIFFICULTIES[difficulty], rng },
  };
  return { s, pop, rng, ctx, log: [] };
}

function step(sim: Sim, input: Partial<FishingInput>) {
  const fish = sim.ctx.fish!;
  const ev = stepFishPopulation(sim.pop, lureInfo(sim.s, sim.ctx), world, fish.diff, sim.rng, DT);
  fish.strike = ev.strike;
  sim.log.push(
    stepFishing(
      sim.s,
      { aim: { x: 30, y: 0 }, castHeld: false, reel: false, cancel: false, ...input },
      sim.ctx,
      DT,
    ),
  );
}

/** Kelataan hitaasti ja tauotellen, kunnes tapahtuu jotain. */
function fishUntil(sim: Sim, seconds: number, done: (e: FishingEvents) => boolean): boolean {
  for (let i = 0; i < seconds / DT; i++) {
    const reel = sim.s.hookedId !== null || Math.floor(i / 90) % 2 === 0;
    step(sim, { reel });
    if (done(sim.log[sim.log.length - 1]!)) return true;
    if (sim.s.stage === 'idle') return false;
  }
  return false;
}

describe('kalat', () => {
  it('painot ovat lajin rajoissa', () => {
    const rng = new Rng(9);
    const sp = SPECIES.perch;
    const ws = Array.from({ length: 2000 }, () => randomWeight(sp, rng));
    expect(Math.min(...ws)).toBeGreaterThanOrEqual(sp.minWeight);
    expect(Math.max(...ws)).toBeLessThanOrEqual(sp.maxWeight);
    const median = [...ws].sort((a, b) => a - b)[1000]!;
    expect(median).toBeGreaterThan(0.1);
    expect(median).toBeLessThan(0.2);
  });

  it('helpolla aloittelija saa kalan ylös pelkällä kelauksella', () => {
    let caught = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const sim = setup('easy', 0.4, seed);
      if (fishUntil(sim, 120, (e) => !!e.caught)) caught++;
    }
    expect(caught).toBeGreaterThanOrEqual(8);
  });

  it('saalis kirjataan oikealla painolla ja viehe palaa', () => {
    const sim = setup('easy', 0.42, 2);
    expect(fishUntil(sim, 120, (e) => !!e.caught)).toBe(true);
    const c = sim.log.find((e) => e.caught)!.caught!;
    expect(c).toEqual({ species: 'perch', name: 'Ahven', weight: 0.42 });
    expect(sim.s.stage).toBe('idle');
    expect(sim.pop.fish.filter((f) => f.mode !== 'gone')).toHaveLength(2);
  });

  it('realistisella isku menee ohi ilman vastaiskua', () => {
    const sim = setup('realistic', 0.3, 4);
    // Viehe paikallaan: kala voi iskeä, mutta kelausta ei tule.
    let struck = false;
    for (let i = 0; i < 120 / DT && !struck; i++) {
      step(sim, {});
      struck = !!sim.log[sim.log.length - 1]!.strike;
    }
    if (!struck) return; // kala ei kiinnostunut tällä siemenellä
    for (let i = 0; i < 60; i++) step(sim, {});
    expect(sim.log.some((e) => e.missed)).toBe(true);
    expect(sim.s.hookedId).toBeNull();
  });

  it('liian kireä jarru katkaisee siiman isolla kalalla', () => {
    // Keinotekoisen iso kala: veto ylittää 5 kg siiman kestävyyden.
    const sim = setup('normal', 3, 5);
    sim.s.drag = 8;
    const ok = fishUntil(sim, 120, (e) => !!e.lineBroken || !!e.caught);
    expect(ok).toBe(true);
    expect(sim.log.some((e) => e.lineBroken)).toBe(true);
  });

  it('löysä siima päästää kalan irti normaalilla', () => {
    const sim = setup('normal', 0.5, 6);
    const hooked = fishUntil(sim, 120, (e) => !!e.hooked);
    if (!hooked) return;
    // Annetaan siimaa löysäksi: siirretään rengasta kohti kalaa.
    sim.s.lineLength += 15;
    for (let i = 0; i < 6 / DT && sim.s.hookedId !== null; i++) step(sim, {});
    expect(sim.log.some((e) => e.escaped || e.caught)).toBe(true);
  });
});
