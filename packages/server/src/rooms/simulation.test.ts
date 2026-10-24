import {
  InputQueue,
  LUNKINJARVI,
  TUBE_RADIUS,
  TubePredictor,
  WaterBody,
  createTube,
  findOpenWaterPoint,
  type NetInput,
  type TubeState,
} from '@lunki/shared';
import { describe, expect, it } from 'vitest';
import { stepSims, type Sim } from './simulation';

const water = new WaterBody(LUNKINJARVI);
// Avovettä, kaukana rannoista.
const center = findOpenWaterPoint(water, LUNKINJARVI.bounds);

/** Kaksi rengasta selät vastakkain 6 m päässä: potkiessa ne lähestyvät toisiaan. */
function setup(): Sim[] {
  const a = createTube({ x: center.x - 3, y: center.y }, Math.PI); // katse länteen, liike itään
  const b = createTube({ x: center.x + 3, y: center.y }, 0); // katse itään, liike länteen
  return [
    { tube: a, inputs: new InputQueue(), splashed: false, lastCatchAt: 0 },
    { tube: b, inputs: new InputQueue(), splashed: false, lastCatchAt: 0 },
  ];
}

const kicks = (from: number, n: number): NetInput[] =>
  Array.from({ length: n }, (_, k) => ({ seq: from + k, kick: 1, turn: 0, sprint: true }));

describe('palvelimen askel', () => {
  it('renkaat törmäävät ja kimpoavat erilleen', () => {
    const sims = setup();
    let minGap = Infinity;
    let collided = false;
    for (let step = 1; step <= 600; step++) {
      // Potkitaan 4 s, sitten lepo.
      for (const s of sims)
        s.inputs.push(
          step <= 240 ? kicks(step, 1) : [{ seq: step, kick: 0, turn: 0, sprint: false }],
        );
      stepSims(sims, water);
      const gap = Math.hypot(
        sims[1]!.tube.pos.x - sims[0]!.tube.pos.x,
        sims[1]!.tube.pos.y - sims[0]!.tube.pos.y,
      );
      minGap = Math.min(minGap, gap);
      if (gap < TUBE_RADIUS * 2 + 0.01) collided = true;
    }
    expect(collided).toBe(true);
    // Eivät mene sisäkkäin (yksi askel voi painua hetkeksi hieman).
    expect(minGap).toBeGreaterThan(TUBE_RADIUS * 2 - 0.1);
    // Symmetrinen tilanne: kumpikin kimpoaa yhtä paljon.
    expect(sims[0]!.tube.pos.x - (center.x - 3)).toBeCloseTo(
      -(sims[1]!.tube.pos.x - (center.x + 3)),
      6,
    );
  });

  it('ennakointi päätyy palvelimen tilaan korjauksen jälkeen', () => {
    const sims = setup();
    const ownStart: TubeState = sims[0]!.tube;
    const predictor = new TubePredictor(ownStart, water, () => [sims[1]!.tube]);
    for (let step = 1; step <= 300; step++) {
      const own: NetInput = { seq: step, kick: 1, turn: 0, sprint: true };
      predictor.step(own);
      sims[0]!.inputs.push([own]);
      sims[1]!.inputs.push(kicks(step, 1));
      stepSims(sims, water);
      // Palvelimen tila saapuu heti (viive testataan tubeSync-testeissä).
      predictor.reconcile(sims[0]!.tube, sims[0]!.inputs.lastSeq);
      expect(predictor.tube.pos.x).toBe(sims[0]!.tube.pos.x);
    }
  });
});
