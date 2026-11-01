import { describe, expect, it } from 'vitest';
import { WaterBody } from '../map/waterBody';
import type { LakeMap } from '../map/types';
import { packInput, stepPlayerTube, unpackInput, NET_DT, cloneTube } from '../net/tubeSync';
import { CRAFTS } from './boat';
import { SHORE, canStand, isAshore, shoreActionAt, shoreFromNet, shoreToNet } from './shore';
import { createTube, type TubeInput, type TubeState } from './tube';

/** Neliön muotoinen järvi: vettä x 0–100, y 0–100. Länsiranta on x = 0. */
const lake: LakeMap = {
  name: 'testi',
  attribution: '',
  origin: { e: 0, n: 0 },
  shore: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ],
  islands: [],
  bounds: { minX: -20, minY: -20, maxX: 120, maxY: 120 },
  // Laituri länsirannasta järvelle kohdassa y = 80.
  piers: [{ from: { x: -1, y: 80 }, to: { x: 10, y: 80 }, base: { x: -1, y: 80 } }],
};
const water = new WaterBody(lake);
const BACK: TubeInput = { kick: 1, turn: 0, sprint: false };
const REST: TubeInput = { kick: 0, turn: 0, sprint: false };
const WALK: TubeInput = { kick: -1, turn: 0, sprint: false };
const MAIN: TubeInput = { ...REST, main: true };

const step = (t: TubeState, i: TubeInput, canLand = true) =>
  stepPlayerTube(t, i, water, NET_DT, undefined, CRAFTS.tube, undefined, canLand);

function run(t: TubeState, i: TubeInput, seconds: number, canLand = true): TubeState {
  for (let k = 0; k < Math.round(seconds / NET_DT); k++) t = step(t, i, canLand);
  return t;
}

/** Potkii selkä edellä maihin ja päästää irti. */
function land(t: TubeState = nearWest()): TubeState {
  for (let k = 0; k < 300 && !isAshore(t); k++) t = step(t, BACK);
  return step(t, REST);
}

/** Rengas länsirannan tuntumassa katse itään (selkä rantaan). */
const nearWest = (y = 50) => createTube({ x: 1, y }, 0);

describe('rantautuminen (#457)', () => {
  it('maa ja kaista: vesi ja yli 5 m rannasta eivät käy, laiturin kansi käy', () => {
    expect(canStand(water, { x: -2, y: 50 })).toBe(true);
    expect(canStand(water, { x: -SHORE.band + 0.1, y: 50 })).toBe(true);
    expect(canStand(water, { x: -SHORE.band - 0.5, y: 50 })).toBe(false);
    expect(canStand(water, { x: 2, y: 50 })).toBe(false);
    // Laiturin kannella kävellään (#457), sen vieressä on vettä.
    expect(water.isLand({ x: 5, y: 80 })).toBe(true);
    expect(canStand(water, { x: 9, y: 80 })).toBe(true);
    expect(water.isLand({ x: 5, y: 82 })).toBe(false);
  });

  it('selkä edellä rantaa vasten potkiminen nostaa maihin sekunnissa', () => {
    let t = run(nearWest(), BACK, 0.5);
    expect(isAshore(t)).toBe(false);
    expect(t.landing).toBeGreaterThan(0);
    t = run(t, BACK, 2);
    expect(isAshore(t)).toBe(true);
    // Kalastaja seisoo maalla renkaan takana, katse järvelle.
    expect(t.pos.x).toBeLessThan(0);
    expect(canStand(water, t.pos)).toBe(true);
    expect(t.shore!.tube.x).toBeLessThan(0);
    expect(t.shore!.tube.x).toBeGreaterThan(t.pos.x);
    expect(t.shore!.carrying).toBe(false);
    expect(Math.cos(t.heading)).toBeGreaterThan(0.9);
  });

  it('ilman lupaa (viehe ulkona, vanha palvelin) tai kasvot rantaan ei nousta maihin', () => {
    expect(isAshore(run(nearWest(), BACK, 3, false))).toBe(false);
    // Katse länteen: potku vie selän järvelle päin, ei rantaan.
    const facing = createTube({ x: 1.5, y: 50 }, Math.PI);
    expect(isAshore(run(facing, WALK, 3))).toBe(false);
    // Tauko nollaa kertymän.
    const half = run(nearWest(), BACK, 0.6);
    expect(run(half, REST, NET_DT).landing).toBeUndefined();
  });

  it('pohjassa pidetty potku ei kävelytä heti maihin noustua', () => {
    let t = run(nearWest(), BACK, 3);
    expect(isAshore(t)).toBe(true);
    expect(shoreActionAt(t, water)).toBe('pickUp');
    t = step(t, REST);
    expect(t.shore!.settle).toBeUndefined();
    expect(run(t, BACK, 1).pos.x).toBeLessThan(t.pos.x - 0.3);
  });

  it('kävely pysyy maalla 5 m kaistalla', () => {
    let t = land();
    // Käänny länteen (metsään päin) ja kävele pitkään.
    t = { ...t, heading: Math.PI };
    t = run(t, WALK, 10);
    expect(canStand(water, t.pos)).toBe(true);
    expect(t.pos.x).toBeGreaterThan(-SHORE.band - 0.01);
    // Kohti järveä kävely pysähtyy rantaviivaan.
    t = run({ ...t, heading: 0 }, WALK, 10);
    expect(t.pos.x).toBeLessThan(0);
    expect(canStand(water, t.pos)).toBe(true);
  });

  it('vino kävely rantaa vasten liukuu rannan suuntaisesti', () => {
    let t = land();
    t = run({ ...t, heading: Math.PI / 4 }, WALK, 3);
    expect(t.pos.y).toBeGreaterThan(52);
    expect(canStand(water, t.pos)).toBe(true);
  });

  it('rengas otetaan, kannetaan ja lasketaan maahan', () => {
    let t = land();
    expect(shoreActionAt(t, water)).toBe('pickUp');
    t = step(t, MAIN);
    expect(t.shore!.carrying).toBe(true);
    // Kaistan perälle, rengas maahan: kaukana vesirajasta se lasketaan.
    t = run({ ...t, heading: Math.PI }, WALK, 4);
    expect(shoreActionAt(t, water)).toBe('putDown');
    t = step(t, MAIN);
    expect(t.shore!.carrying).toBe(false);
    expect(water.isLand(t.shore!.tube)).toBe(true);
    // Kauempana rengasta ei saa käteen.
    const away = run({ ...t, heading: 0 }, WALK, 2);
    expect(shoreActionAt(away, water)).toBe(null);
    expect(step(away, MAIN).shore!.carrying).toBe(false);
  });

  it('vesirajassa rengas kädessä hypätään kyytiin, ja tavallinen potku vie ulos', () => {
    let t = land();
    t = step(t, MAIN);
    expect(shoreActionAt(t, water)).toBe('board');
    t = step(t, MAIN);
    expect(t.shore!.board).toBe(0);
    t = run(t, REST, SHORE.boardTime + 0.1);
    expect(isAshore(t)).toBe(false);
    expect(water.isWater(t.pos)).toBe(true);
    // Katse rantaan (länteen), selkä järvelle.
    expect(Math.cos(t.heading)).toBeLessThan(-0.9);
    const out = run(t, BACK, 3, false);
    expect(out.pos.x).toBeGreaterThan(t.pos.x + 1);
  });

  it('laiturille rantaudutaan, sillä kävellään ja sen päästä hypätään kyytiin', () => {
    // Rengas laiturin pohjoispuolella katse pohjoiseen: selkä laituriin.
    let t = land(createTube({ x: 6, y: 81.8 }, Math.PI / 2));
    expect(isAshore(t)).toBe(true);
    expect(water.onPier(t.pos)).toBe(true);
    expect(water.onPier(t.shore!.tube)).toBe(true);
    t = step(t, MAIN);
    expect(t.shore!.carrying).toBe(true);
    // Käännytään itään ja kävellään laiturin päähän.
    t = run(t, { ...REST, turn: -1 }, Math.PI / 2 / SHORE.turnRate);
    expect(Math.cos(t.heading)).toBeGreaterThan(0.95);
    t = run(t, WALK, 6);
    expect(water.onPier(t.pos)).toBe(true);
    expect(t.pos.x).toBeGreaterThan(8.5);
    expect(shoreActionAt(t, water)).toBe('board');
    t = run(step(t, MAIN), REST, SHORE.boardTime + 0.1);
    expect(isAshore(t)).toBe(false);
    expect(water.isWater(t.pos)).toBe(true);
  });

  it('laiturilta kävellään rantaan', () => {
    let t = land(createTube({ x: 6, y: 81.8 }, Math.PI / 2));
    t = run(t, { ...REST, turn: 1 }, Math.PI / 2 / SHORE.turnRate);
    expect(Math.cos(t.heading)).toBeLessThan(-0.95);
    t = run(t, WALK, 8);
    expect(t.pos.x).toBeLessThan(-1);
    expect(canStand(water, t.pos)).toBe(true);
  });

  it('pääkonteksti kulkee syötteen bitissä 64 ja maatila kloonautuu', () => {
    expect(unpackInput(packInput(MAIN)).main).toBe(true);
    expect(unpackInput(packInput(REST)).main).toBeUndefined();
    const t = run(nearWest(), BACK, 2);
    const c = cloneTube(t);
    expect(c.shore).toEqual(t.shore);
    expect(c.shore!.tube).not.toBe(t.shore!.tube);
  });

  it('veneellä ei nousta maihin', () => {
    let t = createTube({ x: 3, y: 50 }, 0);
    for (let k = 0; k < 200; k++)
      t = stepPlayerTube(t, BACK, water, NET_DT, undefined, CRAFTS.boat, undefined, true);
    expect(isAshore(t)).toBe(false);
  });
});

describe('maalla olo verkossa', () => {
  it('kulkee kentissä samana', () => {
    const states = [nearWest(), run(nearWest(), BACK, 0.8), land()];
    states.push(step(states[2]!, MAIN));
    states.push(step(states[3]!, MAIN));
    states.push(run(nearWest(), BACK, 3));
    for (const t of states) {
      const back = { ...t, ...shoreFromNet(shoreToNet(t)) };
      expect(back).toEqual(t);
    }
  });
});
