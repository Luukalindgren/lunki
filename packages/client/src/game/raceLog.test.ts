import { describe, expect, it } from 'vitest';
import { RaceLog, TRACK_COLORS } from './raceLog';

const spot = (id: string, x: number, y = 0) => ({ id, name: id.toUpperCase(), pos: { x, y } });

describe('kisan kulku kartalle', () => {
  it('kirjaa reitin kerran sekunnissa', () => {
    const log = new RaceLog();
    for (let i = 0; i <= 30; i++) log.sample(i / 10, [spot('a', i)]);
    const [track] = log.data().tracks;
    // Näytteet hetkillä 0, 1, 2 ja 3 s.
    expect(track!.segments).toEqual([
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 20, y: 0 },
        { x: 30, y: 0 },
      ],
    ]);
  });

  it('pitkä hyppy aloittaa uuden osan, paikallaan ei kerry pisteitä', () => {
    const log = new RaceLog();
    log.sample(0, [spot('a', 0)]);
    log.sample(1, [spot('a', 0.1)]);
    log.sample(2, [spot('a', 5)]);
    log.sample(3, [spot('a', 300)]);
    const segs = log.data().tracks[0]!.segments;
    expect(segs).toHaveLength(2);
    expect(segs[0]).toHaveLength(2);
    expect(segs[1]).toEqual([{ x: 300, y: 0 }]);
  });

  it('jokaisella pelaajalla oma väri liittymisjärjestyksessä', () => {
    const log = new RaceLog();
    log.sample(0, [spot('a', 0)]);
    log.sample(1, [spot('b', 0), spot('a', 1)]);
    expect(log.colorOf('a')).toBe(TRACK_COLORS[0]);
    expect(log.colorOf('b')).toBe(TRACK_COLORS[1]);
    expect(log.colorOf('c')).toBeNull();
    expect(log.data().tracks.map((t) => t.name)).toEqual(['A', 'B']);
  });

  it('sama sotku kirjataan kerran, uusi sotku uudestaan', () => {
    const log = new RaceLog();
    const t = [{ key: 'a|b', pos: { x: 1, y: 2 } }];
    log.tangles(t, 5);
    log.tangles(t, 6);
    log.tangles([], 7);
    log.tangles(t, 8);
    expect(log.data().events).toEqual([
      { kind: 'tangle', pos: { x: 1, y: 2 }, time: 5 },
      { kind: 'tangle', pos: { x: 1, y: 2 }, time: 8 },
    ]);
  });

  it('saaliit ja tapahtumat talteen kopioina', () => {
    const log = new RaceLog();
    const pos = { x: 3, y: 4 };
    log.addCatch({ id: 'a', pos, species: 'pike', name: 'Hauki', weight: 2, time: 60 });
    log.addEvent('lightning', pos, 70);
    pos.x = 99;
    const d = log.data();
    expect(d.catches[0]!.pos).toEqual({ x: 3, y: 4 });
    expect(d.events[0]).toEqual({ kind: 'lightning', pos: { x: 3, y: 4 }, time: 70 });
  });
});
