import { describe, expect, it } from 'vitest';
import { LUNKINJARVI } from '../map/lunkinjarvi';
import { findLaunchPoint } from '../map/geometry';
import { WaterBody } from '../map/waterBody';
import { createTube, type TubeInput, type TubeState } from '../physics/tube';
import { Rng } from '../rng';
import {
  InputQueue,
  SnapshotBuffer,
  TubePredictor,
  cloneTube,
  decodeInputs,
  encodeInputs,
  packInput,
  stepPlayerTube,
  unpackInput,
  type NetInput,
} from './tubeSync';

const water = new WaterBody(LUNKINJARVI);
const rng = new Rng(7);
const start = createTube(
  findLaunchPoint(water, LUNKINJARVI.bounds, () => rng.next()),
  1,
);

function randomInput(r: Rng): TubeInput {
  return {
    kick: r.next() < 0.7 ? 1 : r.next() < 0.5 ? -1 : 0,
    turn: r.next() < 0.5 ? 0 : r.next() < 0.5 ? 1 : -1,
    sprint: r.next() < 0.3,
  };
}

describe('syötteiden pakkaus', () => {
  it('säilyttää kaikki yhdistelmät', () => {
    for (const kick of [-1, 0, 1])
      for (const turn of [-1, 0, 1])
        for (const sprint of [false, true])
          expect(unpackInput(packInput({ kick, turn, sprint }))).toEqual({ kick, turn, sprint });
  });

  it('hylkää roskan', () => {
    expect(decodeInputs('x')).toEqual([]);
    expect(decodeInputs([1, 'a', 2, 5])).toEqual([{ seq: 2, ...unpackInput(5) }]);
    const list: NetInput[] = [{ seq: 4, kick: 1, turn: -1, sprint: true }];
    expect(decodeInputs(encodeInputs(list))).toEqual(list);
  });
});

describe('InputQueue', () => {
  it('kuluttaa yhden syötteen askeleessa ja ohittaa vanhat', () => {
    const q = new InputQueue();
    q.push([
      { seq: 1, kick: 1, turn: 0, sprint: false },
      { seq: 2, kick: 0, turn: 1, sprint: false },
    ]);
    q.push([{ seq: 2, kick: 1, turn: 1, sprint: true }]);
    expect(q.length).toBe(2);
    expect(q.next()?.kick).toBe(1);
    expect(q.next()?.turn).toBe(1);
    expect(q.lastSeq).toBe(2);
    expect(q.next()).toBeNull();
  });

  it('rajoittaa jonon pituuden', () => {
    const q = new InputQueue();
    for (let s = 1; s <= 100; s++) q.push([{ seq: s, kick: 1, turn: 0, sprint: false }]);
    expect(q.length).toBe(30);
  });
});

/** Simuloi palvelimen ja asiakkaan viiveellisen yhteyden. */
function simulate(latencySteps: number, steps: number) {
  const r = new Rng(3);
  const predictor = new TubePredictor(start, water);
  const queue = new InputQueue();
  let server: TubeState = cloneTube(start);
  const toServer: { at: number; inputs: NetInput[] }[] = [];
  const toClient: { at: number; tube: TubeState; ack: number }[] = [];
  let maxCorrection = 0;
  let input = randomInput(r);
  for (let step = 0; step < steps; step++) {
    if (step % 20 === 0) input = randomInput(r);
    predictor.step(input);
    const out = predictor.takeOutgoing();
    if (out) toServer.push({ at: step + latencySteps, inputs: out });

    while (toServer.length > 0 && toServer[0]!.at <= step) queue.push(toServer.shift()!.inputs);
    const i = queue.next();
    if (i) server = stepPlayerTube(server, i, water);
    if (step % 3 === 0)
      toClient.push({ at: step + latencySteps, tube: cloneTube(server), ack: queue.lastSeq });

    while (toClient.length > 0 && toClient[0]!.at <= step) {
      const m = toClient.shift()!;
      predictor.reconcile(m.tube, m.ack);
      maxCorrection = Math.max(maxCorrection, predictor.lastCorrection);
    }
  }
  return { predictor, server, maxCorrection };
}

describe('TubePredictor', () => {
  it('ennakointi osuu palvelimen tilaan 150 ms viiveellä', () => {
    const { maxCorrection, predictor } = simulate(9, 1200);
    // Deterministinen fysiikka: korjauksia ei tarvita lainkaan.
    expect(maxCorrection).toBeLessThan(1e-9);
    expect(predictor.unacked).toBeLessThan(30);
  });

  it('korjaa, kun palvelimen tila poikkeaa', () => {
    const p = new TubePredictor(start, water);
    for (let k = 0; k < 10; k++) p.step({ kick: 1, turn: 0, sprint: false });
    const moved = cloneTube(start);
    moved.pos.x += 2;
    p.reconcile(moved, 5);
    expect(p.lastCorrection).toBeGreaterThan(1.5);
    expect(p.unacked).toBe(5);
  });
});

describe('SnapshotBuffer', () => {
  it('interpoloi kahden tilan välistä', () => {
    const b = new SnapshotBuffer<number>((a, c, t) => a + (c - a) * t);
    expect(b.sample(0)).toBeNull();
    b.push(1, 10);
    b.push(2, 20);
    expect(b.sample(0.5)).toBe(10);
    expect(b.sample(1.25)).toBe(12.5);
    expect(b.sample(3)).toBe(20);
  });
});

describe('heiton tarkistus', () => {
  it('hyväksyy pisimmän heiton ja hylkää liian pitkän', async () => {
    const { isPlausibleSplash, maxCastDistance } = await import('./castCheck');
    const max = maxCastDistance();
    expect(max).toBeGreaterThan(40);
    expect(max).toBeLessThan(70);
    expect(isPlausibleSplash({ x: 0, y: 0 }, { x: max, y: 0 })).toBe(true);
    expect(isPlausibleSplash({ x: 0, y: 0 }, { x: 0, y: max + 20 })).toBe(false);
    expect(isPlausibleSplash({ x: 0, y: 0 }, { x: NaN, y: 0 })).toBe(false);
  });
});
