import { describe, expect, it } from 'vitest';
import { WaterBody } from '../map/waterBody';
import { LUNKINJARVI } from '../map/lunkinjarvi';
import { CRAFTS } from './boat';
import { NET_DT, stepPlayerTube } from '../net/tubeSync';
import { BoatSeat } from './boat';
import {
  BoatPart,
  LAUNCH,
  LaunchStage,
  beachedBoat,
  createBailer,
  createLaunch,
  launchFromNet,
  launchSequence,
  launchSequenceKind,
  launchToNet,
  stepBail,
  type Bailer,
  type BoatLaunch,
} from './launch';
import { inflateRow } from './shore';
import type { TubeInput, TubeState } from './tube';

const REST: TubeInput = { kick: 0, turn: 0, sprint: false };
const SCOOP: TubeInput = { ...REST, main: true };
const ARROW: Record<number, TubeInput> = {
  1: { kick: -1, turn: 0, sprint: false },
  2: { kick: 1, turn: 0, sprint: false },
  3: { kick: 0, turn: 1, sprint: false },
  4: { kick: 0, turn: -1, sprint: false },
};

/** Venekunnan jäsenet vuorotellen samaan veneeseen. */
function crewStep(l: BoatLaunch, bailers: Bailer[], inputs: TubeInput[]) {
  bailers.forEach((b, i) => {
    const r = stepBail(l, b, inputs[i]!, 1, NET_DT);
    l = r.launch;
    bailers[i] = r.bailer;
  });
  return l;
}

describe('veneen vesillelasku täyttökisassa (#458)', () => {
  it('vettä venekunnan koon mukaan: jokaiselle yhden renkaan työ', () => {
    expect(createLaunch(1, 1).water).toEqual([LAUNCH.scoops / 2, LAUNCH.scoops / 2]);
    expect(createLaunch(1, 3).full).toBe((3 * LAUNCH.scoops) / 2);
    expect(LAUNCH.scoops).toBe(75);
  });

  it('kolmen hengen venekunta valmistuu suunnilleen yhden ajassa', () => {
    const time = (crew: number) => {
      let l = createLaunch(5, crew);
      const seats = [BoatSeat.rower, BoatSeat.stern, BoatSeat.bow].slice(0, crew);
      const bailers = seats.map(createBailer);
      let k = 0;
      for (; k < 5000 && l.stage === LaunchStage.bail; k++)
        l = crewStep(
          l,
          bailers,
          bailers.map((b) => {
            const kind = launchSequenceKind(l, b);
            if (kind === null) return k % 20 === 0 ? SCOOP : REST;
            // Osan vaihto: seuraava nuoli joka toisella askeleella.
            return k % 2 === 0 ? ARROW[launchSequence(l.seed, kind)[b.moving!]!]! : REST;
          }),
        );
      return k * NET_DT;
    };
    const one = time(1);
    const three = time(3);
    expect(one).toBeGreaterThan(20);
    expect(Math.abs(three - one) / one).toBeLessThan(0.35);
  });

  it('väärä nuoli osaa vaihtaessa loiskauttaa vettä takaisin', () => {
    let l: BoatLaunch = { ...createLaunch(7, 1), water: [0, 30] };
    let b = createBailer(BoatSeat.rower);
    ({ launch: l, bailer: b } = stepBail(l, b, REST, 1, NET_DT));
    expect(b.moving).toBe(0);
    const seq = launchSequence(7, 10 + BoatPart.bow);
    const wrong = [1, 2, 3, 4].find((a) => a !== seq[0])!;
    const r = stepBail(l, b, ARROW[wrong]!, 1, NET_DT);
    expect(r.slipped).toBe(true);
    expect(r.launch.water[0]).toBe(LAUNCH.spill);
    expect(r.bailer.moving).toBe(null);
  });

  it('työnnön ja airojen sarjan voi tehdä kuka tahansa, ja muiden sarja alkaa alusta', () => {
    let l: BoatLaunch = { ...createLaunch(3, 2), water: [0, 0] };
    const bailers = [createBailer(BoatSeat.rower), createBailer(BoatSeat.stern)];
    l = crewStep(l, bailers, [REST, REST]);
    expect(l.stage).toBe(LaunchStage.push);
    const push = launchSequence(3, 12);
    // Perän kalastaja painaa ensimmäisen oikein, soutaja tekee koko sarjan.
    l = crewStep(l, bailers, [REST, ARROW[push[0]!]!]);
    expect(bailers[1]!.moving).toBe(1);
    for (const a of push) {
      l = crewStep(l, bailers, [ARROW[a]!, REST]);
      l = crewStep(l, bailers, [REST, REST]);
    }
    expect(l.stage).toBe(LaunchStage.oars);
    expect(bailers[1]!.moving).toBe(0);
  });

  it('rannalla soutaja tekee kaiken yksin, ja vene lasketaan keula edellä vesille', () => {
    const water = new WaterBody(LUNKINJARVI);
    const slot = inflateRow(water, { x: 1030, y: -412 }, 1, 9)[0]!;
    let t: TubeState = beachedBoat(water, slot.pos, 9, 1)!;
    expect(t).not.toBeNull();
    expect(water.isWater(t.pos)).toBe(false);
    const at = { ...t.pos };
    const step = (i: TubeInput) =>
      (t = stepPlayerTube(t, i, water, NET_DT, undefined, CRAFTS.boat, undefined, false));
    // Rannalla vene ei liiku soudusta.
    for (let k = 0; k < 30; k++) step({ kick: 1, turn: 0, sprint: false });
    expect(t.pos).toEqual(at);
    for (let k = 0; k < 20000 && t.launch; k++) {
      const kind = launchSequenceKind(t.launch, t.bailer!);
      if (kind === null) step(k % 20 === 0 ? SCOOP : REST);
      else step(k % 2 === 0 ? ARROW[launchSequence(9, kind)[t.bailer!.moving!]!]! : REST);
    }
    expect(t.launch).toBeUndefined();
    expect(t.bailer).toBeUndefined();
    expect(water.isWater(t.pos)).toBe(true);
    // Soudetaan pois rannasta: keula edellä (positiivinen veto).
    for (let k = 0; k < 120; k++) step({ kick: 1, turn: 0, sprint: false });
    expect(water.closestShorePoint(t.pos, 50)!.distance).toBeGreaterThan(3);
  });

  it('verkon kentät edestakaisin', () => {
    const t = {
      ...beachedBoat(new WaterBody(LUNKINJARVI), { x: 1030, y: -412 }, 4, 2)!,
    };
    const mid = stepBail(t.launch!, t.bailer!, SCOOP, 0.8, NET_DT);
    const s: TubeState = { ...t, launch: mid.launch, bailer: { ...mid.bailer, moving: 2 } };
    expect({ ...s, ...launchFromNet(launchToNet(s)) }).toEqual(s);
    expect(launchFromNet(launchToNet({ ...s, launch: undefined, bailer: undefined }))).toEqual({});
  });
});
