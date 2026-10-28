import {
  BoatSeat,
  CRAFTS,
  InputQueue,
  seatPos,
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
    const predictor = new TubePredictor(ownStart, water, () => [
      { tube: sims[1]!.tube, craft: CRAFTS.tube },
    ]);
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

  describe('vene (#263)', () => {
    /** Vene (soutaja) ja kaksi kalastajaa perässä ja keulassa. */
    function boat(): Sim[] {
      const rower = createTube({ ...center }, 0);
      const sim = (tube: TubeState, seat: number): Sim => ({
        tube,
        inputs: new InputQueue(),
        splashed: false,
        lastCatchAt: 0,
        boat: 1,
        seat,
      });
      return [
        sim(rower, BoatSeat.rower),
        sim(createTube(seatPos(rower, BoatSeat.stern), Math.PI), BoatSeat.stern),
        sim(createTube(seatPos(rower, BoatSeat.bow), Math.PI / 2), BoatSeat.bow),
      ];
    }
    const row = (sims: Sim[], steps: number, input = { kick: 1, turn: 0, sprint: false }) => {
      for (let k = 1; k <= steps; k++) {
        for (const s of sims) s.inputs.push([{ seq: s.inputs.lastSeq + 1, ...input }]);
        stepSims(sims, water);
      }
    };

    it('soutaja liikuttaa venettä ja kyytiläiset pysyvät paikoillaan veneessä', () => {
      const sims = boat();
      row(sims, 120);
      const [rower, stern, bow] = sims.map((s) => s.tube);
      expect(rower!.pos.x).toBeLessThan(center.x - 0.5);
      expect(stern!.pos).toEqual(seatPos(rower!, BoatSeat.stern));
      expect(bow!.pos).toEqual(seatPos(rower!, BoatSeat.bow));
      // Kyytiläinen ei soua, vaikka potkisi: katse ei kääntynyt eikä vauhti ole omaa.
      expect(stern!.heading).toBe(Math.PI);
      expect(stern!.vel).toEqual(rower!.vel);
    });

    it('kyytiläinen kääntyy paikallaan heittämään', () => {
      const sims = boat();
      row(sims, 30, { kick: 0, turn: 1, sprint: false });
      expect(sims[1]!.tube.heading).not.toBe(Math.PI);
      // Soutaja kääntää venettä, kyytiläiset vain itseään.
      expect(sims[0]!.tube.heading).toBeGreaterThan(0);
    });

    it('soutaja ei voi soutaa heittäessään tai kelatessaan', () => {
      const sims = boat();
      sims[0]!.rodInHand = true;
      row(sims, 120);
      expect(sims[0]!.tube.pos.x).toBeCloseTo(center.x, 6);
      expect(sims[0]!.tube.heading).toBe(0);
    });

    it('veneet törmäävät rungoillaan, kyytiläiset eivät törmää', () => {
      const a = boat();
      // Toinen vene rinnalla, kyljet 0,3 m päällekkäin.
      const b = boat().map((s) => ({
        ...s,
        boat: 2,
        tube: { ...s.tube, pos: { x: s.tube.pos.x, y: s.tube.pos.y + 1 } },
      }));
      const sims = [...a, ...b];
      stepSims(sims, water);
      const gap = sims[3]!.tube.pos.y - sims[0]!.tube.pos.y;
      // Erilleen rungon leveyden verran, ei koko veneen pituuden säteellä.
      expect(gap).toBeGreaterThanOrEqual(1.3 - 1e-9);
      expect(gap).toBeLessThan(1.5);
      expect(sims[1]!.tube.pos).toEqual(seatPos(sims[0]!.tube, BoatSeat.stern));
    });

    it('rengas ja vene samassa kisassa: kevyt rengas kimpoaa raskaasta veneestä', () => {
      const [rower] = boat();
      // Rengas tulee kohti veneen kylkeä.
      const tube = createTube({ x: center.x, y: center.y + 1.6 }, Math.PI / 2);
      const sims: Sim[] = [
        rower!,
        {
          tube: { ...tube, vel: { x: 0, y: -1 } },
          inputs: new InputQueue(),
          splashed: false,
          lastCatchAt: 0,
        },
      ];
      for (let k = 1; k <= 30; k++) {
        for (const s of sims) s.inputs.push([{ seq: k, kick: 0, turn: 0, sprint: false }]);
        stepSims(sims, water);
      }
      // Rengas kimpoaa takaisin, ja sen vauhti muuttuu enemmän kuin veneen.
      expect(sims[1]!.tube.vel.y).toBeGreaterThan(0);
      expect(Math.abs(sims[0]!.tube.vel.y)).toBeLessThan(sims[1]!.tube.vel.y + 1);
      expect(sims[0]!.tube.vel.y).toBeLessThan(0);
      expect(sims[1]!.tube.pos.y - sims[0]!.tube.pos.y).toBeGreaterThan(0.66 + TUBE_RADIUS - 0.05);
    });

    it('soutaja laskee ankkurin, kyytiläinen ei (#355)', () => {
      const sims = boat();
      const anchor = (s: Sim) => {
        for (const x of sims)
          x.inputs.push([
            { seq: x.inputs.lastSeq + 1, kick: 0, turn: 0, sprint: false, anchor: x === s },
          ]);
        stepSims(sims, water, false, undefined, () => 3);
      };
      anchor(sims[1]!);
      expect(sims.every((s) => !s.tube.anchor)).toBe(true);
      anchor(sims[0]!);
      expect(sims[0]!.tube.anchor).toMatchObject({ depth: 3, raising: false });
      // Ankkurissa airovedot eivät liikuta venettä.
      const at = { ...sims[0]!.tube.pos };
      for (let k = 1; k <= 120; k++) {
        for (const s of sims)
          s.inputs.push([{ seq: s.inputs.lastSeq + 1, kick: 1, turn: 0, sprint: false }]);
        stepSims(sims, water, false, undefined, () => 3);
      }
      expect(Math.hypot(sims[0]!.tube.pos.x - at.x, sims[0]!.tube.pos.y - at.y)).toBeLessThan(0.01);
      expect(sims[1]!.tube.anchor).toBeUndefined();
    });

    it('kyytiläinen kääntyy veneen mukana', () => {
      const sims = boat();
      row(sims, 60, { kick: 0, turn: 1, sprint: false });
      // Kyytiläinen ei itse käänny (syöte välitetään hänellekin, mutta testataan ero).
      const turned = sims[0]!.tube.heading;
      expect(turned).toBeGreaterThan(0.1);
      expect(sims[2]!.tube.pos).toEqual(seatPos(sims[0]!.tube, BoatSeat.bow));
    });
  });
});
