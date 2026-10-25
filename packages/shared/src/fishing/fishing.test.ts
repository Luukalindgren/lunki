import { describe, expect, it } from 'vitest';
import { distance } from '../vec2';
import { CAST, rodTip } from './cast';
import {
  createFishing,
  stepFishing,
  type FishingContext,
  type FishingInput,
  type FishingState,
} from './fishing';

const DT = 1 / 60;
const ctx: FishingContext = {
  tubePos: { x: 0, y: 0 },
  heading: 0,
  isWater: (p) => p.x < 100,
  depthAt: () => 3,
};
const input = (o: Partial<FishingInput> = {}): FishingInput => ({
  aim: { x: 50, y: 0 },
  castHeld: false,
  reel: false,
  cancel: false,
  ...o,
});

function hold(s: FishingState, seconds: number, i: FishingInput) {
  for (let t = 0; t < seconds; t += DT) stepFishing(s, i, ctx, DT);
}

function castAndLand(power: number): FishingState {
  const s = createFishing();
  stepFishing(s, input({ castHeld: true }), ctx, DT);
  hold(s, CAST.chargeTime * power - DT, input({ castHeld: true }));
  stepFishing(s, input(), ctx, DT);
  expect(s.stage).toBe('flight');
  hold(s, 6, input());
  return s;
}

describe('kalastuksen vaiheet', () => {
  it('heitto: lataus → lento → vesi', () => {
    const s = castAndLand(0.6);
    expect(s.stage).toBe('water');
    expect(s.power).toBeGreaterThan(0.5);
    expect(s.lure.x).toBeGreaterThan(15);
    expect(Math.abs(s.lure.y)).toBeLessThan(1e-6);
  });

  it('viehe uppoaa pohjaan asti', () => {
    const s = castAndLand(0.5);
    hold(s, 20, input());
    expect(s.depth).toBe(3);
  });

  it('kelaus tuo vieheen takaisin ja nostaa sitä', () => {
    const s = castAndLand(0.5);
    hold(s, 5, input());
    const deep = s.depth;
    const before = distance(s.lure, rodTip(ctx.tubePos, ctx.heading));
    // Ensin kelataan löysä siima, sitten viehe alkaa tulla.
    hold(s, 3, input({ reel: true }));
    expect(distance(s.lure, rodTip(ctx.tubePos, ctx.heading))).toBeLessThan(before - 1.5);
    expect(s.tension).toBeGreaterThan(0);
    expect(s.depth).toBeLessThan(deep);
    hold(s, 60, input({ reel: true }));
    expect(s.stage).toBe('idle');
  });

  it('kelauksen jälkeen nappi pitää päästää ennen uutta heittoa', () => {
    const s = castAndLand(0.3);
    hold(s, 60, input({ reel: true, castHeld: true }));
    expect(s.stage).toBe('idle');
    stepFishing(s, input({ castHeld: true }), ctx, DT);
    expect(s.stage).toBe('idle');
    stepFishing(s, input(), ctx, DT);
    stepFishing(s, input({ castHeld: true }), ctx, DT);
    expect(s.stage).toBe('charging');
  });

  it('jarru luistaa, kun veto ylittää sen', () => {
    const s = castAndLand(0.6);
    hold(s, 1, input());
    const out = s.lineLength;
    // Rengas karkaa nopeasti poispäin vieheestä löysällä jarrulla.
    s.drag = 0.25;
    const fast = { ...ctx, tubePos: { x: -3, y: 0 } };
    stepFishing(s, input(), fast, DT);
    expect(s.dragSlipping).toBe(true);
    expect(s.tension).toBeCloseTo(0.25);
    expect(s.lineLength).toBeGreaterThan(out);
  });

  it('vaihde ja jarru säätyvät rajoissa', () => {
    const s = createFishing();
    for (let i = 0; i < 100; i++) stepFishing(s, input({ dragDelta: 1 }), ctx, DT);
    expect(s.drag).toBe(8);
    stepFishing(s, input({ gear: 5 }), ctx, DT);
    expect(s.gear).toBe(2);
  });

  it('peruutus keskeyttää latauksen', () => {
    const s = createFishing();
    stepFishing(s, input({ castHeld: true }), ctx, DT);
    stepFishing(s, input({ castHeld: true, cancel: true }), ctx, DT);
    expect(s.stage).toBe('idle');
  });

  it('maalle heitetty viehe juuttuu, eikä kelaus irrota sitä', () => {
    const s = createFishing();
    const land = { ...ctx, isWater: () => false };
    let stuck = false;
    stepFishing(s, input({ castHeld: true }), land, DT);
    for (let t = 0; t < 0.5; t += DT) stepFishing(s, input({ castHeld: true }), land, DT);
    for (let t = 0; t < 6; t += DT) stuck = !!stepFishing(s, input(), land, DT).stuck || stuck;
    expect(stuck).toBe(true);
    expect(s.onLand).toBe(true);
    expect(s.depth).toBe(0);
    const at = { ...s.lure };
    for (let t = 0; t < 10; t += DT) stepFishing(s, input({ reel: true }), land, DT);
    expect(s.stage).toBe('water');
    expect(s.lure).toEqual(at);
    expect(s.tension).toBe(s.drag);
  });

  it('juuttunut viehe vapautuu vain katkaisemalla siima', () => {
    const s = createFishing();
    const land = { ...ctx, isWater: () => false };
    stepFishing(s, input({ castHeld: true }), land, DT);
    for (let t = 0; t < 0.5; t += DT) stepFishing(s, input({ castHeld: true }), land, DT);
    for (let t = 0; t < 6; t += DT) stepFishing(s, input(), land, DT);
    const ev = stepFishing(s, input({ cut: true }), land, DT);
    expect(ev.lineCut).toBe(true);
    expect(ev.lureLost).toBe(true);
    expect(s.stage).toBe('idle');
    expect(s.onLand).toBe(false);
  });

  it('vedessä katkaisu ei tee mitään', () => {
    const s = createFishing();
    stepFishing(s, input({ castHeld: true }), ctx, DT);
    for (let t = 0; t < 0.5; t += DT) stepFishing(s, input({ castHeld: true }), ctx, DT);
    for (let t = 0; t < 6; t += DT) stepFishing(s, input(), ctx, DT);
    expect(s.stage).toBe('water');
    expect(stepFishing(s, input({ cut: true }), ctx, DT).lineCut).toBeUndefined();
    expect(s.stage).toBe('water');
  });
});
