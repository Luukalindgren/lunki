import { describe, expect, it } from 'vitest';
import { Rng } from '../rng';
import { distance } from '../vec2';
import { tackleTip } from './cast';
import { DIFFICULTIES, type Difficulty } from './difficulty';
import { SPECIES, lureAppeal, spawnFish, type FishPopulation, type LureInfo } from './fish';
import {
  createFishing,
  lureInfo,
  stepFishing,
  type FishingContext,
  type FishingEvents,
  type FishingInput,
  type FishingState,
} from './fishing';
import {
  DEFAULT_TACKLE,
  POLE,
  clampFloatDepth,
  describeTackle,
  parseTackle,
  type Tackle,
} from './gear';

const DT = 1 / 60;
const world = { isWater: (p: { x: number }) => Math.abs(p.x) < 500, depthAt: () => 6 };
const pole = (t: Partial<Tackle> = {}): Tackle => ({ ...DEFAULT_TACKLE, method: 'pole', ...t });
const ctx: FishingContext = { tubePos: { x: 0, y: 0 }, heading: 0, ...world };
const idle: FishingInput = { aim: { x: 30, y: 0 }, castHeld: false, reel: false, cancel: false };

function run(s: FishingState, seconds: number, i: FishingInput, c = ctx): FishingEvents[] {
  const out: FishingEvents[] = [];
  for (let t = 0; t < seconds; t += DT) out.push(stepFishing(s, i, c, DT));
  return out;
}

/** Ongen heitto täysillä: koho laskeutuu siiman mitan päähän vavan kärjestä. */
function cast(t: Tackle = pole()): FishingState {
  const s = createFishing(t);
  stepFishing(s, { ...idle, castHeld: true }, ctx, DT);
  run(s, 2, { ...idle, castHeld: true });
  stepFishing(s, idle, ctx, DT);
  run(s, 4, idle);
  return s;
}

describe('onki (#570)', () => {
  it('koho lentää enintään siiman mitan vavan kärjestä ja jää säädettyyn syvyyteen', () => {
    const s = cast(pole({ floatDepth: 1.25 }));
    expect(s.stage).toBe('water');
    const tip = tackleTip(s.tackle, ctx.tubePos, ctx.heading);
    expect(distance(s.lure, tip)).toBeLessThanOrEqual(POLE.line + 1e-6);
    expect(distance(s.lure, ctx.tubePos)).toBeGreaterThan(POLE.reach);
    run(s, 10, idle);
    expect(s.depth).toBeCloseTo(1.25);
    // Ilman painallusta koho pysyy paikallaan, sillä siimaa ei kelata.
    const at = { ...s.lure };
    run(s, 10, idle);
    expect(distance(s.lure, at)).toBeLessThan(0.05);
  });

  it('matalassa syötti on pohjalla', () => {
    const s = cast(pole({ floatDepth: 4 }));
    run(s, 10, idle, { ...ctx, depthAt: () => 1.5 });
    expect(s.depth).toBeCloseTo(1.5);
  });

  it('NOSTA ilman kalaa nostaa kohon vedestä', () => {
    const s = cast();
    stepFishing(s, idle, ctx, DT);
    const e = stepFishing(s, { ...idle, reel: true }, ctx, DT);
    expect(e.home).toBe(true);
    expect(s.stage).toBe('idle');
  });

  it('kalat kalastajan läheltä arkailevat, vaikka kärki on kaukana', () => {
    const s = cast();
    const info = lureInfo(s, ctx)!;
    expect(distance(info.tip, ctx.tubePos)).toBe(0);
  });

  it('syötti kiinnostaa ahventa enemmän kuin haukea', () => {
    const s = cast();
    const info = lureInfo(s, ctx) as LureInfo;
    const pop: FishPopulation = { fish: [], nextId: 1, tick: 0 };
    const rng = new Rng(5);
    const of = (sp: 'perch' | 'pike') => {
      const f = spawnFish(pop, sp, { ...s.lure }, world, rng);
      f.depth = info.depth;
      return lureAppeal(f, info);
    };
    expect(of('perch') * SPECIES.perch.baitInterest).toBeGreaterThan(
      of('pike') * SPECIES.pike.baitInterest * 5,
    );
  });

  it('kohon syvyys rajataan ja asetus kulkee tallennuksen läpi', () => {
    expect(clampFloatDepth(0.1)).toBe(POLE.minDepth);
    expect(clampFloatDepth(9)).toBe(POLE.maxDepth);
    expect(clampFloatDepth(1.3)).toBe(1.25);
    const t = pole({ bait: 'maggot', floatDepth: 2.5 });
    expect(parseTackle(JSON.parse(JSON.stringify(t)))).toEqual(t);
    expect(describeTackle(t)).toContain('Toukka');
  });
});

describe('ongen tärppi ja väsytys', () => {
  /** Ahven on tarttunut syöttiin; palauttaa tilan, kontekstin ja kalan. */
  function bite(seed: number, difficulty: Difficulty = 'normal') {
    const s = cast();
    const rng = new Rng(seed);
    const pop: FishPopulation = { fish: [], nextId: 1, tick: 0 };
    const f = spawnFish(pop, 'perch', { ...s.lure }, world, rng);
    f.weight = 0.4;
    f.mode = 'struck';
    pop.fish.push(f);
    const c: FishingContext = {
      ...ctx,
      fish: { pop, diff: DIFFICULTIES[difficulty], rng, strike: f.id },
    };
    const first = stepFishing(s, idle, c, DT);
    c.fish!.strike = undefined;
    return { s, c, f, first };
  }

  /** Odottaa vientiä (koho painuu) ja palauttaa sen tapahtumat. */
  function waitRun(s: FishingState, c: FishingContext) {
    for (let t = 0; t < 10; t += DT) {
      const e = stepFishing(s, idle, c, DT);
      if (e.strike) return e;
    }
    return null;
  }

  it('tärppi alkaa näykinnällä, ja liian aikainen vastaisku vie syötin', () => {
    const { s, c, first } = bite(1);
    expect(first.nibble).toBe(true);
    expect(s.hookedId).toBeNull();
    const e = stepFishing(s, { ...idle, reel: true }, c, DT);
    expect(e.missed).toBe(true);
    expect(e.missedPole).toBe('early');
    expect(s.stage).toBe('idle');
  });

  it('vastaisku viennin aikana tarttuu, ja pystyssä pidetty vapa tuo kalan nostettavaksi', () => {
    let hooked = 0;
    let landed = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const { s, c } = bite(seed);
      expect(waitRun(s, c)).not.toBeNull();
      const e = stepFishing(s, { ...idle, reel: true }, c, DT);
      // Ohi mennyt vastaisku kertoo, ettei koukku tarttunut, ei näykinnästä.
      if (e.missed) expect(e.missedPole).toBe('set');
      if (!e.hooked) continue;
      hooked++;
      // Vastaiskun painallus ei nosta kohoa vedestä: kala on yhä kiinni.
      expect(s.stage).toBe('water');
      for (let t = 0; t < 60 && s.hookedId !== null; t += DT) {
        const ev = stepFishing(s, { ...idle, reel: true, land: s.landing !== null }, c, DT);
        if (ev.caught) landed++;
      }
    }
    expect(hooked).toBeGreaterThan(10);
    expect(landed).toBeGreaterThan(hooked * 0.7);
  });

  it('ilman vastaiskua kala sylkee syötin', () => {
    const { s, c } = bite(2);
    expect(waitRun(s, c)).not.toBeNull();
    const misses = run(s, 5, idle, c).filter((e) => e.missed);
    expect(misses.map((e) => e.missedPole)).toEqual(['late']);
    expect(s.hookedId).toBeNull();
  });

  it('helpolla koukku tarttuu itsestään viennin alkaessa', () => {
    const { s, c } = bite(3, 'easy');
    const e = waitRun(s, c);
    expect(e?.hooked).toBe(true);
  });

  it('laskettu vapa antaa kalan viedä siimaa enintään siiman mitan', () => {
    const { s, c, f } = bite(4, 'easy');
    waitRun(s, c);
    expect(s.hookedId).toBe(f.id);
    f.weight = 3;
    f.heading = 0;
    f.running = true;
    f.timer = 5;
    s.lineLength = 2;
    let slipped = false;
    for (let t = 0; t < 3; t += DT) {
      stepFishing(s, idle, c, DT);
      slipped ||= s.dragSlipping;
      expect(s.lineLength).toBeLessThanOrEqual(POLE.line + 1e-9);
    }
    expect(slipped).toBe(true);
    expect(s.lineLength).toBeGreaterThan(2);
  });
});
