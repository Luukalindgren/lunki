import { describe, expect, it } from 'vitest';
import { createFlyCast } from '@lunki/shared';
import {
  FLY_LINE_POINTS,
  RemoteFlyLine,
  flyLinePose,
  flyLineProfile,
  flyLineWorld,
  type FlyLinePose,
} from './flyLine';

const tip = { forward: 1.6, height: 1.2 };
const loop = (unroll: number, dir: -1 | 1, extra: Partial<FlyLinePose> = {}): FlyLinePose => ({
  tipS: tip.forward,
  tipH: tip.height,
  length: 12,
  phase: 'loop',
  dir,
  unroll,
  late: 0,
  wide: false,
  ...extra,
});
const last = <T>(a: readonly T[]) => a[a.length - 1]!;

describe('perhosiiman muoto (#236)', () => {
  it('valmiina siima roikkuu kärjestä ja lepää pinnalla edessä', () => {
    const pts = flyLineProfile(flyLinePose(createFlyCast(6, true), tip));
    expect(pts).toHaveLength(FLY_LINE_POINTS);
    expect(pts[0]).toMatchObject({ s: tip.forward, h: tip.height });
    expect(last(pts).h).toBeLessThan(0.1);
    expect(last(pts).s).toBeGreaterThan(tip.forward + 5);
  });

  it('silmukka aukeaa: perho kulkee takaa eteen, ja suorassa siima on yhtä pitkä', () => {
    const start = last(flyLineProfile(loop(0, 1)));
    const mid = last(flyLineProfile(loop(0.5, 1)));
    const end = flyLineProfile(loop(1, 1));
    expect(start.s).toBeLessThan(tip.forward - 10);
    expect(mid.s).toBeGreaterThan(start.s);
    expect(last(end).s).toBeCloseTo(tip.forward + 12, 0);
    // Suorassa siimassa ei ole silmukkaa eikä sivusiirtymää.
    expect(Math.max(...end.map((p) => p.lat))).toBe(0);
  });

  it('silmukassa ylempi osa on alemman yläpuolella ja kallellaan sivulle', () => {
    const pts = flyLineProfile(loop(0.5, -1));
    const rodLeg = pts[5]!;
    const flyLeg = last(pts);
    expect(flyLeg.h).toBeGreaterThan(rodLeg.h + 0.3);
    expect(flyLeg.lat).toBeGreaterThan(0.2);
    // Leveä silmukka on leveämpi.
    const wide = last(flyLineProfile(loop(0.5, -1, { wide: true })));
    expect(wide.h - rodLeg.h).toBeGreaterThan(flyLeg.h - rodLeg.h);
  });

  it('takaheitto nousee taakse, ja myöhästynyt siima putoaa', () => {
    const back = last(flyLineProfile(loop(1, -1)));
    expect(back.s).toBeLessThan(0);
    expect(back.h).toBeGreaterThan(tip.height + 1);
    const late = last(flyLineProfile(loop(1, -1, { late: 0.8 })));
    expect(late.h).toBeLessThan(back.h - 0.5);
  });

  it('järven koordinaateissa kärki on katsesuunnassa ja siima heittosuunnassa', () => {
    const pts = flyLineProfile(loop(1, 1));
    const world = flyLineWorld(pts, { x: 10, y: 20 }, 0, Math.PI / 2, { x: 0, y: -0.5 });
    expect(world[0]!.x).toBeCloseTo(10 + tip.forward);
    expect(world[0]!.y).toBeCloseTo(19.5);
    expect(last(world).x).toBeCloseTo(10 + tip.forward);
    expect(last(world).y).toBeGreaterThan(19.5 + 11);
  });

  it('muiden heitossa suunta ja aukeaminen päätellään perhon liikkeestä', () => {
    const remote = new RemoteFlyLine();
    // Perho kulkee takaa (−12 m) eteen (+12 m): eteenheiton silmukka aukeaa.
    let pose = remote.pose(-12, tip);
    for (let a = -11; a <= 0; a++) pose = remote.pose(a, tip);
    expect(pose.dir).toBe(1);
    expect(pose.length).toBe(12);
    expect(pose.unroll).toBeCloseTo(0.5);
    pose = remote.pose(-1, tip);
    expect(pose.dir).toBe(-1);
  });
});
