import { describe, expect, it } from 'vitest';
import { Rng } from '../rng';
import { distance } from '../vec2';
import { DEFAULT_TACKLE, type Tackle } from './gear';
import { replaceFish } from './fishing';
import { DIFFICULTIES, type Difficulty } from './difficulty';
import {
  NATIVE_SPECIES,
  SPECIES,
  SPECIES_IDS,
  createFishPopulation,
  lureAppeal,
  randomWeight,
  spawnFish,
  stepFishPopulation,
  type FishConditions,
  type FishPopulation,
  type SpeciesId,
  DAYTIME,
  fishConditions,
  fishHome,
  fishWeight,
  sizeClass,
  speciesActivity,
  stockWeight,
  wariness,
  type LureInfo,
} from './fish';
import { catchRadius } from '../net/castCheck';
import type { WeatherNow } from '../weather/weather';
import {
  createFishing,
  lureInfo,
  removeCaughtFish,
  resetFishing,
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
    // Tärpissä nykäistään (iso kala tarttuu vain siihen, #402), ja pintaan
    // noussut kala nostetaan hetken päästä (#366).
    step(sim, {
      reel,
      twitch: sim.s.struckId !== null,
      land: sim.s.landing !== null && sim.s.landing.age > 0.3,
    });
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

  it('järeä vapa väsyttää kalan nopeammin kuin kevyt', () => {
    const fightTime = (rod: 'light' | 'heavy') => {
      let total = 0;
      for (let seed = 1; seed <= 8; seed++) {
        const sim = setup('easy', 1.6, seed);
        sim.s.tackle.rod = rod;
        fishUntil(sim, 180, (e) => !!e.caught);
        total += sim.log.length - sim.log.findIndex((e) => e.hooked);
      }
      return total;
    };
    expect(fightTime('heavy')).toBeLessThan(fightTime('light'));
  });

  it('saalis kirjataan oikealla painolla ja viehe palaa', () => {
    const sim = setup('easy', 0.42, 2);
    expect(fishUntil(sim, 120, (e) => !!e.caught)).toBe(true);
    const c = sim.log.find((e) => e.caught)!.caught!;
    expect(c).toEqual({ species: 'perch', name: 'Ahven', weight: 0.42, fish: { slot: 0, gen: 0 } });
    expect(sim.s.stage).toBe('idle');
    expect(sim.pop.fish.filter((f) => f.mode !== 'gone')).toHaveLength(2);
    // Saadun tilalle syntyi saman paikan seuraava sukupolvi.
    expect(sim.pop.fish[0]!.gen).toBe(1);
  });

  it('toisen nostama kala katoaa omasta kalakannasta, myös kesken väsytyksen', () => {
    const sim = setup('easy', 0.42, 2);
    expect(fishUntil(sim, 120, (e) => !!e.hooked)).toBe(true);
    const hooked = sim.s.hookedId;
    // Väärä sukupolvi ei koske omaan kalaan.
    expect(removeCaughtFish(sim.s, sim.pop, { slot: 0, gen: 3 }, world, sim.rng)).toBe(false);
    expect(sim.s.hookedId).toBe(hooked);
    expect(removeCaughtFish(sim.s, sim.pop, { slot: 0, gen: 0 }, world, sim.rng)).toBe(true);
    expect(sim.s.hookedId).toBeNull();
    expect(sim.s.stage).toBe('idle');
    expect(sim.pop.fish[0]!.gen).toBe(1);
    expect(sim.pop.fish[0]!.id).not.toBe(hooked);
  });

  it('kesken väsytyksen katkennut siima (salama, kaatuminen) vapauttaa kalan', () => {
    const sim = setup('easy', 0.42, 2);
    expect(fishUntil(sim, 120, (e) => !!e.hooked)).toBe(true);
    const fish = sim.pop.fish.find((f) => f.id === sim.s.hookedId)!;
    resetFishing(sim.s, sim.ctx.fish);
    expect(sim.s.hookedId).toBeNull();
    // Kala ui taas vapaana eikä jää jumiin "kiinni"-tilaan.
    expect(fish.mode).toBe('roam');
    const before = { ...fish.pos };
    for (let i = 0; i < 3 / DT; i++) step(sim, {});
    expect(fish.pos).not.toEqual(before);
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
    const sim = setup('normal', 3, 1);
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

  it('oletuksena järvessä ovat Lunkinjärven omat lajit, kiiski harvinaisena', () => {
    expect(NATIVE_SPECIES).toEqual(['perch', 'pike', 'roach', 'bream', 'ruffe', 'burbot']);
    const pop = createFishPopulation(lake, bounds, new Rng(1), 1800);
    // Lajikohtainen pyöristys voi lisätä yhden kalan (kanta pysyy ennallaan).
    expect(Math.abs(pop.fish.length - 1800)).toBeLessThanOrEqual(1);
    expect(count(pop, 'perch')).toBeGreaterThan(count(pop, 'roach'));
    expect(count(pop, 'roach')).toBeGreaterThan(count(pop, 'bream'));
    expect(count(pop, 'bream')).toBeGreaterThan(count(pop, 'pike'));
    expect(count(pop, 'pike')).toBeGreaterThan(50);
    expect(count(pop, 'ruffe')).toBeGreaterThan(20);
    expect(count(pop, 'ruffe')).toBeLessThan(count(pop, 'perch') / 8);
    expect(count(pop, 'burbot')).toBeGreaterThan(20);
    for (const id of ['zander', 'trout', 'ide', 'rainbow', 'carp'] as const)
      expect(count(pop, id)).toBe(0);
  });

  it('jokaisen lajin kokoluokat ja painot ovat järkevät', () => {
    const rng = new Rng(11);
    for (const id of SPECIES_IDS) {
      const sp = SPECIES[id];
      expect(sp.id).toBe(id);
      const sizes = [sp.minWeight, ...sp.sizes, sp.maxWeight];
      expect([...sizes].sort((a, b) => a - b)).toEqual(sizes);
      expect(sp.medianWeight).toBeLessThan(sp.sizes[1]);
      for (let i = 0; i < 200; i++) {
        const w = randomWeight(sp, rng);
        expect(w).toBeGreaterThanOrEqual(sp.minWeight);
        expect(w).toBeLessThanOrEqual(sp.maxWeight);
      }
    }
  });

  it('karppi on valinnainen ja voi kasvaa jättimäiseksi', () => {
    expect(SPECIES.carp.native).toBe(false);
    expect(SPECIES.carp.sizes[3]).toBeGreaterThan(SPECIES.pike.sizes[3]);
    const pop = createFishPopulation(lake, bounds, new Rng(5), 400, ['carp']);
    expect(Math.max(...pop.fish.map((f) => f.weight))).toBeGreaterThan(SPECIES.carp.sizes[3]);
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

describe('kalakanta palvelimen tarkistettavissa', () => {
  const lake = {
    isWater: (p: { x: number; y: number }) => Math.abs(p.x) < 400 && Math.abs(p.y) < 150,
    depthAt: () => 3,
  };
  const bounds = { minX: -400, minY: -150, maxX: 400, maxY: 150 };

  it('sama siemen antaa samat kalat, painot ja uudet kalat', () => {
    const a = createFishPopulation(lake, bounds, new Rng(9), 300);
    const b = createFishPopulation(lake, bounds, new Rng(9), 300);
    expect(a.fish.map((f) => [f.species, f.weight])).toEqual(
      b.fish.map((f) => [f.species, f.weight]),
    );
    a.fish.forEach((f, i) => {
      expect(f.weight).toBe(stockWeight(a, i, 0));
      expect(f.home).toEqual(fishHome(a, i, 0));
    });
    // Saadun tilalle syntyvä kala on sama riippumatta muusta pelistä (eri rng).
    replaceFish(a, 7, lake, new Rng(1));
    replaceFish(b, 7, lake, new Rng(2));
    expect(a.fish[7]).toMatchObject({
      gen: 1,
      species: b.fish[7]!.species,
      weight: b.fish[7]!.weight,
    });
    expect(a.fish[7]!.weight).toBe(stockWeight(a, 7, 1));
    expect(a.fish[7]!.pos).toEqual(fishHome(a, 7, 1));
    expect(fishHome(a, 7, 1)).toEqual(b.fish[7]!.pos);
  });

  it('vanhojen lajien kalakanta ei muutu uusien lajien myötä (#225)', () => {
    // Sormenjälki laskettu ennen uusia lajeja: kannan arvonta ei saa muuttua.
    const sloped = {
      isWater: lake.isWater,
      depthAt: (p: { x: number; y: number }) =>
        Math.max(0.2, Math.min(6.5, (150 - Math.abs(p.y)) * 0.05)),
    };
    const pop = createFishPopulation(sloped, bounds, new Rng(21), 600, [
      'perch',
      'pike',
      'roach',
      'zander',
      'trout',
    ]);
    const text = JSON.stringify(
      pop.fish.map((f) => [
        f.species,
        f.weight,
        Math.round(f.pos.x * 1000),
        Math.round(f.pos.y * 1000),
      ]),
    );
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
    expect(`${h} ${pop.fish.length}`).toBe('3891251101 600');
  });

  it('sukupolvet saavat eri painot', () => {
    const ws = Array.from({ length: 50 }, (_, g) => fishWeight(1, 'pike', 3, g));
    expect(new Set(ws).size).toBeGreaterThan(40);
  });
});

describe('käytös', () => {
  // Kaistale, jonka pohja syvenee rannasta (y = ±150) keskelle 6,5 m:iin.
  const lake = {
    isWater: (p: { x: number; y: number }) => Math.abs(p.x) < 400 && Math.abs(p.y) < 150,
    depthAt: (p: { x: number; y: number }) =>
      Math.max(0.2, Math.min(6.5, (150 - Math.abs(p.y)) * 0.05)),
  };
  const bounds = { minX: -400, minY: -150, maxX: 400, maxY: 150 };
  const NIGHT: FishConditions = { ...DAYTIME, light: 0.1 };
  const DUSK: FishConditions = { ...DAYTIME, light: 0.55, twilight: 1 };
  const run = (pop: FishPopulation, seconds: number, cond = DAYTIME, dt = 0.1, seed = 1) => {
    const rng = new Rng(seed);
    for (let i = 0; i < seconds / dt; i++)
      stepFishPopulation(pop, null, lake, DIFFICULTIES.normal, rng, dt, cond);
  };
  const centroid = (fish: FishPopulation['fish']) => ({
    x: fish.reduce((s, f) => s + f.pos.x, 0) / fish.length,
    y: fish.reduce((s, f) => s + f.pos.y, 0) / fish.length,
  });

  it('ahvenet ja särjet uivat parvena yhdessä, hauki elää yksin', () => {
    const pop = createFishPopulation(lake, bounds, new Rng(11), 600);
    expect(pop.fish.filter((f) => f.species === 'pike').every((f) => f.school === -1)).toBe(true);
    const members = pop.fish.filter((f) => f.school === 0);
    expect(members.length).toBeGreaterThan(5);
    const start = centroid(members);
    run(pop, 180);
    const end = centroid(members);
    // Koko parvi on siirtynyt yhdessä, eikä se ole hajonnut.
    expect(Math.hypot(end.x - start.x, end.y - start.y)).toBeGreaterThan(5);
    const sp = SPECIES[members[0]!.species];
    const spread = members.reduce((s, f) => s + Math.hypot(f.pos.x - end.x, f.pos.y - end.y), 0);
    expect(spread / members.length).toBeLessThan(sp.schoolSpread * 2);
  });

  it('kalat pysyvät palvelimen hyväksymällä etäisyydellä kotipaikastaan', () => {
    const pop = createFishPopulation(lake, bounds, new Rng(12), 600, SPECIES_IDS);
    const windy = fishConditions({
      sky: 'windy',
      next: null,
      untilChange: Infinity,
      warnings: [],
      windSpeed: 8,
      windDir: 1,
      rain: 0,
      darkness: 0.1,
    });
    run(pop, 300, windy, 0.2);
    run(pop, 300, NIGHT, 0.2);
    for (const [i, f] of pop.fish.entries()) {
      expect(distance(f.pos, fishHome(pop, i, f.gen)!)).toBeLessThan(catchRadius(f.species));
    }
  });

  it('hauki väijyy paikallaan eikä vaella kauas', () => {
    const pop = createFishPopulation(lake, bounds, new Rng(13), 600);
    const pikes = pop.fish.filter((f) => f.species === 'pike');
    const before = pikes.map((f) => ({ ...f.pos }));
    run(pop, 120);
    const moved = pikes.map((f, i) => distance(f.pos, before[i]!)).sort((a, b) => a - b);
    // Suurin osa hauista on samalla paikalla, eikä yksikään lähde kotipaikaltaan.
    expect(moved[Math.floor(moved.length / 2)]!).toBeLessThan(0.5);
    for (const f of pikes) expect(distance(f.pos, f.home)).toBeLessThan(SPECIES.pike.homeRange + 1);
  });

  it('särkiparvi tiivistyy ja pakenee lähelle tullutta haukea', () => {
    const pop = createFishPopulation(lake, bounds, new Rng(14), 600);
    const i = pop.schools!.findIndex((s) => s.species === 'roach');
    const school = pop.schools![i]!;
    const pike = pop.fish.find((f) => f.species === 'pike')!;
    pike.pos = { x: school.center.x + 3, y: school.center.y };
    const rng = new Rng(2);
    for (let t = 0; t < 30 && school.flee <= 0; t++)
      stepFishPopulation(pop, null, lake, DIFFICULTIES.normal, rng, 0.1);
    expect(school.flee).toBeGreaterThan(0);
    // Pako suuntautuu poispäin hauesta.
    expect(Math.cos(school.heading)).toBeLessThan(0);
    run(pop, 2);
    expect(school.spread).toBeLessThan(1);
  });

  it('ahvenparvi kilpailee vieheestä: yhden seuratessa muutkin innostuvat', () => {
    const follows = (excited: boolean) => {
      let n = 0;
      for (let seed = 1; seed <= 20; seed++) {
        const rng = new Rng(seed);
        const pop = createFishPopulation(lake, bounds, new Rng(15), 400, ['perch']);
        const school = pop.schools![0]!;
        school.excitement = excited ? 1 : 0;
        const members = pop.fish.filter((f) => f.school === 0);
        for (const f of members) f.depth = 1.5;
        const lure = {
          pos: { ...school.center },
          depth: 1.5,
          speed: SPECIES.perch.preferredSpeed,
          fishable: true,
          tip: { x: school.center.x - 25, y: school.center.y },
        };
        for (let i = 0; i < 2 / DT; i++) {
          stepFishPopulation(pop, lure, lake, DIFFICULTIES.normal, rng, DT);
          if (!excited) school.excitement = 0;
        }
        n += members.filter((f) => f.mode !== 'roam').length;
      }
      return n;
    };
    expect(follows(true)).toBeGreaterThan(follows(false) * 1.5);
  });

  it('vuorokaudenaika ja sää muuttavat lajien syöntiä', () => {
    // Ahven ja hauki ovat päiväsaalistajia, parhaimmillaan hämärässä.
    for (const id of ['perch', 'pike'] as const) {
      expect(speciesActivity(id, NIGHT)).toBeLessThan(speciesActivity(id, DAYTIME) / 2);
      expect(speciesActivity(id, DUSK)).toBeGreaterThan(speciesActivity(id, DAYTIME));
    }
    // Kuha syö pimeällä, kirkkaana päivänä huonosti.
    expect(speciesActivity('zander', NIGHT)).toBeGreaterThan(speciesActivity('zander', DAYTIME));
    // Pilvinen ja tuulinen sää on hauen ilma.
    const grey = { ...DAYTIME, cloud: 0.8, wind: { x: 6, y: 0 } };
    expect(speciesActivity('pike', grey)).toBeGreaterThan(speciesActivity('pike', DAYTIME) * 1.3);
    // Ennen ukkosta syönti kiihtyy, ukkosella lähes loppuu.
    expect(speciesActivity('perch', { ...DAYTIME, preStorm: true })).toBeGreaterThan(1.2);
    expect(speciesActivity('perch', { ...DAYTIME, storm: true })).toBeLessThan(0.5);
  });

  it('sää muuntuu kalojen olosuhteiksi', () => {
    const w: WeatherNow = {
      sky: 'rain',
      next: 'thunder',
      untilChange: 120,
      warnings: [],
      windSpeed: 5,
      windDir: 0,
      rain: 0.6,
      darkness: 0.35,
    };
    const c = fishConditions(w);
    expect(c.preStorm).toBe(true);
    expect(c.storm).toBe(false);
    expect(c.light).toBeLessThan(1);
    expect(c.cloud).toBeGreaterThan(0.5);
    expect(c.wind.x).toBeCloseTo(5);
    expect(fishConditions({ ...w, sky: 'thunder', next: null }).storm).toBe(true);
    expect(fishConditions(null, { light: 0.1, twilight: 0 }).light).toBe(0.1);
  });

  it('ahven syö yöllä selvästi huonommin kuin päivällä', () => {
    const strikes = (cond: FishConditions) => {
      let n = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const rng = new Rng(seed);
        const pop: FishPopulation = { fish: [], nextId: 1, tick: 0 };
        const f = spawnFish(pop, 'perch', { x: 3, y: 0 }, world, rng);
        f.depth = 1.5;
        pop.fish.push(f);
        const lure = {
          pos: { x: 4, y: 0 },
          depth: 1.5,
          speed: SPECIES.perch.preferredSpeed,
          fishable: true,
          tip: { x: -20, y: 0 },
        };
        for (let i = 0; i < 6 / DT; i++) {
          if (stepFishPopulation(pop, lure, world, DIFFICULTIES.normal, rng, DT, cond).strike) {
            n++;
            break;
          }
        }
      }
      return n;
    };
    expect(strikes(NIGHT)).toBeLessThan(strikes(DAYTIME) * 0.6);
  });

  it('hämärässä särkiparvet nousevat matalikoille', () => {
    const depthOfSchools = (cond: FishConditions) => {
      const pop = createFishPopulation(lake, bounds, new Rng(16), 900, ['roach']);
      run(pop, 600, cond, 0.25);
      const ds = pop.schools!.map((s) => lake.depthAt(s.center));
      return ds.reduce((a, b) => a + b, 0) / ds.length;
    };
    expect(depthOfSchools(DUSK)).toBeLessThan(depthOfSchools(DAYTIME) - 0.3);
  });

  it('saadun tilalle syntyvä kala liittyy kotipaikkansa parveen', () => {
    const pop = createFishPopulation(lake, bounds, new Rng(17), 300);
    const slot = pop.fish.findIndex((f) => f.school >= 0);
    replaceFish(pop, slot, lake, new Rng(1));
    const f = pop.fish[slot]!;
    const home = fishHome(pop, slot, 1)!;
    const host = pop.homes!.findIndex((h) => h === home);
    expect(f.school).toBe(pop.schoolOf![host]);
    const s = pop.schools![f.school]!;
    expect(s.home.x + f.offset.x).toBeCloseTo(home.x);
  });
});

describe('suurkalat ja jättikalat (#231)', () => {
  const lake = {
    isWater: (p: { x: number; y: number }) => Math.abs(p.x) < 400 && Math.abs(p.y) < 150,
    depthAt: () => 3,
  };
  const bounds = { minX: -400, minY: -150, maxX: 400, maxY: 150 };

  it('kokoluokat ovat lajikohtaiset: särjelläkin on jättikala', () => {
    expect(sizeClass('pike', 0.5)).toBe(0);
    expect(sizeClass('pike', 3)).toBe(2);
    expect(sizeClass('pike', 6)).toBe(3);
    expect(sizeClass('pike', 10)).toBe(4);
    expect(sizeClass('roach', 0.8)).toBe(4);
    expect(sizeClass('perch', 0.3)).toBe(1);
    for (const id of SPECIES_IDS) {
      const s = SPECIES[id].sizes;
      expect(s[3], id).toBeLessThan(SPECIES[id].maxWeight);
      for (let i = 1; i < 4; i++) expect(s[i]!, id).toBeGreaterThan(s[i - 1]!);
    }
  });

  it('järvessä on aina jättikaloja ja suurkaloja, sama kanta palvelimella', () => {
    for (const seed of [1, 2, 3]) {
      const a = createFishPopulation(lake, bounds, new Rng(seed), 1800);
      const b = createFishPopulation(lake, bounds, new Rng(seed), 1800);
      expect(a.fish.map((f) => f.weight)).toEqual(b.fish.map((f) => f.weight));
      for (const id of NATIVE_SPECIES) {
        const sizes = a.fish.filter((f) => f.species === id).map((f) => sizeClass(id, f.weight));
        const { giant, huge } = SPECIES[id].giants;
        expect(sizes.filter((c) => c === 4).length, id).toBeGreaterThanOrEqual(giant);
        expect(sizes.filter((c) => c >= 3).length, id).toBeGreaterThanOrEqual(giant + huge);
      }
      a.fish.forEach((f, i) => expect(f.weight).toBe(stockWeight(a, i, 0)));
      // Saadun jättikalan tilalle syntyy taas jättikala.
      const slot = a.sizes!.indexOf(4);
      replaceFish(a, slot, lake, new Rng(5));
      expect(sizeClass(a.fish[slot]!.species, a.fish[slot]!.weight)).toBe(4);
    }
  });

  it('taattu kokoluokka antaa painon luokan rajoista', () => {
    for (let gen = 0; gen < 50; gen++) {
      expect(sizeClass('pike', fishWeight(7, 'pike', 3, gen, 4))).toBe(4);
      expect(sizeClass('pike', fishWeight(7, 'pike', 3, gen, 3))).toBe(3);
      expect(fishWeight(7, 'pike', 3, gen, 4)).toBeLessThanOrEqual(SPECIES.pike.maxWeight);
    }
  });

  it('iso kala on varovainen, mutta innostuu hämärässä ja ennen ukkosta', () => {
    expect(wariness(4, 1)).toBeLessThan(wariness(0, 1) * 0.3);
    expect(wariness(3, 1)).toBeLessThan(wariness(2, 1));
    expect(wariness(4, 2)).toBeGreaterThan(wariness(4, 1) * 2);
    expect(wariness(0, 2)).toBe(wariness(0, 1));
  });

  /** Kuinka monessa kokeessa kala iskee puolen sekunnin seurannan aikana. */
  function strikes(weight: number) {
    let n = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const rng = new Rng(seed);
      const pop: FishPopulation = { fish: [], nextId: 1, tick: 0 };
      const f = spawnFish(pop, 'pike', { x: 20, y: 0 }, lake, rng);
      pop.fish.push(f);
      f.weight = weight;
      f.mode = 'follow';
      f.depth = 1;
      const lure: LureInfo = {
        pos: { x: 20.5, y: 0 },
        depth: 1,
        speed: 0.6,
        fishable: true,
        tip: { x: 0, y: 0 },
        tackle: { ...DEFAULT_TACKLE, leader: true },
      };
      for (let i = 0; i < 0.5 / DT; i++) {
        const ev = stepFishPopulation(pop, lure, lake, DIFFICULTIES.normal, rng, DT);
        lure.pos = { x: f.pos.x + 0.5, y: f.pos.y };
        if (ev.strike !== undefined) {
          n++;
          break;
        }
        if (f.mode !== 'follow') break;
      }
    }
    return n;
  }

  it('jättikala iskee seuratessaan selvästi harvemmin kuin tavallinen saman lajin kala', () => {
    const normal = strikes(1.2);
    const giant = strikes(10);
    expect(normal).toBeGreaterThan(40);
    expect(giant).toBeLessThan(normal * 0.6);
  });

  it('suurkala kääntyy pois kalastajan läheltä ja paljastaa varjonsa', () => {
    const rng = new Rng(3);
    const pop: FishPopulation = { fish: [], nextId: 1, tick: 0 };
    const f = spawnFish(pop, 'pike', { x: 5, y: 0 }, lake, rng);
    pop.fish.push(f);
    f.weight = 9;
    f.mode = 'follow';
    const lure: LureInfo = {
      pos: { x: 4.5, y: 0 },
      depth: 1,
      speed: 0.6,
      fishable: true,
      tip: { x: 0, y: 0 },
    };
    const ev = stepFishPopulation(pop, lure, lake, DIFFICULTIES.normal, rng, DT);
    expect(ev.shadow).toBe(f.id);
    expect(f.mode).toBe('roam');
    expect(f.cooldown).toBeGreaterThanOrEqual(30);
  });
});

describe('uudet lajit (#225)', () => {
  const NIGHT: FishConditions = { ...DAYTIME, light: 0 };
  const DUSK: FishConditions = { ...DAYTIME, light: 0.4, twilight: 1 };
  const fishOf = (id: SpeciesId, depth: number) => {
    const pop: FishPopulation = { fish: [], nextId: 1, tick: 0 };
    const f = spawnFish(pop, id, { x: 0, y: 0 }, world, new Rng(1));
    f.depth = depth;
    return f;
  };
  /** Vieheen houkuttelevuus pohjan tuntumassa (4 m) annetulla vieheellä ja vauhdilla. */
  const appealOf = (id: SpeciesId, lure: Tackle['lure'], speed: number, depth = 3.8) =>
    lureAppeal(fishOf(id, 3.8), {
      pos: { x: 0, y: 0 },
      depth,
      speed,
      fishable: true,
      tip: { x: -20, y: 0 },
      tackle: { ...DEFAULT_TACKLE, lure },
    });

  it('vuorokausirytmi: made syö yöllä, lahna ja karppi hämärässä, kiiski myös päivällä', () => {
    expect(speciesActivity('burbot', NIGHT)).toBeGreaterThan(
      speciesActivity('burbot', DAYTIME) * 10,
    );
    for (const id of ['bream', 'carp', 'ide'] as const)
      expect(speciesActivity(id, DUSK)).toBeGreaterThan(speciesActivity(id, DAYTIME) * 1.5);
    expect(speciesActivity('ruffe', DAYTIME)).toBeGreaterThan(0.6);
    expect(speciesActivity('ruffe', NIGHT)).toBeGreaterThan(speciesActivity('ruffe', DAYTIME));
    // Kirjolohi ja taimen ovat valoisalla syvemmällä kuin hämärässä.
    for (const id of ['rainbow', 'trout'] as const) {
      const col = SPECIES[id].behavior.column!;
      expect(col.day).toBeGreaterThan(col.dark);
    }
  });

  it('lahna, karppi ja made tarttuvat hitaaseen pohjajigiin, eivät nopeaan lusikkaan', () => {
    for (const id of ['bream', 'carp', 'burbot'] as const) {
      const jig = appealOf(id, 'jig', 0.12);
      expect(jig).toBeGreaterThan(0.8);
      expect(appealOf(id, 'spoon', 1)).toBeLessThan(jig / 10);
      // Pinnan alla uiva jigi ei kiinnosta pohjakalaa.
      expect(appealOf(id, 'jig', 0.12, 1)).toBeLessThan(jig / 5);
    }
    // Karppi on varovaisempi kuin lahna.
    expect(SPECIES.carp.lureInterest).toBeLessThan(SPECIES.bream.lureInterest);
  });

  it('kiiski tarttuu jigiin ja lippaan, säyne ja kirjolohi lippaan ja lusikkaan', () => {
    expect(appealOf('ruffe', 'jig', 0.2)).toBeGreaterThan(appealOf('ruffe', 'wobbler', 0.2) * 5);
    expect(appealOf('ruffe', 'spinner', 0.2)).toBeGreaterThan(appealOf('ruffe', 'spoon', 0.2));
    for (const id of ['ide', 'rainbow'] as const) {
      const speed = SPECIES[id].preferredSpeed;
      expect(appealOf(id, 'spinner', speed)).toBeGreaterThan(appealOf(id, 'jig', speed) * 2);
      expect(appealOf(id, 'spoon', speed)).toBeGreaterThan(appealOf(id, 'jig', speed) * 1.5);
    }
  });

  /** Kala on juuri iskenyt; kelaus alkaa `delay` sekunnin päästä. */
  const strikeThenReel = (id: SpeciesId, delay: number, seed: number) => {
    const sim = setup('normal', 0.3, seed);
    const f = sim.pop.fish[0]!;
    f.species = id;
    f.mode = 'struck';
    sim.ctx.fish!.strike = f.id;
    for (let i = 0; i < 2 / DT && sim.s.hookedId === null; i++) {
      const ev = stepFishing(
        sim.s,
        { aim: { x: 30, y: 0 }, castHeld: false, reel: i * DT >= delay, cancel: false },
        sim.ctx,
        DT,
      );
      sim.ctx.fish!.strike = undefined;
      if (ev.missed) return 'missed';
    }
    return sim.s.hookedId !== null ? 'hooked' : 'missed';
  };

  it('kuhan napsuun on vastattava nopeammin kuin ahvenen iskuun', () => {
    const delay = DIFFICULTIES.normal.hookWindow * 0.75;
    let perch = 0;
    let zander = 0;
    for (let seed = 1; seed <= 20; seed++) {
      if (strikeThenReel('perch', delay, seed) === 'hooked') perch++;
      if (strikeThenReel('zander', delay, seed) === 'hooked') zander++;
    }
    expect(perch).toBeGreaterThan(10);
    expect(zander).toBe(0);
    // Nopea vastaisku pistää kuhankin.
    expect(strikeThenReel('zander', 0.1, 3)).toBe('hooked');
  });

  /** Kala on juuri iskenyt; nykäisy (tai kelaus) `at` sekunnin päästä (#402). */
  const strikeThen = (
    o: { id: SpeciesId; weight: number; diff?: Difficulty; rod?: Tackle['rod']; seed: number },
    input: 'reel' | 'twitch',
    at = 0.1,
  ) => {
    const sim = setup(o.diff ?? 'normal', o.weight, o.seed);
    sim.s.tackle = { ...sim.s.tackle, rod: o.rod ?? 'medium' };
    const f = sim.pop.fish[0]!;
    f.species = o.id;
    f.mode = 'struck';
    sim.ctx.fish!.strike = f.id;
    let missed: FishingEvents = {};
    for (let i = 0; i < 2 / DT && sim.s.hookedId === null; i++) {
      const now = i * DT >= at;
      const ev = stepFishing(
        sim.s,
        {
          aim: { x: 30, y: 0 },
          castHeld: false,
          reel: input === 'reel' && now,
          cancel: false,
          twitch: input === 'twitch' && now && (i - 1) * DT < at,
        },
        sim.ctx,
        DT,
      );
      sim.ctx.fish!.strike = undefined;
      if (ev.missed) missed = ev;
    }
    return { hooked: sim.s.hookedId !== null, big: sim.s.strikeBig, missed };
  };

  it('virvelissä iso kala tarttuu vain nykäisyyn, pieni kelaukseenkin (#402)', () => {
    let small = 0;
    let bigReel = 0;
    let bigTwitch = 0;
    for (let seed = 1; seed <= 20; seed++) {
      if (strikeThen({ id: 'perch', weight: 0.2, seed }, 'reel').hooked) small++;
      const reel = strikeThen({ id: 'pike', weight: 4, seed }, 'reel');
      expect(reel.big).toBe(true);
      if (reel.hooked) bigReel++;
      else expect(reel.missed.missedTwitch).toBe(true);
      if (strikeThen({ id: 'pike', weight: 4, seed }, 'twitch').hooked) bigTwitch++;
    }
    expect(small).toBeGreaterThan(14);
    expect(bigReel).toBe(0);
    expect(bigTwitch).toBeGreaterThan(14);
    // Pieni kala tarttuu myös nykäisyyn, eikä se tarvitse sitä.
    expect(strikeThen({ id: 'perch', weight: 0.2, seed: 2 }, 'reel').big).toBe(false);
    // Helpolla koukku tarttuu itsestään kokoon katsomatta.
    expect(strikeThen({ id: 'pike', weight: 8, diff: 'easy', seed: 1 }, 'reel').hooked).toBe(true);
    // Kokoluokka 1 kelataan kiinni, kokoluokka 2 vaatii nykäisyn.
    expect(sizeClass('pike', 2)).toBe(DIFFICULTIES.normal.reelHookSize);
    expect(strikeThen({ id: 'pike', weight: 2, seed: 1 }, 'reel').big).toBe(false);
    expect(strikeThen({ id: 'pike', weight: 2.5, seed: 1 }, 'reel').big).toBe(true);
  });

  it('järeä vapa pistää hauen kovaan suuhun varmemmin kuin kevyt (#402)', () => {
    const hooked = (rod: Tackle['rod'], id: SpeciesId) => {
      let n = 0;
      for (let seed = 1; seed <= 200; seed++)
        if (strikeThen({ id, weight: 6, diff: 'realistic', rod, seed }, 'twitch').hooked) n++;
      return n;
    };
    const light = hooked('light', 'pike');
    const medium = hooked('medium', 'pike');
    const heavy = hooked('heavy', 'pike');
    expect(light).toBeLessThan(medium);
    expect(medium).toBeLessThan(heavy);
    expect(heavy).toBeGreaterThan(170);
    expect(light).toBeLessThan(130);
    // Muilla lajeilla vavan ero on pienempi kuin hauella.
    const zander = hooked('heavy', 'zander') - hooked('light', 'zander');
    expect(zander).toBeLessThan(heavy - light);
  });

  it('liian aikainen nykäisy voi säikyttää lähellä seuraavan ison kalan (#402)', () => {
    const run = (twitch: number, weight: number) => {
      let spooked = 0;
      for (let seed = 1; seed <= 100; seed++) {
        const sim = setup('normal', weight, seed);
        const f = sim.pop.fish[0]!;
        f.mode = 'follow';
        f.timer = 0;
        f.pos = { x: 26, y: 0 };
        const lure = { ...lureInfo(sim.s, sim.ctx)!, twitch };
        const ev = stepFishPopulation(sim.pop, lure, world, DIFFICULTIES.normal, sim.rng, DT);
        if (ev.spooked !== undefined) {
          spooked++;
          expect(f.mode).toBe('roam');
        }
      }
      return spooked;
    };
    const early = run(0, 0.4);
    expect(early).toBeGreaterThan(20);
    expect(early).toBeLessThan(60);
    // Ilman nykäisyä tai pienellä kalalla ei säikähdetä.
    expect(run(1, 0.4)).toBe(0);
    expect(run(0, 0.2)).toBe(0);
  });

  it('hyppivä kirjolohi irtoaa löysällä siimalla, ahven ei ehdi', () => {
    const lostOnSlack = (id: SpeciesId) => {
      let n = 0;
      for (let seed = 1; seed <= 20; seed++) {
        const sim = setup('normal', 1.5, seed);
        const f = sim.pop.fish[0]!;
        f.species = id;
        f.mode = 'hooked';
        f.running = true;
        f.timer = 10;
        f.stamina = 1;
        sim.s.hookedId = f.id;
        sim.s.lineLength += 30;
        let jumped = false;
        for (let i = 0; i < 2.5 / DT && sim.s.hookedId !== null; i++) {
          const ev = stepFishing(
            sim.s,
            { aim: { x: 30, y: 0 }, castHeld: false, reel: false, cancel: false },
            sim.ctx,
            DT,
          );
          jumped ||= !!ev.jumped;
          if (ev.escaped) n++;
        }
        if (id === 'perch') expect(jumped).toBe(false);
      }
      return n;
    };
    expect(lostOnSlack('perch')).toBe(0);
    expect(lostOnSlack('rainbow')).toBeGreaterThan(8);
  });

  it('taimen seuraa viehettä pidempään ennen kuin luovuttaa', () => {
    expect(SPECIES.trout.behavior.follows).toBeGreaterThan(1);
    expect(SPECIES.carp.behavior.runs).toBeGreaterThan(1);
  });
});

describe('nosto väsytyksen lopuksi (#366)', () => {
  /** Väsytetään kelaamalla, mutta ei nosteta: palauttaa, nousiko kala pintaan. */
  function untilSurface(sim: Sim, seconds: number): boolean {
    for (let i = 0; i < seconds / DT; i++) {
      step(sim, { reel: sim.s.hookedId !== null || Math.floor(i / 90) % 2 === 0 });
      if (sim.s.landing) return true;
      if (sim.s.stage === 'idle') return false;
    }
    return false;
  }

  it('pienikin kala odottaa pinnassa omaa nostoa, ja nosto heilauttaa sen kyytiin', () => {
    const sim = setup('easy', 0.1, 2);
    expect(untilSurface(sim, 120)).toBe(true);
    expect(sim.s.landing!.net).toBe(false);
    // Pohjassa pidetty kelaus ei nosta.
    for (let i = 0; i < 30; i++) step(sim, { reel: true });
    expect(sim.log.some((e) => e.caught)).toBe(false);
    if (sim.s.landing!.lunge > 0) sim.s.landing!.lunge = 0;
    step(sim, { land: true });
    expect(sim.log.at(-1)!.caught?.weight).toBe(0.1);
    expect(sim.log.at(-1)!.landed?.by).toBe('swing');
  });

  it('isompi kala jää pintaan odottamaan nostoa, ja nosto tuo sen kyytiin', () => {
    const sim = setup('easy', 0.42, 2);
    expect(untilSurface(sim, 120)).toBe(true);
    expect(sim.log.some((e) => e.surfaced)).toBe(true);
    expect(sim.s.landing!.net).toBe(false);
    // Pelkkä kelaus ei nosta.
    for (let i = 0; i < 30; i++) step(sim, { reel: true });
    expect(sim.log.some((e) => e.caught)).toBe(false);
    expect(sim.s.hookedId).not.toBeNull();
    if (sim.s.landing!.lunge > 0) sim.s.landing!.lunge = 0;
    step(sim, { land: true });
    expect(sim.log.at(-1)!.caught?.weight).toBe(0.42);
    expect(sim.log.at(-1)!.landed?.by).toBe('hand');
    expect(sim.s.stage).toBe('idle');
    expect(sim.s.landing).toBeNull();
  });

  it('vain isoimmat otetaan haaviin', () => {
    const sim = setup('easy', 1.3, 4);
    expect(untilSurface(sim, 180)).toBe(true);
    expect(sim.s.landing!.net).toBe(true);
    if (sim.s.landing!.lunge > 0) sim.s.landing!.lunge = 0;
    step(sim, { land: true });
    expect(sim.log.at(-1)!.landed?.by).toBe('net');
  });

  it('nosto riuhtaisun aikana voi päästää kalan irti, helpolla ei koskaan', () => {
    const lungeAndLift = (lungeEscape: number) => {
      const sim = setup('easy', 0.42, 2);
      expect(untilSurface(sim, 120)).toBe(true);
      const diff = sim.ctx.fish!.diff;
      sim.ctx.fish!.diff = { ...diff, landing: { lungeRate: 0, lungeEscape } };
      sim.s.landing!.lunge = 0.5;
      step(sim, { land: true });
      return sim;
    };
    const lost = lungeAndLift(1);
    expect(lost.log.at(-1)!.escaped).toBe(true);
    expect(lost.s.hookedId).toBeNull();
    const easy = lungeAndLift(DIFFICULTIES.easy.landing.lungeEscape);
    expect(easy.log.at(-1)!.escaped).toBeFalsy();
    expect(easy.s.hookedId).not.toBeNull();
    // Riuhtaisun jälkeen kala syöksyy takaisin väsytykseen.
    for (let i = 0; i < 40; i++) step(easy, {});
    expect(easy.s.landing).toBeNull();
    expect(easy.s.landCooldown).toBeGreaterThan(0);
  });

  it('helpolla riuhtaisuja on harvoin, realistisella usein', () => {
    expect(DIFFICULTIES.easy.landing.lungeRate).toBeLessThan(DIFFICULTIES.normal.landing.lungeRate);
    expect(DIFFICULTIES.normal.landing.lungeRate).toBeLessThan(
      DIFFICULTIES.realistic.landing.lungeRate,
    );
    expect(DIFFICULTIES.easy.landing.lungeEscape).toBe(0);
  });
});
