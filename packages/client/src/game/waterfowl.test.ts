import { describe, expect, it } from 'vitest';
import { LUNKINJARVI, WaterBody, type Vec2 } from '@lunki/shared';
import type { BirdEvent, BirdPose } from './birdPose';
import { WATERFOWL, Waterfowl } from './waterfowl';

const water = new WaterBody(LUNKINJARVI);
const lake = { water, map: LUNKINJARVI };
const DT = 1 / 30;

function run(w: Waterfowl, seconds: number, crafts: () => Vec2[] = () => [], splash?: Vec2) {
  const events: BirdEvent[] = [];
  for (let t = 0; t < seconds; t += DT)
    w.update(DT, { crafts: crafts(), splash: t === 0 ? (splash ?? null) : null }, events);
  return events;
}

describe('Waterfowl (#572)', () => {
  it('sama siemen antaa samat linnut, kaikki vedessä', () => {
    const a = new Waterfowl(8, 'summer', lake);
    const b = new Waterfowl(8, 'summer', lake);
    expect(a.count).toBe(WATERFOWL.flocks.summer.length);
    expect(a.state).toEqual(b.state);
    run(a, 60);
    run(b, 60);
    expect(a.state).toEqual(b.state);
    for (const f of a.state) expect(water.isWater(f.pos)).toBe(true);
  });

  it('kausi päättää lajit: kesällä poikueet, syksyllä joutsenparvi', () => {
    const kinds = (season: 'summer' | 'autumn') => {
      const out: BirdPose[] = [];
      new Waterfowl(3, season, lake).poses(out);
      return out.map((p) => p.kind);
    };
    expect(kinds('summer').filter((k) => k === 'duckling').length).toBe(12);
    expect(kinds('autumn').filter((k) => k === 'duckling').length).toBe(0);
    expect(kinds('autumn').filter((k) => k === 'swan').length).toBe(7);
    expect(new Waterfowl(3, 'winter', lake).count).toBe(0);
  });

  it('pysyvät vedessä pitkässä kisassa, vaikka niitä ajetaan takaa', () => {
    const w = new Waterfowl(21, 'spring', lake);
    const poses: BirdPose[] = [];
    let t = 0;
    for (let i = 0; i < 20 * 60 * 10; i++) {
      t += 0.1;
      // Kulkupeli kiertää lintujen luona vuorotellen.
      const target = w.state[Math.floor(t / 60) % w.count]!.pos;
      w.update(0.1, { crafts: [{ x: target.x + 8, y: target.y }], splash: null }, []);
      for (const f of w.state) if (f.mode !== 'fly') expect(water.isWater(f.pos)).toBe(true);
    }
    w.poses(poses);
    expect(poses.length).toBeGreaterThan(0);
  });

  it('lähelle tullut kulkupeli nostaa sorsaparin lentoon, ja se laskeutuu muualle', () => {
    const w = new Waterfowl(8, 'spring', lake);
    const i = w.state.findIndex((f) => f.kind === 'mallard');
    const start = { ...w.state[i]!.pos };
    const events = run(w, 2, () => [{ x: start.x + 5, y: start.y }]);
    expect(events.some((e) => e.kind === 'flush' && e.bird === 'mallard')).toBe(true);
    expect(w.state[i]!.mode).toBe('fly');
    const later = run(w, 60);
    expect(later.some((e) => e.kind === 'land')).toBe(true);
    const end = w.state[i]!.pos;
    expect(Math.hypot(end.x - start.x, end.y - start.y)).toBeGreaterThan(100);
  });

  it('poikueen kanssa sorsa ei lennä vaan ui pakoon', () => {
    const w = new Waterfowl(8, 'summer', lake);
    const i = w.state.findIndex((f) => f.kind === 'mallard');
    const start = { ...w.state[i]!.pos };
    const events = run(w, 10, () => [{ x: start.x + 5, y: start.y }]);
    expect(events.filter((e) => e.kind === 'flush')).toHaveLength(0);
    const end = w.state[i]!.pos;
    expect(Math.hypot(end.x - start.x, end.y - start.y)).toBeGreaterThan(3);
  });

  it('kuikka sukeltaa vieheen molskahduksesta ja nousee toisaalla', () => {
    const w = new Waterfowl(8, 'summer', lake);
    const i = w.state.findIndex((f) => f.kind === 'loon');
    const start = { ...w.state[i]!.pos };
    const events = run(w, 1, () => [], { x: start.x + 10, y: start.y });
    expect(events.some((e) => e.kind === 'dive' && e.bird === 'loon')).toBe(true);
    expect(w.state[i]!.mode).toBe('dive');
    const later = run(w, 80);
    expect(later.some((e) => e.kind === 'surface')).toBe(true);
    const end = w.state[i]!.pos;
    expect(Math.hypot(end.x - start.x, end.y - start.y)).toBeGreaterThan(20);
  });
});
