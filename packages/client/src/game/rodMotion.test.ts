import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { DEFAULT_TACKLE, createFishing, type FishingState } from '@lunki/shared';
import {
  OwnRodMotion,
  ROD_MOTION,
  RodMotion,
  bendRod,
  loadBend,
  strikeTaut,
  strikeTugs,
} from './rodMotion';

const DT = 1 / 60;

/** Ajaa vapaa `seconds` sekuntia ja palauttaa suurimman noston. */
function run(m: OwnRodMotion, s: FishingState, seconds: number) {
  let peak = -Infinity;
  let last = m.pose(s, DT);
  for (let t = 0; t < seconds; t += DT) {
    last = m.pose(s, DT);
    peak = Math.max(peak, last.lift);
  }
  return { peak, last };
}

describe('vavan liike', () => {
  it('nykäisy nostaa vavan nopeasti ylös ja se palaa lepoon', () => {
    const m = new OwnRodMotion();
    const s = { ...createFishing(), stage: 'water' as const };
    m.onEvents({ twitch: true }, s);
    const up = run(m, s, 0.2);
    expect(up.peak).toBeGreaterThan(ROD_MOTION.twitch.lift * 0.7);
    // Nousevan vavan kärki laahaa perässä (taipuu alas).
    const fresh = new OwnRodMotion();
    fresh.onEvents({ twitch: true }, s);
    expect(fresh.pose(s, 0.04).flex).toBeLessThan(0);
    const back = run(m, s, 1);
    expect(Math.abs(back.last.lift)).toBeLessThan(0.05);
  });

  it('väsytyksessä vapa on pystympänä ja taipuu jännityksen mukaan', () => {
    const m = new OwnRodMotion();
    const s = { ...createFishing(), stage: 'water' as const, hookedId: 1, tension: 2.5 };
    const { last } = run(m, s, 1.5);
    expect(last.lift).toBeCloseTo(ROD_MOTION.fight, 2);
    expect(last.bend).toBeCloseTo(loadBend(2.5, s.tackle), 2);
    expect(last.pull).not.toBeNull();
  });

  it('pohjaan tarttunut viehe taivuttaa vapaa kelatessa', () => {
    const m = new OwnRodMotion();
    const s = { ...createFishing(), stage: 'water' as const, snag: 0.5, tension: 2 };
    expect(run(m, s, 1).last.bend).toBeGreaterThan(0.6);
    expect(run(m, { ...s, tension: 0 }, 1).last.bend).toBeLessThan(0.05);
  });

  it('heiton latauksessa vapa nousee taakse voiman mukaan', () => {
    const m = new OwnRodMotion();
    const s = { ...createFishing(), stage: 'charging' as const, charge: 1.1 };
    expect(run(m, s, 1).last.lift).toBeCloseTo(ROD_MOTION.castBack, 1);
  });

  it('kevyt vapa taipuu enemmän kuin järeä, perhovapa eniten', () => {
    const light = loadBend(1.5, { ...DEFAULT_TACKLE, rod: 'light' });
    const heavy = loadBend(1.5, { ...DEFAULT_TACKLE, rod: 'heavy' });
    const fly = loadBend(1.5, { ...DEFAULT_TACKLE, method: 'fly', flyRod: 'fly6' });
    expect(light).toBeGreaterThan(heavy);
    expect(fly).toBeGreaterThan(light);
    expect(loadBend(100, DEFAULT_TACKLE)).toBeLessThanOrEqual(ROD_MOTION.maxBend.spin);
  });

  it('tärpin nykäykset lasketaan huipuista', () => {
    const peak = Math.PI / 2 / ROD_MOTION.strikeRate;
    expect(strikeTugs(0)).toBe(0);
    expect(strikeTugs(peak * 0.9)).toBe(0);
    expect(strikeTugs(peak * 1.1)).toBe(1);
    expect(strikeTugs(peak * 3.1)).toBe(2);
  });

  it('tärpissä siima ja kärki nykivät', () => {
    const taut = Array.from({ length: 30 }, (_, i) => strikeTaut(i * 0.03));
    expect(Math.max(...taut) - Math.min(...taut)).toBeGreaterThan(0.6);
    const m = new OwnRodMotion();
    const s = { ...createFishing(), stage: 'water' as const, struckId: 3, strikeAge: 0 };
    const bends: number[] = [];
    for (let i = 0; i < 40; i++) {
      s.strikeAge = i * DT;
      bends.push(m.pose(s, DT).bend);
    }
    expect(Math.max(...bends.slice(10)) - Math.min(...bends.slice(10))).toBeGreaterThan(0.1);
  });

  it('jousi pysyy vakaana hitaallakin ruudunpäivityksellä', () => {
    const m = new RodMotion();
    m.pulse(0.6, 0.12);
    for (let i = 0; i < 20; i++) expect(Math.abs(m.step(0, 0, 0.1).lift)).toBeLessThan(1);
  });
});

describe('taipuneen vavan muoto', () => {
  const butt = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3(1, 0, 0);
  const pts = () => Array.from({ length: 9 }, () => new THREE.Vector3());

  it('suora ilman kuormaa', () => {
    const out = pts();
    bendRod(butt, dir, 2, null, 0, 0, out);
    expect(out[8]!.x).toBeCloseTo(2, 5);
    expect(out[4]!.x).toBeCloseTo(1, 5);
  });

  it('aihion pituus säilyy ja kärki kääntyy vedon suuntaan', () => {
    const out = pts();
    const down = new THREE.Vector3(0, -1, 0);
    const tipDir = bendRod(butt, dir, 2, down, 1.2, 0, out);
    let length = 0;
    for (let i = 1; i < out.length; i++) length += out[i]!.distanceTo(out[i - 1]!);
    expect(length).toBeCloseTo(2, 1);
    expect(out[8]!.y).toBeLessThan(1 - 0.4);
    expect(tipDir.angleTo(dir)).toBeCloseTo(1.2, 3);
  });
});
