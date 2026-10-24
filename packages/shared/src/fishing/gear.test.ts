import { describe, expect, it } from 'vitest';
import { Rng } from '../rng';
import { distance } from '../vec2';
import { predictLanding } from './cast';
import { DIFFICULTIES } from './difficulty';
import { lureAppeal, spawnFish, type FishPopulation, type LureInfo } from './fish';
import { createFishing, stepFishing, type FishingContext, type FishingEvents } from './fishing';
import { DEFAULT_TACKLE, isTackle, tackleCastFactor, type Tackle } from './gear';

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

  it('vieheen sopivuus riippuu lajista ja perukka arkailuttaa ahventa', () => {
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

  it('hauki purkaa siiman poikki ilman teräsperukkaa', () => {
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
  });
});
