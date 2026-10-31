import { describe, expect, it } from 'vitest';
import { WaterBody } from '../map/waterBody';
import { LUNKINJARVI } from '../map/lunkinjarvi';
import { NET_DT, stepPlayerTube } from '../net/tubeSync';
import {
  Arrow,
  INFLATE,
  createInflate,
  inflateProgress,
  inflateSequence,
  stepInflate,
  type InflateState,
} from './inflate';
import { canStand, inflateRow, shoreActionAt, shoreFromNet, shoreToNet } from './shore';
import type { TubeInput, TubeState } from './tube';

const REST: TubeInput = { kick: 0, turn: 0, sprint: false };
const PUMP: TubeInput = { ...REST, main: true };
const ARROW: Record<number, TubeInput> = {
  [Arrow.up]: { kick: -1, turn: 0, sprint: false },
  [Arrow.down]: { kick: 1, turn: 0, sprint: false },
  [Arrow.left]: { kick: 0, turn: 1, sprint: false },
  [Arrow.right]: { kick: 0, turn: -1, sprint: false },
};

/** Pumppaa tasaisesti `rate` vetoa sekunnissa `seconds` sekuntia. */
function pump(s: InflateState, stamina: number, rate: number, seconds: number) {
  const every = Math.round(1 / rate / NET_DT);
  let strokes = 0;
  for (let k = 0; k < Math.round(seconds / NET_DT); k++) {
    const r = stepInflate(s, k % every === 0 ? PUMP : REST, stamina, NET_DT);
    if (r.stroke > 0) strokes++;
    s = r.state;
    stamina = r.stamina;
  }
  return { s, stamina, strokes };
}

/** Painaa nuolet yksi kerrallaan (painallus ja irrotus). */
function arrows(s: InflateState, list: number[]): InflateState {
  for (const a of list) {
    s = stepInflate(s, ARROW[a]!, 1, NET_DT).state;
    s = stepInflate(s, REST, 1, NET_DT).state;
  }
  return s;
}

describe('täyttökisa (#458)', () => {
  it('täysillä vedoilla kylki täyttyy 30 vedolla, ja letku pitää sitten siirtää', () => {
    const { s, strokes } = pump(createInflate(1), 1, 3, 12);
    expect(s.fill[0]).toBe(1);
    expect(strokes).toBe(INFLATE.strokes[0]);
    expect(s.moving).toBe(0);
    expect(s.fill[1]).toBe(0);
  });

  it('kesken kahvan nousun painettu veto on vajaa: hakkaaminen ei auta', () => {
    const steady = pump(createInflate(1), 1, 4, 3).s.fill[0];
    const mash = pump(createInflate(1), 1, 20, 3).s.fill[0];
    expect(mash).toBeLessThanOrEqual(steady + 0.03);
  });

  it('kova pumppaus kuluttaa kuntoa (kevyt), rauhallinen vähemmän', () => {
    const r = pump(createInflate(1), 1, 4, 7);
    expect(r.stamina).toBeLessThan(0.8);
    const calm = pump(createInflate(1), 1, 2, 7);
    expect(calm.stamina).toBeGreaterThan(r.stamina + 0.15);
  });

  it('oikea nuolisarja siirtää letkun, väärä päästää ilmaa ja sarja alkaa alusta', () => {
    let s = pump(createInflate(7), 1, 3, 12).s;
    const seq = inflateSequence(7, 0);
    expect(seq).toHaveLength(INFLATE.sequence[0]);
    // Väärä nuoli: ilmaa karkaa, letku palaa kylkeen.
    const wrong = [1, 2, 3, 4].find((a) => a !== seq[0])!;
    const slipped = arrows(s, [wrong]);
    expect(slipped.moving).toBe(null);
    expect(slipped.fill[0]).toBeCloseTo(1 - INFLATE.leakStrokes / INFLATE.strokes[0], 5);
    // Täyteen ja oikea sarja.
    s = pump(slipped, 1, 3, 2).s;
    expect(s.moving).toBe(0);
    s = arrows(s, seq.slice(0, 2));
    expect(s.moving).toBe(2);
    s = arrows(s, seq.slice(2));
    expect(s.moving).toBe(null);
    expect(s.valve).toBe(1);
  });

  it('nuolisarjat tulevat kisan siemenestä', () => {
    expect(inflateSequence(5, 1)).toEqual(inflateSequence(5, 1));
    expect(inflateSequence(5, 1)).toHaveLength(INFLATE.sequence[1]);
    const many = new Set([1, 2, 3, 4, 5, 6].map((seed) => inflateSequence(seed, 0).join()));
    expect(many.size).toBeGreaterThan(3);
    for (const seq of [inflateSequence(3, 0), inflateSequence(3, 1)])
      seq.slice(1).forEach((a, i) => expect(a).not.toBe(seq[i]));
  });
});

describe('täyttökisan rivi ja kulku Lunkinjärvellä', () => {
  const water = new WaterBody(LUNKINJARVI);

  it('rivi rannalla: kuusi paikkaa maalla, 4 m välein, rengas edessä', () => {
    const row = inflateRow(water, { x: 1030, y: -412 }, 6, 42);
    expect(row).toHaveLength(6);
    for (const t of row) {
      expect(canStand(water, t.pos)).toBe(true);
      expect(water.isLand(t.shore!.tube)).toBe(true);
      expect(t.shore!.inflate!.fill).toEqual([0, 0, 0]);
      // Katse järvelle: renkaan suuntaan.
      const dx = t.shore!.tube.x - t.pos.x;
      const dy = t.shore!.tube.y - t.pos.y;
      expect(Math.cos(t.heading) * dx + Math.sin(t.heading) * dy).toBeGreaterThan(1);
    }
    for (let i = 0; i < row.length; i++)
      for (let j = i + 1; j < row.length; j++)
        expect(
          Math.hypot(row[i]!.pos.x - row[j]!.pos.x, row[i]!.pos.y - row[j]!.pos.y),
        ).toBeGreaterThan(3);
  });

  it('pumppaus, letkun siirrot ja kyytiin samalla askeleella kuin kisassa', () => {
    let t: TubeState = inflateRow(water, { x: 1030, y: -412 }, 1, 9)[0]!;
    const step = (i: TubeInput) =>
      (t = stepPlayerTube(t, i, water, NET_DT, undefined, undefined, undefined, true));
    // Pumpatessa ei kävellä.
    const at = { ...t.pos };
    for (let k = 0; k < 30; k++) step({ kick: -1, turn: 0, sprint: false });
    expect(t.pos).toEqual(at);
    for (let valve = 0; valve < 3; valve++) {
      for (let k = 0; k < 1200 && t.shore!.inflate?.moving === null; k++)
        step(k % 20 === 0 ? PUMP : REST);
      if (valve < 2) {
        expect(shoreActionAt(t, water)).toBe(null);
        for (const a of inflateSequence(9, valve)) {
          step(ARROW[a]!);
          step(REST);
        }
      }
    }
    expect(t.shore!.inflate).toBeUndefined();
    expect(shoreActionAt(t, water)).toBe('pickUp');
    // Verkon kentät kulkevat täytön aikana samana.
    const mid = inflateRow(water, { x: 1030, y: -412 }, 1, 9)[0]!;
    let m = mid;
    for (let k = 0; k < 200; k++)
      m = stepPlayerTube(
        m,
        k % 20 === 0 ? PUMP : REST,
        water,
        NET_DT,
        undefined,
        undefined,
        undefined,
        true,
      );
    expect(inflateProgress(m.shore!.inflate!)).toBeGreaterThan(0);
    expect({ ...m, ...shoreFromNet(shoreToNet(m)) }).toEqual(m);
  });
});
