import { describe, expect, it } from 'vitest';
import {
  DUCKS,
  MUFFLE,
  PAN_MAX,
  dbGain,
  duckLevel,
  duckSchedule,
  effectMuffle,
  effectPan,
  type Listener,
} from './mix';

const at = (x: number, y: number) => ({ x, y });

describe('äänen suunta', () => {
  const east: Listener = { ear: at(0, 0), right: at(1, 0) };

  it('oikealla oikealta, vasemmalla vasemmalta, edessä ja takana keskeltä', () => {
    expect(effectPan(at(50, 0), east)).toBeCloseTo(PAN_MAX);
    expect(effectPan(at(-50, 0), east)).toBeCloseTo(-PAN_MAX);
    expect(effectPan(at(0, 50), east)).toBeCloseTo(0);
    expect(effectPan(at(0, -50), east)).toBeCloseTo(0);
    expect(effectPan(at(50, 50), east)).toBeCloseTo(PAN_MAX * Math.SQRT1_2);
  });

  it('aivan vierestä kuuluva ääni tulee keskeltä', () => {
    expect(Math.abs(effectPan(at(1, 0), east))).toBeLessThan(PAN_MAX / 2);
    expect(effectPan(at(0, 0), east)).toBe(0);
  });

  it('kääntyminen vaihtaa puolta: sama paikka kuuluu toisesta korvasta', () => {
    const north: Listener = { ear: at(0, 0), right: at(0, 1) };
    const west: Listener = { ear: at(0, 0), right: at(-1, 0) };
    expect(effectPan(at(0, 40), north)).toBeCloseTo(PAN_MAX);
    expect(effectPan(at(40, 0), west)).toBeCloseTo(-PAN_MAX);
  });

  it('kaukainen ääni tummuu', () => {
    expect(effectMuffle(0)).toBe(MUFFLE.open);
    expect(effectMuffle(MUFFLE.near)).toBe(MUFFLE.open);
    expect(effectMuffle(MUFFLE.far)).toBeCloseTo(MUFFLE.dull);
    expect(effectMuffle(80)).toBeLessThan(effectMuffle(40));
  });
});

describe('väistö', () => {
  it('voimakkain väistö ratkaisee, eivätkä väistöt summaudu', () => {
    const active = [
      { from: 0, until: 2, db: -6 },
      { from: 1, until: 5, db: -18 },
    ];
    expect(duckLevel(active, 0.5)).toBeCloseTo(dbGain(-6));
    expect(duckLevel(active, 1.5)).toBeCloseTo(dbGain(-18));
    expect(duckLevel(active, 3)).toBeCloseTo(dbGain(-18));
    expect(duckLevel(active, 5)).toBe(1);
  });

  it('aikataulu: alas väistön alussa ja takaisin lopussa', () => {
    const active = [
      { from: 0, until: 2, db: -6 },
      { from: 1, until: 5, db: -18 },
    ];
    expect(duckSchedule(active, 0)).toEqual([
      { at: 0, gain: dbGain(-6) },
      { at: 1, gain: dbGain(-18) },
      { at: 5, gain: 1 },
    ]);
    // Viiveellä alkava väistö (kaukainen salama): taso pysyy, kunnes ääni saapuu.
    expect(duckSchedule([{ from: 3, until: 6, db: -6 }], 0)).toEqual([
      { at: 0, gain: 1 },
      { at: 3, gain: dbGain(-6) },
      { at: 6, gain: 1 },
    ]);
  });

  it('ukkosella musiikki hiljenee reilusti muttei kokonaan', () => {
    const music = dbGain(DUCKS.thunder.music);
    expect(music).toBeLessThan(0.2);
    expect(music).toBeGreaterThan(0.05);
    expect(DUCKS.thunder.music).toBeLessThan(DUCKS.thunder.ambience);
    for (const d of Object.values(DUCKS)) expect(d.music).toBeLessThanOrEqual(d.ambience);
  });
});
