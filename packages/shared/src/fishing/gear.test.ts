import { describe, expect, it } from 'vitest';
import { Rng } from '../rng';
import { distance } from '../vec2';
import { predictLanding } from './cast';
import { DIFFICULTIES } from './difficulty';
import { lureAppeal, spawnFish, type FishPopulation, type LureInfo } from './fish';
import {
  createFishing,
  lureInfo,
  stepFishing,
  type FishingContext,
  type FishingEvents,
} from './fishing';
import {
  DEFAULT_TACKLE,
  breakingStrength,
  isTackle,
  parseTackle,
  tackleCastFactor,
  type Tackle,
} from './gear';
import type { Structure } from '../map/bottom';
import type { BottomType } from '../map/scatter';

const DT = 1 / 60;
const world = { isWater: (p: { x: number }) => Math.abs(p.x) < 500, depthAt: () => 6 };
const tackle = (t: Partial<Tackle>): Tackle => ({ ...DEFAULT_TACKLE, ...t });
const castLength = (t: Tackle) =>
  distance({ x: 0, y: 0 }, predictLanding({ x: 0, y: 0 }, 0, 1, tackleCastFactor(t)));

/** Viehe vedessä 20 m päässä; kelataan `reel`-ajan verran ja palautetaan syvyys. */
function depthAfter(t: Tackle, reelSeconds: number, restSeconds = 0): number {
  const s = createFishing(t);
  s.stage = 'water';
  s.lure = { x: 30, y: 0 };
  s.lineLength = 28.4;
  const ctx: FishingContext = { tubePos: { x: 0, y: 0 }, heading: 0, ...world };
  const input = { aim: { x: 30, y: 0 }, castHeld: false, cancel: false };
  for (let i = 0; i < restSeconds / DT; i++) stepFishing(s, { ...input, reel: false }, ctx, DT);
  for (let i = 0; i < reelSeconds / DT; i++) stepFishing(s, { ...input, reel: true }, ctx, DT);
  return s.depth;
}

describe('vieheet ja siimat', () => {
  it('raskas jigi ja ohut siima heittyvät pidemmälle', () => {
    expect(castLength(tackle({ lure: 'jig' }))).toBeGreaterThan(
      castLength(tackle({ lure: 'wobbler' })) + 5,
    );
    expect(castLength(tackle({ line: 'thin' }))).toBeGreaterThan(
      castLength(tackle({ line: 'thick' })),
    );
  });

  it('vaappu kelluu levossa ja sukeltaa kelatessa lippansa syvyyteen', () => {
    expect(depthAfter(tackle({ lure: 'wobbler' }), 0, 5)).toBe(0);
    const dived = depthAfter(tackle({ lure: 'wobbler' }), 8);
    expect(dived).toBeGreaterThan(1.5);
    expect(dived).toBeLessThanOrEqual(2.5);
  });

  it('jigi painuu pohjaan nopeammin kuin lippa', () => {
    const jig = depthAfter(tackle({ lure: 'jig' }), 0, 4);
    const spinner = depthAfter(tackle({ lure: 'spinner' }), 0, 4);
    expect(jig).toBeGreaterThan(spinner * 2);
  });

  it('vieheen sopivuus riippuu lajista ja peruke arkailuttaa ahventa', () => {
    const rng = new Rng(1);
    const pop: FishPopulation = { fish: [], nextId: 1, tick: 0 };
    const pike = spawnFish(pop, 'pike', { x: 0, y: 0 }, world, rng);
    const perch = spawnFish(pop, 'perch', { x: 0, y: 0 }, world, rng);
    pike.depth = perch.depth = 1;
    const lure = (t: Partial<Tackle>, speed: number): LureInfo => ({
      pos: { x: 1, y: 0 },
      depth: 1,
      speed,
      fishable: true,
      tip: { x: -20, y: 0 },
      tackle: tackle(t),
    });
    expect(lureAppeal(pike, lure({ lure: 'wobbler' }, 1))).toBeGreaterThan(
      lureAppeal(pike, lure({ lure: 'spinner' }, 1)),
    );
    expect(lureAppeal(perch, lure({ lure: 'spinner' }, 0.6))).toBeGreaterThan(
      lureAppeal(perch, lure({ lure: 'wobbler' }, 0.6)),
    );
    expect(lureAppeal(perch, lure({ leader: true }, 0.6))).toBeLessThan(
      lureAppeal(perch, lure({}, 0.6)),
    );
    expect(lureAppeal(pike, lure({ leader: true }, 1))).toBe(lureAppeal(pike, lure({}, 1)));
    // Paikallaan oleva jigi kiinnostaa, paikallaan oleva lippa tuskin.
    expect(lureAppeal(perch, lure({ lure: 'jig' }, 0))).toBeGreaterThan(
      lureAppeal(perch, lure({ lure: 'spinner' }, 0)) * 2,
    );
  });

  it('hauki puree siiman poikki ilman teräsperuketta', () => {
    const bitOffs = (leader: boolean) => {
      let n = 0;
      for (let seed = 1; seed <= 20; seed++) {
        const rng = new Rng(seed);
        const pop: FishPopulation = { fish: [], nextId: 1, tick: 0 };
        const f = spawnFish(pop, 'pike', { x: 20, y: 0 }, world, rng);
        f.weight = 1;
        f.mode = 'hooked';
        f.running = true;
        pop.fish.push(f);
        const s = createFishing(tackle({ leader }));
        s.stage = 'water';
        s.lure = { x: 20, y: 0 };
        s.lineLength = 18;
        s.hookedId = f.id;
        s.drag = 1;
        const ctx: FishingContext = {
          tubePos: { x: 0, y: 0 },
          heading: 0,
          ...world,
          fish: { pop, diff: DIFFICULTIES.normal, rng },
        };
        for (let i = 0; i < 40 / DT && s.hookedId !== null; i++) {
          const e: FishingEvents = stepFishing(
            s,
            { aim: { x: 20, y: 0 }, castHeld: false, reel: true, cancel: false },
            ctx,
            DT,
          );
          if (e.bitOff) n++;
        }
      }
      return n;
    };
    expect(bitOffs(false)).toBeGreaterThan(3);
    expect(bitOffs(true)).toBe(0);
  });

  it('varusteet vaihtuvat vain vieheen ollessa kelalla', () => {
    const s = createFishing();
    const ctx: FishingContext = { tubePos: { x: 0, y: 0 }, heading: 0, ...world };
    const input = { aim: { x: 30, y: 0 }, castHeld: false, reel: false, cancel: false };
    s.stage = 'water';
    s.lure = { x: 30, y: 0 };
    s.lineLength = 28.4;
    const jig = tackle({ lure: 'jig' });
    expect(stepFishing(s, { ...input, tackle: jig }, ctx, DT).tackleChanged).toBeUndefined();
    expect(s.tackle.lure).toBe('spoon');
    s.stage = 'idle';
    expect(stepFishing(s, { ...input, tackle: jig }, ctx, DT).tackleChanged).toBe(true);
    expect(s.tackle.lure).toBe('jig');
  });

  it('tunnistaa kelvolliset varusteet', () => {
    expect(isTackle(DEFAULT_TACKLE)).toBe(true);
    expect(isTackle({ lure: 'toString', line: 'thin', leader: false })).toBe(false);
    expect(isTackle({ lure: 'jig', line: 'thin' })).toBe(false);
    expect(isTackle({ ...DEFAULT_TACKLE, rod: 'toString' })).toBe(false);
  });

  it('vanha tallennus ilman vapaa ja perhovälineitä saa oletukset', () => {
    expect(parseTackle({ lure: 'jig', line: 'thin', leader: true })).toEqual({
      ...DEFAULT_TACKLE,
      rod: 'medium',
      lure: 'jig',
      line: 'thin',
      leader: true,
      method: 'spin',
    });
    expect(parseTackle({ lure: 'nope' })).toBeNull();
    expect(parseTackle('spoon')).toBeNull();
  });

  it('kevyt vapa heittää pidemmälle ja suojaa siimaa, järeä päinvastoin', () => {
    const light = tackle({ rod: 'light' });
    const heavy = tackle({ rod: 'heavy' });
    expect(castLength(light)).toBeGreaterThan(castLength(DEFAULT_TACKLE));
    expect(castLength(heavy)).toBeLessThan(castLength(DEFAULT_TACKLE));
    expect(breakingStrength(light)).toBeGreaterThan(breakingStrength(DEFAULT_TACKLE));
    expect(breakingStrength(heavy)).toBeLessThan(breakingStrength(DEFAULT_TACKLE));
  });
});

describe('pohjatartunta', () => {
  const rocks: Structure = { kind: 'rocks', pos: { x: 30, y: 0 }, radius: 12 };
  const reeds: Structure = {
    kind: 'reeds',
    pos: { x: 30, y: 0 },
    radius: 12,
    ring: [
      { x: 18, y: -8 },
      { x: 42, y: -8 },
      { x: 42, y: 8 },
      { x: 18, y: 8 },
    ],
  };
  /** Viehe rakenteen kohdalla, kelataan kunnes jotain tapahtuu. */
  function snagRun(
    seed: number,
    drag = 1,
    line: Tackle['line'] = 'medium',
    structure = rocks,
    lure: Tackle['lure'] = 'jig',
    jigging = true,
  ) {
    const rng = new Rng(seed);
    const s = createFishing(tackle({ lure, line }));
    s.stage = 'water';
    s.lure = { x: 32, y: 0 };
    s.lineLength = 30;
    s.depth = jigging ? 6 : 0;
    s.drag = drag;
    const ctx: FishingContext = {
      tubePos: { x: 0, y: 0 },
      heading: 0,
      ...world,
      structureAt: (p) => (distance(p, structure.pos) <= structure.radius ? structure : null),
      fish: { pop: { fish: [], nextId: 1, tick: 0 }, diff: DIFFICULTIES.normal, rng },
    };
    const log: FishingEvents[] = [];
    for (let i = 0; i < 30 / DT && s.stage === 'water'; i++) {
      // Nykäisyjigaus: kelataan ja tauotetaan, jolloin jigi painuu pohjaan.
      const reel = s.snag !== null || !jigging || Math.floor(i / 40) % 2 === 0;
      log.push(
        stepFishing(s, { aim: { x: 30, y: 0 }, castHeld: false, reel, cancel: false }, ctx, DT),
      );
    }
    return log;
  }

  it('pohjaa hipova viehe tarttuu kivikkoon ja irtoaa tai jää pohjaan', () => {
    let snagged = 0;
    let freed = 0;
    let lost = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const log = snagRun(seed);
      if (log.some((e) => e.snagged)) snagged++;
      if (log.some((e) => e.unsnagged)) freed++;
      if (log.some((e) => e.lureLost)) lost++;
    }
    expect(snagged).toBeGreaterThan(10);
    expect(freed).toBeGreaterThan(0);
    expect(lost).toBeGreaterThan(0);
  });

  it('pinnassa kelattu lippa tarttuu kaislikkoon mutta ei pohjan kivikkoon', () => {
    let inReeds = 0;
    let onRocks = 0;
    for (let seed = 1; seed <= 20; seed++) {
      if (snagRun(seed, 1, 'medium', reeds, 'spinner', false).some((e) => e.snagged)) inReeds++;
      if (snagRun(seed, 1, 'medium', rocks, 'spinner', false).some((e) => e.snagged)) onRocks++;
    }
    expect(inReeds).toBeGreaterThan(5);
    expect(onRocks).toBe(0);
  });

  it('liian kireä jarru katkaisee ohuen siiman tartunnassa heti', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const log = snagRun(seed, 6, 'thin');
      if (!log.some((e) => e.snagged)) continue;
      expect(log.some((e) => e.unsnagged)).toBe(false);
      expect(log.some((e) => e.lureLost)).toBe(true);
    }
  });
});

describe('kivet, kasvustot, risukot ja pohjan laatu (#226)', () => {
  /** Viehe kelataan 2 m:n syvyydessä rakenteen yli; jigi painuu pohjaan tauoilla. */
  function run(
    seed: number,
    lure: Tackle['lure'],
    structure: Structure | null,
    floor: BottomType = 'sand',
    depth = 2,
  ) {
    const rng = new Rng(seed);
    const s = createFishing(tackle({ lure }));
    s.stage = 'water';
    s.lure = { x: 32, y: 0 };
    s.lineLength = 30;
    s.depth = lure === 'wobbler' ? 0 : depth;
    const ctx: FishingContext = {
      tubePos: { x: 0, y: 0 },
      heading: 0,
      isWater: world.isWater,
      depthAt: () => depth,
      structureAt: (p) =>
        structure && distance(p, structure.pos) <= structure.radius ? structure : null,
      bottomTypeAt: () => floor,
      fish: { pop: { fish: [], nextId: 1, tick: 0 }, diff: DIFFICULTIES.normal, rng },
    };
    const log: FishingEvents[] = [];
    const states: { fouled: boolean; info: LureInfo | null }[] = [];
    for (let i = 0; i < 15 / DT && s.stage === 'water'; i++) {
      const reel = s.snag !== null || Math.floor(i / 40) % 2 === 0;
      log.push(
        stepFishing(s, { aim: { x: 30, y: 0 }, castHeld: false, reel, cancel: false }, ctx, DT),
      );
      states.push({ fouled: s.fouled, info: lureInfo(s, ctx) });
    }
    return { log, states, s };
  }
  const boulder: Structure = {
    kind: 'boulder',
    pos: { x: 27, y: 0 },
    radius: 1.5,
    height: 0.8,
  };
  const weed: Structure = {
    kind: 'weed',
    pos: { x: 22, y: 0 },
    radius: 8,
    height: 1,
    density: 1,
  };
  const count = (
    lure: Tackle['lure'],
    st: Structure | null,
    ev: keyof FishingEvents,
    floor?: BottomType,
  ) => {
    let n = 0;
    for (let seed = 1; seed <= 30; seed++)
      if (run(seed, lure, st, floor).log.some((e) => e[ev])) n++;
    return n;
  };

  it('jigi tarttuu kiveen useammin kuin vaappu ja lippa, jonka siipi suojaa koukkua', () => {
    const jig = count('jig', boulder, 'snagged');
    const wobbler = count('wobbler', boulder, 'snagged');
    const spinner = count('spinner', boulder, 'snagged');
    expect(jig).toBeGreaterThan(wobbler);
    expect(wobbler).toBeGreaterThanOrEqual(spinner);
    expect(jig).toBeGreaterThan(4);
  });

  it('kasvustosta viehe kerää rikkaa, joka vie houkuttelevuuden kunnes viehe puhdistetaan', () => {
    const { log, states, s } = run(3, 'spoon', weed);
    const at = log.findIndex((e) => e.fouled);
    expect(at).toBeGreaterThanOrEqual(0);
    const info = states[at]!.info!;
    expect(info.fouled).toBe(true);
    const fish = spawnFish(
      { fish: [], nextId: 1, tick: 0 },
      'perch',
      { x: 20, y: 0 },
      { isWater: () => true, depthAt: () => 2 },
      new Rng(1),
    );
    fish.depth = info.depth;
    const clean = lureAppeal(fish, { ...info, fouled: false });
    expect(lureAppeal(fish, info)).toBeLessThan(clean * 0.1);
    // Kotiin kelattu viehe on taas puhdas.
    if (s.stage === 'idle') expect(s.fouled).toBe(false);
  });

  it('liejussa jigi tarttuu kevyesti ja irtoaa aina ensimmäisellä vedolla', () => {
    for (let seed = 1; seed <= 15; seed++) {
      const { log } = run(seed, 'jig', null, 'mud');
      const at = log.findIndex((e) => e.snagged);
      // Viimeisinä sekunteina tarttunutta ei ehditty irrottaa.
      if (at < 0 || at > log.length - 2 / DT) continue;
      expect(log.some((e) => e.lureLost)).toBe(false);
      expect(log.slice(at).some((e) => e.unsnagged)).toBe(true);
    }
    expect(count('jig', null, 'snagged', 'mud')).toBeGreaterThan(3);
    expect(count('jig', null, 'snagged', 'sand')).toBe(0);
  });

  it('kivikkopohjassa jigi kolisee, hiekalla ei', () => {
    expect(count('jig', null, 'rattle', 'rock')).toBeGreaterThan(25);
    expect(count('jig', null, 'rattle', 'sand')).toBe(0);
  });
});
