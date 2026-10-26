import { describe, expect, it } from 'vitest';
import { Rng } from '../rng';
import { distance } from '../vec2';
import { predictLanding } from './cast';
import { DIFFICULTIES, type Difficulty } from './difficulty';
import { lureAppeal, spawnFish, type FishPopulation, type LureInfo } from './fish';
import {
  FLY,
  createFishing,
  holdForce,
  lureInfo,
  stepFishing,
  type FishingContext,
  type FishingEvents,
  type FishingInput,
  type FishingState,
} from './fishing';
import {
  DEFAULT_TACKLE,
  FLY_IDS,
  MAX_CAST_FACTOR,
  baitOf,
  breakingStrength,
  describeFullTackle,
  parseTackle,
  tackleCastFactor,
  type Tackle,
} from './gear';

const DT = 1 / 60;
const world = { isWater: (p: { x: number }) => Math.abs(p.x) < 500, depthAt: () => 6 };
const fly = (t: Partial<Tackle> = {}): Tackle => ({ ...DEFAULT_TACKLE, method: 'fly', ...t });
const castLength = (t: Tackle) =>
  distance({ x: 0, y: 0 }, predictLanding({ x: 0, y: 0 }, 0, 1, tackleCastFactor(t)));
const idle: FishingInput = { aim: { x: 20, y: 0 }, castHeld: false, reel: false, cancel: false };

/** Perho vedessä 20 m päässä. */
function inWater(t: Tackle): { s: FishingState; ctx: FishingContext } {
  const s = createFishing(t);
  s.stage = 'water';
  s.lure = { x: 20, y: 0 };
  s.lineLength = 18.4;
  return { s, ctx: { tubePos: { x: 0, y: 0 }, heading: 0, ...world } };
}

const run = (
  s: FishingState,
  ctx: FishingContext,
  input: Partial<FishingInput>,
  seconds: number,
): FishingEvents => {
  const all: FishingEvents = {};
  for (let i = 0; i < seconds / DT; i++)
    Object.assign(all, stepFishing(s, { ...idle, ...input }, ctx, DT));
  return all;
};

describe('perhovälineet (#234)', () => {
  it('perhoheitto jää 12–25 metriin ja aina virveliheittoa lyhyemmäksi', () => {
    for (const id of FLY_IDS) {
      const d = castLength(fly({ fly: id }));
      expect(d, id).toBeGreaterThan(12);
      expect(d, id).toBeLessThan(25);
      expect(tackleCastFactor(fly({ fly: id }))).toBeLessThan(MAX_CAST_FACTOR);
    }
    expect(castLength(DEFAULT_TACKLE)).toBeGreaterThan(castLength(fly()) + 10);
  });

  it('kevyt #6 ei käännä isoa hauki-streameria', () => {
    const small = castLength(fly({ flyRod: 'fly6', fly: 'pikeStreamer' }));
    expect(small).toBeLessThan(castLength(fly({ flyRod: 'fly8', fly: 'pikeStreamer' })));
    expect(castLength(fly({ flyRod: 'fly6', fly: 'nymph' }))).toBeGreaterThan(
      castLength(fly({ flyRod: 'fly8', fly: 'nymph' })),
    );
  });

  it('perukkeen kestävyys ja vapaluokka määräävät katkeamisen', () => {
    expect(breakingStrength(fly({ flyLeader: 'fluoro' }))).toBeGreaterThan(
      breakingStrength(fly({ flyLeader: 'mono' })),
    );
    expect(breakingStrength(fly({ flyRod: 'fly6' }))).toBeGreaterThan(
      breakingStrength(fly({ flyRod: 'fly10' })),
    );
  });

  it('varusteet kuvataan perhon mukaan, ja virvelin valinnat säilyvät tallessa', () => {
    expect(describeFullTackle(fly())).toBe('Perhovapa #8 · Hauki-streameri · Kelluva · Teräs');
    const t = parseTackle({ ...fly(), lure: 'jig' });
    expect(t).toEqual({ ...fly(), lure: 'jig' });
    expect(parseTackle({ ...fly(), fly: 'dynamite' })).toBeNull();
    expect(parseTackle({ ...fly(), method: 'net' })).toBeNull();
  });

  it('popperi pysyy pinnassa, kelluvalla siimalla streameri jää perukkeen syvyyteen', () => {
    const depth = (t: Tackle) => {
      const { s, ctx } = inWater(t);
      run(s, ctx, {}, 30);
      return s.depth;
    };
    expect(depth(fly({ fly: 'popper' }))).toBe(0);
    expect(depth(fly({ fly: 'nymph' }))).toBeCloseTo(1.2);
    expect(depth(fly({ fly: 'nymph', flyLine: 'sinking' }))).toBeGreaterThan(3);
    expect(baitOf(fly({ fly: 'popper' })).surface).toBe(true);
  });
});

describe('perhon uitto vedoilla (#234)', () => {
  it('veto tuo perhoa ja kerää löysää renkaan eteen, tauolla perho pysähtyy', () => {
    const { s, ctx } = inWater(fly());
    run(s, ctx, { lineHand: true, strip: FLY.steadyStrip * DT }, 2);
    expect(s.slack).toBeCloseTo(1.2, 1);
    expect(s.lureSpeed).toBeGreaterThan(0.4);
    expect(distance(s.lure, { x: 1.6, y: 0 })).toBeLessThan(18.4 - 0.8);
    run(s, ctx, { lineHand: true }, 1);
    expect(s.lureSpeed).toBe(0);
    expect(s.stillTime).toBeGreaterThan(0.9);
    expect(lureInfo(s, ctx)?.pause).toBeCloseTo(s.stillTime);
  });

  it('nopea hiiren veto ei vedä yli suurimman vetonopeuden', () => {
    const { s, ctx } = inWater(fly());
    stepFishing(s, { ...idle, lineHand: true, strip: 5 }, ctx, DT);
    expect(s.slack).toBeCloseTo(FLY.maxStripSpeed * DT);
  });

  it('popperi pulpahtaa vedon alkaessa', () => {
    const { s, ctx } = inWater(fly({ fly: 'popper' }));
    const e = stepFishing(s, { ...idle, lineHand: true, strip: 0.05 }, ctx, DT);
    expect(e.pop).toBe(true);
  });

  it('siimakädessä virvelin kelaus ei tuo perhoa', () => {
    const { s, ctx } = inWater(fly());
    run(s, ctx, { reel: true }, 2);
    expect(s.lineLength).toBeCloseTo(18.4);
  });

  it('löysät kelalle: sen jälkeen kelataan ja jarru pitää', () => {
    const { s, ctx } = inWater(fly());
    run(s, ctx, { lineHand: true, strip: FLY.steadyStrip * DT }, 3);
    expect(holdForce(s, { lineHand: true })).toBe(Infinity);
    expect(holdForce(s, { lineHand: false })).toBe(FLY.fingerDrag);
    const e = run(s, ctx, { reelSlack: true }, 2);
    expect(e.onReel).toBe(true);
    expect(s.onReel).toBe(true);
    expect(s.slack).toBe(0);
    expect(holdForce(s, { lineHand: false })).toBe(s.drag);
    const before = s.lineLength;
    run(s, ctx, { reel: true }, 1);
    expect(s.lineLength).toBeLessThan(before - 0.5);
  });

  it('heitto ampuu löysän; liian iso löysä voi sotkeutua (ei helpolla)', () => {
    const tangles = (difficulty: Difficulty, slack: number) => {
      let n = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const s = createFishing(fly());
        s.slack = slack;
        const ctx: FishingContext = {
          tubePos: { x: 0, y: 0 },
          heading: 0,
          ...world,
          fish: {
            pop: { fish: [], nextId: 1, tick: 0 },
            diff: DIFFICULTIES[difficulty],
            rng: new Rng(seed),
          },
        };
        run(s, ctx, { castHeld: true }, 0.5);
        const e = stepFishing(s, idle, ctx, DT);
        if (e.flyTangle) n++;
      }
      return n;
    };
    expect(tangles('normal', 18)).toBe(0);
    expect(tangles('normal', 45)).toBeGreaterThan(5);
    expect(tangles('easy', 45)).toBe(0);
  });
});

describe('vastaisku ja väsytys siimakädellä (#234)', () => {
  /** Hauki on iskenyt perhoon; palauttaa tila ja kontekstin. */
  function struck(seed: number, difficulty: Difficulty = 'normal') {
    const rng = new Rng(seed);
    const pop: FishPopulation = { fish: [], nextId: 1, tick: 0 };
    const f = spawnFish(pop, 'pike', { x: 20, y: 0 }, world, rng);
    f.weight = 2;
    f.mode = 'struck';
    pop.fish.push(f);
    const { s } = inWater(fly());
    const ctx: FishingContext = {
      tubePos: { x: 0, y: 0 },
      heading: 0,
      ...world,
      fish: { pop, diff: DIFFICULTIES[difficulty], rng, strike: f.id },
    };
    return { s, ctx, f };
  }

  it('siimakäden veto pistää, vavan nosto pistää realistisella huonommin', () => {
    const hooks = (input: Partial<FishingInput>) => {
      let n = 0;
      for (let seed = 1; seed <= 60; seed++) {
        const { s, ctx } = struck(seed, 'realistic');
        stepFishing(s, idle, ctx, DT);
        ctx.fish!.strike = undefined;
        const e = stepFishing(s, { ...idle, lineHand: true, ...input }, ctx, DT);
        if (e.hooked) n++;
      }
      return n;
    };
    const strip = hooks({ strip: 0.02 });
    const lift = hooks({ rodLift: true });
    expect(strip).toBeGreaterThan(35);
    expect(lift).toBeLessThan(strip - 10);
    expect(lift).toBeGreaterThan(10);
    expect(hooks({})).toBe(0);
  });

  it('avoimesta kädestä kala vie siimaa, puristettuna iso kala katkaisee perukkeen', () => {
    const { s, ctx, f } = struck(3);
    ctx.fish!.diff = DIFFICULTIES.easy;
    stepFishing(s, idle, ctx, DT);
    expect(s.hookedId).toBe(f.id);
    ctx.fish!.diff = DIFFICULTIES.normal;
    ctx.fish!.strike = undefined;
    s.slack = 5;
    // Kala pakenee poispäin renkaasta.
    f.heading = 0;
    f.running = true;
    f.timer = 5;
    const start = s.lineLength;
    let slipped = false;
    for (let i = 0; i < 3 / DT; i++) {
      stepFishing(s, idle, ctx, DT);
      slipped ||= s.fingerSlip;
    }
    expect(slipped).toBe(true);
    expect(s.lineLength).toBeGreaterThan(start);
    expect(s.tension).toBeLessThanOrEqual(FLY.fingerDrag + 1e-9);

    // Jättikala ja siima puristettuna: peruke katkeaa.
    f.weight = 12;
    f.stamina = 1;
    f.running = true;
    let broke = false;
    for (let i = 0; i < 20 / DT && !broke; i++) {
      const e = stepFishing(s, { ...idle, lineHand: true }, ctx, DT);
      broke = e.lineBroken === true;
    }
    expect(broke).toBe(true);
  });
});

describe('perho kaloille (#234)', () => {
  it('hauki iskee perhoon herkimmin vedon jälkeisellä tauolla', () => {
    const rng = new Rng(2);
    const pop: FishPopulation = { fish: [], nextId: 1, tick: 0 };
    const pike = spawnFish(pop, 'pike', { x: 0, y: 0 }, world, rng);
    pike.depth = 0.5;
    const info = (pause: number): LureInfo => ({
      pos: { x: 1, y: 0 },
      depth: 0.5,
      speed: 0,
      fishable: true,
      tip: { x: -20, y: 0 },
      tackle: fly(),
      pause,
    });
    expect(lureAppeal(pike, info(1))).toBeGreaterThan(lureAppeal(pike, info(10)) * 1.5);
    expect(lureAppeal(pike, info(0))).toBeCloseTo(lureAppeal(pike, info(10)));
  });
});
