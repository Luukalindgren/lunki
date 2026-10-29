import { describe, expect, it } from 'vitest';
import { Rng } from '../rng';
import { distance } from '../vec2';
import { DIFFICULTIES, type Difficulty } from './difficulty';
import { createFishing, lineStrength, stepFishing, type FishingContext } from './fishing';
import {
  FLY_CAST,
  createFlyCast,
  idealArc,
  stepFlyCast,
  type FlyCastEnv,
  type FlyCastEvents,
  type FlyCastState,
} from './flyCast';
import { DEFAULT_TACKLE, breakingStrength, type Tackle } from './gear';

const DT = 1 / 60;
const env = (difficulty: Difficulty = 'normal', more: Partial<FlyCastEnv> = {}): FlyCastEnv => ({
  assist: DIFFICULTIES[difficulty].flyCast,
  power: 1,
  random: () => 0,
  ...more,
});

/** Kerää askelten tapahtumat; `slipped` lasketaan yhteen. */
function collect(all: FlyCastEvents, ev: FlyCastEvents): void {
  const slipped = (all.slipped ?? 0) + (ev.slipped ?? 0);
  Object.assign(all, ev);
  if (slipped > 0) all.slipped = slipped;
}

/** Tasainen liike kohtaan `to` ajassa `time`, ja pysäytys. */
function stroke(
  c: FlyCastState,
  e: FlyCastEnv,
  to: number,
  time: number,
  opts: { grip?: boolean; haul?: boolean } = {},
): FlyCastEvents {
  const all: FlyCastEvents = {};
  const steps = Math.max(1, Math.round(time / DT));
  const step = (to - c.rod) / steps;
  for (let i = 0; i < steps; i++)
    collect(all, stepFlyCast(c, { rod: step, grip: opts.grip ?? true, haul: opts.haul }, e, DT));
  for (let i = 0; i < 3; i++) collect(all, stepFlyCast(c, { rod: 0, grip: true }, e, DT));
  return all;
}

/** Odottaa, kunnes siima on suorassa (tai `seconds` kuluu). */
function waitStraight(c: FlyCastState, e: FlyCastEnv, grip = true, seconds = 3): FlyCastEvents {
  const all: FlyCastEvents = {};
  for (let i = 0; i < seconds / DT && c.phase === 'loop'; i++) {
    const ev = stepFlyCast(c, { rod: 0, grip }, e, DT);
    collect(all, ev);
    if (ev.straight) break;
  }
  return all;
}

const wait = (c: FlyCastState, e: FlyCastEnv, seconds: number, grip = true): FlyCastEvents => {
  const all: FlyCastEvents = {};
  for (let i = 0; i < seconds / DT; i++) collect(all, stepFlyCast(c, { rod: 0, grip }, e, DT));
  return all;
};

/**
 * Taitava heittäjä: valeheitot oikealla kaarella ja ajoituksella. Siimakäsi
 * avataan silmukan auetessa, kunnes siimaa on `target` m; viimeisessä
 * eteenheitossa siima ammutaan.
 */
function cast(e: FlyCastEnv, target: number, shoot = true) {
  const c = createFlyCast(FLY_CAST.startAerial, false);
  const all: FlyCastEvents = {};
  for (let i = 0; i < 20; i++) {
    const arc = idealArc(c.aerial) / 2;
    collect(all, stroke(c, e, -arc, 0.15));
    collect(all, waitStraight(c, e, c.aerial >= target));
    const last = c.aerial >= target;
    collect(all, stroke(c, e, arc, 0.15));
    const ev = waitStraight(c, e, !(last && shoot) && c.aerial >= target);
    collect(all, ev);
    if (last) {
      collect(all, wait(c, e, 2, !shoot));
      return { c, ev: all };
    }
  }
  throw new Error('heitto ei valmistunut');
}

describe('perhoheiton rytmi (#235)', () => {
  it('pysäytys lähettää silmukan, joka suoristuu ajassa siima / nopeus', () => {
    const c = createFlyCast(8, false);
    const e = env();
    const ev = stroke(c, e, -idealArc(8) / 2, 0.15);
    expect(ev.stop?.dir).toBe(-1);
    expect(c.phase).toBe('loop');
    expect(c.loopTime).toBeCloseTo(8 / c.lineSpeed);
    let t = 0;
    while (!stepFlyCast(c, { rod: 0, grip: true }, e, DT).straight) t += DT;
    expect(t).toBeGreaterThan(c.loopTime - 2 * DT - 0.06);
    expect(t).toBeLessThan(c.loopTime + DT);
  });

  it('pitkä siima vaatii laajemman liikkeen ja pidemmän tauon', () => {
    expect(idealArc(5)).toBeCloseTo(0.5);
    expect(idealArc(18)).toBeCloseTo(1.35);
    const pause = (aerial: number) => {
      const c = createFlyCast(aerial, false);
      stroke(c, env(), -idealArc(aerial) / 2, 0.15);
      return c.loopTime;
    };
    expect(pause(16)).toBeGreaterThan(pause(6) * 1.3);
  });

  it('lyhyt katkos kesken liikkeen ei katkaise liikettä kahdeksi', () => {
    const e = env();
    const c = createFlyCast(10, false);
    for (let i = 0; i < 5; i++) stepFlyCast(c, { rod: -0.08, grip: true }, e, DT);
    wait(c, e, 3 * DT);
    expect(c.phase).toBe('loop');
    for (let i = 0; i < 5; i++) stepFlyCast(c, { rod: -0.08, grip: true }, e, DT);
    wait(c, e, 3 * DT);
    expect(c.strokes).toBe(1);
    expect(c.strokeStart).toBeCloseTo(0.6);
    expect(c.loopTime).toBeGreaterThan(0);
  });

  it('eteenpäin heilautus valmiusasennosta ei vielä heitä', () => {
    const c = createFlyCast(FLY_CAST.startAerial, false);
    const ev = stroke(c, env(), 1, 0.1);
    expect(ev.stop).toBeUndefined();
    expect(ev.landed).toBeUndefined();
  });

  it('valeheitoilla siima pitenee, ja ammuttu heitto lentää 12–25 m', () => {
    const { ev } = cast(env(), 14);
    expect(ev.crack).toBeUndefined();
    expect(ev.landed!.distance).toBeGreaterThan(18);
    expect(ev.landed!.distance).toBeLessThanOrEqual(FLY_CAST.maxAerial);
    expect(ev.landed!.wide).toBe(false);
    // Ilman ammuntaa heitto jää valeheittojen mittaan.
    const plain = cast(env(), 10, false).ev.landed!.distance;
    expect(plain).toBeGreaterThan(10);
    expect(plain).toBeLessThan(cast(env(), 10).ev.landed!.distance - 4);
  });

  it('puristettu siima ei luista normaalilla, helpolla luistaa itsestään', () => {
    for (const [difficulty, grows] of [
      ['normal', false],
      ['easy', true],
    ] as const) {
      const c = createFlyCast(8, false);
      const e = env(difficulty);
      stroke(c, e, -idealArc(8) / 2, 0.15);
      const ev = waitStraight(c, e, true);
      expect(c.aerial > 8, difficulty).toBe(grows);
      expect((ev.slipped ?? 0) > 0, difficulty).toBe(grows);
    }
  });
});

describe('perhoheiton virheet (#235)', () => {
  it('liian aikainen suunnanvaihto läimäyttää ja heikentää heittoa', () => {
    const e = env();
    const c = createFlyCast(10, false);
    stroke(c, e, -idealArc(10) / 2, 0.15);
    const good = createFlyCast(10, false);
    stroke(good, e, -idealArc(10) / 2, 0.15);
    waitStraight(good, e);
    const ok = stroke(good, e, idealArc(10) / 2, 0.15);
    const bad = stroke(c, e, idealArc(10) / 2, 0.15);
    expect(bad.crack).toBe(true);
    expect(ok.crack).toBeUndefined();
    expect(bad.stop!.speed).toBeLessThan(ok.stop!.speed * 0.5);
  });

  it('realistisella läimäys voi katkaista perhon', () => {
    const c = createFlyCast(10, false);
    const e = env('realistic', { random: () => 0.1 });
    stroke(c, e, -idealArc(10) / 2, 0.15);
    const ev = stroke(c, e, idealArc(10) / 2, 0.15);
    expect(ev.flyLost).toBe(true);
    expect(c.phase).toBe('ready');
  });

  it('myöhästynyt takaheitto putoaa veteen, eteenheitto laskeutuu', () => {
    const e = env();
    const c = createFlyCast(10, false);
    stroke(c, e, -idealArc(10) / 2, 0.15);
    const fell = wait(c, e, 3);
    expect(fell.straight).toBe(-1);
    expect(fell.fell).toBe(true);
    expect(c.inWater).toBe(true);
    // Vedestä taaksepäin on nosto, eteenpäin rullaheitto.
    const roll = stroke(c, e, 1, 0.12);
    expect(roll.landed?.roll).toBe(true);
    expect(roll.landed!.distance).toBeLessThanOrEqual(FLY_CAST.rollMax);
  });

  it('liian lyhyt liike pitkälle siimalle ei jaksa', () => {
    const e = env();
    const c = createFlyCast(18, false);
    const ev = stroke(c, e, c.rod - 0.3, 0.1);
    expect(ev.collapsed).toBe(true);
    expect(ev.fell).toBe(true);
  });

  it('laimea pysäytys ja liian laaja liike avaavat silmukan', () => {
    const e = env();
    // Liike hidastuu pitkään ennen pysähdystä.
    const slow = createFlyCast(10, false);
    const steps = 30;
    for (let i = 0; i < steps; i++)
      stepFlyCast(slow, { rod: (-1.2 * (steps - i)) / steps / 15, grip: true }, e, DT);
    wait(slow, e, 0.1);
    expect(slow.wide).toBe(true);
    const wide = createFlyCast(5, false);
    stroke(wide, e, -1, 0.2);
    expect(wide.wide).toBe(true);
    const tight = createFlyCast(10, false);
    stroke(tight, e, -idealArc(10) / 2, 0.15);
    expect(tight.wide).toBe(false);
  });

  it('auki oleva siimakäsi liikkeen aikana jättää vavan latautumatta, veto nopeuttaa', () => {
    const speed = (opts: { grip?: boolean; haul?: boolean }) => {
      const c = createFlyCast(10, false);
      return stroke(c, env(), -idealArc(10) / 2, 0.3, opts).stop!.speed;
    };
    const base = speed({});
    expect(speed({ grip: false })).toBeCloseTo(base * FLY_CAST.looseGrip);
    expect(speed({ haul: true })).toBeCloseTo(base * FLY_CAST.haulBoost);
  });

  it('veto hetkeä ennen liikettä lasketaan, ja osunut veto ilmoitetaan (#398)', () => {
    const speed = (early: number) => {
      const c = createFlyCast(10, false);
      const ev = stepFlyCast(c, { rod: 0, grip: true, haul: true }, env(), DT);
      expect(ev.haul).toBeUndefined();
      wait(c, env(), early);
      const all = stroke(c, env(), -idealArc(10) / 2, 0.3);
      return { speed: all.stop!.speed, haul: all.haul === true };
    };
    const base = speed(1).speed;
    expect(speed(1).haul).toBe(false);
    const early = speed(FLY_CAST.haulEarly / 2);
    expect(early.haul).toBe(true);
    expect(early.speed).toBeCloseTo(base * FLY_CAST.haulBoost);
  });

  it('realistisella äkkinäinen kiihdytys lopussa tekee tuulisolmun', () => {
    const e = env('realistic');
    const c = createFlyCast(10, false);
    for (let i = 0; i < 12; i++) stepFlyCast(c, { rod: -0.015, grip: true }, e, DT);
    const ev = stepFlyCast(c, { rod: -0.35, grip: true }, e, DT);
    Object.assign(ev, wait(c, e, 0.1));
    expect(ev.knot).toBe(true);
  });

  it('takaheitto rantaan tai kaislikkoon tarttuu, ja irrotus vie aikaa', () => {
    const e = env('normal', { blockedBehind: (d) => d > 6 });
    const c = createFlyCast(8, false);
    stroke(c, e, -idealArc(8) / 2, 0.15);
    const ev = waitStraight(c, e);
    expect(ev.snagBehind).toBe(true);
    expect(c.busy).toBe(FLY_CAST.untangleTime);
    expect(stroke(c, e, -0.5, 0.15).stop).toBeUndefined();
  });

  it('kova sivutuuli oikealta voi viedä perhon hattuun realistisella', () => {
    const hats = (sideWind: number, difficulty: Difficulty) => {
      const e = env(difficulty, { sideWind, random: () => 0.1 });
      const c = createFlyCast(10, false);
      stroke(c, e, -idealArc(10) / 2, 0.3);
      waitStraight(c, e);
      return stroke(c, e, 0.5, 0.4).hat === true;
    };
    expect(hats(8, 'realistic')).toBe(true);
    expect(hats(-8, 'realistic')).toBe(false);
    expect(hats(8, 'normal')).toBe(false);
  });
});

describe('perhoheitto kalastuksessa (#235)', () => {
  const world = { isWater: (p: { x: number }) => p.x > -20, depthAt: () => 4 };
  const ctx = (difficulty: Difficulty = 'normal', heading = 0): FishingContext => ({
    tubePos: { x: 0, y: 0 },
    heading,
    ...world,
    fish: {
      pop: { fish: [], nextId: 1, tick: 0 },
      diff: DIFFICULTIES[difficulty],
      rng: new Rng(1),
    },
  });
  const fly: Tackle = { ...DEFAULT_TACKLE, method: 'fly' };
  const idle = { aim: { x: 10, y: 0 }, castHeld: false, reel: false, cancel: false };

  it('heitto alkaa kelalta, ja siima laskeutuu katsesuuntaan', () => {
    const s = createFishing(fly);
    const cx = ctx('normal', Math.PI / 2);
    stepFishing(s, { ...idle, startFlyCast: true }, cx, DT);
    expect(s.stage).toBe('casting');
    expect(s.flyCast?.aerial).toBe(FLY_CAST.startAerial);
    // Takaheitto ja eteenheitto, ja siimaa luistaa kummallakin.
    const run = (rod: number, grip: boolean, steps: number) => {
      let landed = false;
      for (let i = 0; i < steps; i++) {
        const e = stepFishing(s, { ...idle, flyCast: { rod, grip } }, cx, DT);
        landed ||= e.splash !== undefined;
      }
      return landed;
    };
    run(-0.1, true, 9);
    run(0, false, 30);
    run(0.1, true, 9);
    expect(run(0, false, 120)).toBe(true);
    expect(s.stage).toBe('water');
    expect(s.lure.y).toBeGreaterThan(5);
    expect(Math.abs(s.lure.x)).toBeLessThan(2);
  });

  it('vedestä nostetaan enintään 10 m siimaa; X keskeyttää heiton', () => {
    const s = createFishing(fly);
    s.stage = 'water';
    s.lure = { x: 14, y: 0 };
    s.lineLength = 13;
    const far = stepFishing(s, { ...idle, startFlyCast: true }, ctx(), DT);
    expect(far.pickupFar).toBe(true);
    expect(s.stage).toBe('water');
    s.lure = { x: 9, y: 0 };
    s.lineLength = 8;
    stepFishing(s, { ...idle, startFlyCast: true }, ctx(), DT);
    expect(s.stage).toBe('casting');
    expect(s.flyCast).toMatchObject({ aerial: 8, inWater: true });
    stepFishing(s, { ...idle, cancel: true }, ctx(), DT);
    expect(s.stage).toBe('idle');
    expect(s.slack).toBeCloseTo(8);
  });

  it('takaheitto rantaan tarttuu; tuulisolmu heikentää siimaa', () => {
    const s = createFishing(fly);
    s.stage = 'water';
    s.lure = { x: 9, y: 0 };
    s.lineLength = 8;
    const cx: FishingContext = { ...ctx(), isWater: (p) => p.x > -5 };
    stepFishing(s, { ...idle, startFlyCast: true }, cx, DT);
    let snag = false;
    for (let i = 0; i < 60; i++) {
      const e = stepFishing(
        s,
        { ...idle, flyCast: { rod: i < 9 ? -0.07 : 0, grip: true } },
        cx,
        DT,
      );
      snag ||= e.flyCast?.snagBehind === true;
    }
    expect(snag).toBe(true);
    s.knot = true;
    expect(lineStrength(s)).toBeCloseTo(breakingStrength(fly) * FLY_CAST.knotStrength);
  });

  it('ilman vavan liikettä ja kosketuksella heitto toimii voimamittarilla kuten ennen', () => {
    const s = createFishing(fly);
    stepFishing(s, { ...idle, castHeld: true }, ctx(), DT);
    expect(s.stage).toBe('charging');
    for (let i = 0; i < 20; i++) stepFishing(s, { ...idle, castHeld: true }, ctx(), DT);
    stepFishing(s, idle, ctx(), DT);
    expect(s.stage).toBe('flight');
    expect(distance(s.lure, { x: 1.6, y: 0 })).toBeLessThan(1);
  });
});
