import { describe, expect, it } from 'vitest';
import { packInput, unpackInput } from '../net/tubeSync';
import { ANCHOR, anchorAttach, anchorReach, stepAnchor } from './anchor';
import { CRAFTS, type CraftSpec } from './boat';
import { createTube, stepTube, type TubeInput, type TubeState } from './tube';

const DT = 1 / 60;
const DEPTH = 4;
const REST: TubeInput = { kick: 0, turn: 0, sprint: false };

/** Avovettä ilman rantoja: fysiikka ja ankkuri kuten stepPlayerTube. */
function run(
  s: TubeState,
  seconds: number,
  opts: { input?: TubeInput; wind?: { x: number; y: number }; craft?: CraftSpec } = {},
): TubeState {
  const craft = opts.craft ?? CRAFTS.tube;
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    const input = opts.input ?? REST;
    s = stepTube(s, input, DT, opts.wind, 1, craft.physics);
    s = stepAnchor(s, !!input.anchor, DT, craft.anchorAt, () => DEPTH, opts.wind);
  }
  return s;
}

/** Ankkuri alas ja pohjaan asti. */
function anchoredTube(craft: CraftSpec = CRAFTS.tube, heading = 0): TubeState {
  const s = run(createTube({ x: 0, y: 0 }, heading), DT, {
    input: { ...REST, anchor: true },
    craft,
  });
  return run(s, DEPTH / ANCHOR.sinkSpeed + 0.1, { craft });
}

const distToAnchor = (s: TubeState, craft: CraftSpec = CRAFTS.tube) => {
  const a = anchorAttach(s, craft.anchorAt);
  return Math.hypot(a.x - s.anchor!.pos.x, a.y - s.anchor!.pos.y);
};

describe('ankkuri (#355)', () => {
  it('vajoaa pohjaan syvyyden mukaan ja jää sinne', () => {
    let s = run(createTube({ x: 0, y: 0 }), DT, { input: { ...REST, anchor: true } });
    expect(s.anchor).toMatchObject({ depth: DEPTH, raising: false });
    s = run(s, 1);
    expect(s.anchor!.drop).toBeCloseTo(ANCHOR.sinkSpeed * (1 + DT), 5);
    s = run(s, 3);
    expect(s.anchor!.drop).toBe(DEPTH);
  });

  it('pitää tuulessa köyden mitan sisällä, ilman ankkuria tuuli vie', () => {
    const wind = { x: 8, y: 0 };
    const free = run(createTube({ x: 0, y: 0 }), 60, { wind });
    expect(free.pos.x).toBeGreaterThan(10);
    const s = run(anchoredTube(), 60, { wind });
    expect(distToAnchor(s)).toBeLessThanOrEqual(anchorReach(s.anchor!) + 1e-9);
    expect(anchorReach(s.anchor!)).toBeCloseTo(DEPTH * Math.sqrt(1.25), 5);
    expect(s.pos.x).toBeLessThan(anchorReach(s.anchor!) + 0.01);
  });

  it('ankkurissa ei potkita, mutta kääntyä voi', () => {
    const start = anchoredTube();
    const s = run(start, 10, { input: { kick: 1, turn: 1, sprint: true } });
    expect(Math.hypot(s.pos.x, s.pos.y)).toBeLessThan(0.01);
    expect(Math.abs(s.heading - start.heading)).toBeGreaterThan(0.5);
  });

  it('vene kääntyy keula ankkuria kohti eli tuulta vasten', () => {
    // Tuuli puhaltaa länteen; vene alkaa keula etelään (perä pohjoiseen).
    const boat = CRAFTS.boat;
    const s = run(anchoredTube(boat, Math.PI / 2), 90, { wind: { x: -8, y: 0 }, craft: boat });
    const bow = s.heading + Math.PI;
    expect(Math.cos(bow)).toBeGreaterThan(0.95);
    expect(distToAnchor(s, boat)).toBeLessThanOrEqual(anchorReach(s.anchor!) + 1e-9);
  });

  it('laahaa vain myrskyssä', () => {
    const start = anchoredTube();
    const at = start.anchor!.pos;
    const windy = run(start, 30, { wind: { x: 9, y: 0 } });
    expect(windy.anchor!.pos).toEqual(at);
    const storm = run(start, 30, { wind: { x: 15, y: 0 } });
    expect(storm.anchor!.pos.x - at.x).toBeGreaterThan(3);
  });

  it('nosto vetää aluksen ankkurin luo ja kestää laskua kauemmin', () => {
    let s = run(anchoredTube(), 30, { wind: { x: 8, y: 0 } });
    const before = distToAnchor(s);
    s = run(s, DT, { input: { ...REST, anchor: true } });
    expect(s.anchor!.raising).toBe(true);
    s = run(s, DEPTH / ANCHOR.sinkSpeed, { wind: { x: 8, y: 0 } });
    expect(s.anchor).toBeDefined();
    expect(distToAnchor(s)).toBeLessThan(before);
    s = run(s, DEPTH / ANCHOR.raiseSpeed, { wind: { x: 8, y: 0 } });
    expect(s.anchor).toBeUndefined();
  });

  it('kulkee syötteessä omana bittinään', () => {
    const plain = { kick: 1, turn: -1, sprint: true };
    expect(unpackInput(packInput(plain))).toEqual(plain);
    expect(unpackInput(packInput({ ...plain, anchor: true }))).toEqual({ ...plain, anchor: true });
  });
});
