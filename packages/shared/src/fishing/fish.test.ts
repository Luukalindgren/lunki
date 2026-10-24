import { describe, expect, it } from 'vitest';
import { Rng } from '../rng';
import { DIFFICULTIES, type Difficulty } from './difficulty';
import {
  NATIVE_SPECIES,
  SPECIES,
  SPECIES_IDS,
  createFishPopulation,
  randomWeight,
  spawnFish,
  stepFishPopulation,
  type FishPopulation,
  type SpeciesId,
} from './fish';
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

describe('kalalajit', () => {
  // Kaistale, jonka pohja syvenee rannasta (y = ±150) keskelle 6,5 m:iin.
  const lake = {
    isWater: (p: { x: number; y: number }) => Math.abs(p.x) < 400 && Math.abs(p.y) < 150,
    depthAt: (p: { x: number; y: number }) =>
      Math.max(0.2, Math.min(6.5, (150 - Math.abs(p.y)) * 0.05)),
  };
  const bounds = { minX: -400, minY: -150, maxX: 400, maxY: 150 };
  const count = (pop: FishPopulation, id: SpeciesId) =>
    pop.fish.filter((f) => f.species === id).length;

  it('oletuksena järvessä on ahven, hauki ja särki', () => {
    expect(NATIVE_SPECIES).toEqual(['perch', 'pike', 'roach']);
    const pop = createFishPopulation(lake, bounds, new Rng(1), 1800);
    expect(pop.fish).toHaveLength(1800);
    expect(count(pop, 'perch')).toBeGreaterThan(count(pop, 'roach'));
    expect(count(pop, 'roach')).toBeGreaterThan(count(pop, 'pike'));
    expect(count(pop, 'pike')).toBeGreaterThan(50);
    expect(count(pop, 'zander') + count(pop, 'trout')).toBe(0);
  });

  it('asetus määrää lajiston', () => {
    const pop = createFishPopulation(lake, bounds, new Rng(2), 600, ['zander', 'trout']);
    expect(count(pop, 'zander') + count(pop, 'trout')).toBe(600);
    // Tyhjä tai tuntematon lista palaa oletuslajistoon.
    const fallback = createFishPopulation(lake, bounds, new Rng(2), 100, []);
    expect(new Set(fallback.fish.map((f) => f.species))).toEqual(new Set(NATIVE_SPECIES));
  });

  it('lajit asettuvat omiin syvyyksiinsä', () => {
    const pop = createFishPopulation(lake, bounds, new Rng(3), 3000, SPECIES_IDS);
    const medianDepth = (id: SpeciesId) => {
      const d = pop.fish
        .filter((f) => f.species === id)
        .map((f) => lake.depthAt(f.pos))
        .sort((a, b) => a - b);
      return d[Math.floor(d.length / 2)]!;
    };
    // Hauki rantakaislikon reunalla, kuha syvänteessä.
    expect(medianDepth('pike')).toBeLessThan(2.5);
    expect(medianDepth('zander')).toBeGreaterThan(4);
    expect(medianDepth('pike')).toBeLessThan(medianDepth('perch'));
  });

  it('hauet ovat isompia ja harvinaisia jättejä syntyy', () => {
    const rng = new Rng(4);
    const pike = Array.from({ length: 4000 }, () => randomWeight(SPECIES.pike, rng));
    const perch = Array.from({ length: 4000 }, () => randomWeight(SPECIES.perch, rng));
    const median = (ws: number[]) => [...ws].sort((a, b) => a - b)[ws.length / 2]!;
    expect(median(pike)).toBeGreaterThan(5 * median(perch));
    expect(pike.filter((w) => w > 5).length).toBeGreaterThan(10);
    expect(perch.filter((w) => w > 0.8).length).toBeGreaterThan(5);
  });

  it('särki tarttuu uistimeen harvemmin kuin ahven', () => {
    const strikes = (id: SpeciesId) => {
      let n = 0;
      for (let seed = 1; seed <= 30; seed++) {
        const rng = new Rng(seed);
        const pop: FishPopulation = { fish: [], nextId: 1, tick: 0 };
        const f = spawnFish(pop, id, { x: 3, y: 0 }, world, rng);
        f.depth = 1.5;
        pop.fish.push(f);
        // Viehe kulkee lajin mieluisaa vauhtia kalan edessä.
        const lure = {
          pos: { x: 4, y: 0 },
          depth: 1.5,
          speed: SPECIES[id].preferredSpeed,
          fishable: true,
          tip: { x: -20, y: 0 },
        };
        for (let i = 0; i < 20 / DT; i++) {
          const ev = stepFishPopulation(pop, lure, world, DIFFICULTIES.normal, rng, DT);
          if (ev.strike) {
            n++;
            break;
          }
        }
      }
      return n;
    };
    expect(strikes('roach')).toBeLessThan(strikes('perch'));
  });
});

describe('rakenteet', () => {
  it('hauet hakeutuvat kaatuneiden puiden luo', () => {
    const lake = {
      isWater: (p: { x: number; y: number }) => Math.abs(p.x) < 400 && Math.abs(p.y) < 150,
      depthAt: () => 2,
      structures: [{ kind: 'tree' as const, pos: { x: 300, y: 140 }, radius: 9 }],
    };
    const pop = createFishPopulation(
      lake,
      { minX: -400, minY: -150, maxX: 400, maxY: 150 },
      new Rng(5),
      2000,
      ['pike'],
    );
    const nearTree = pop.fish.filter((f) => Math.hypot(f.pos.x - 300, f.pos.y - 140) < 25);
    // Satunnaisesti alueelle osuisi alle 1 %; rakenteen luona on noin neljännes.
    expect(nearTree.length / pop.fish.length).toBeGreaterThan(0.15);
  });
});
