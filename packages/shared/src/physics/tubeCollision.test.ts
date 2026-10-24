import { describe, expect, it } from 'vitest';
import { TUBE_RADIUS, createTube, type TubeState } from './tube';
import { collideTubePair, collideTubes } from './tubeCollision';

const tube = (x: number, y: number, vx = 0, vy = 0): TubeState => ({
  ...createTube({ x, y }),
  vel: { x: vx, y: vy },
});

describe('renkaiden törmäys', () => {
  it('erilliset renkaat eivät reagoi', () => {
    expect(collideTubePair(tube(0, 0), tube(TUBE_RADIUS * 2 + 0.01, 0))).toBeNull();
  });

  it('nokkakolari: erottuvat ja kimpoavat, liikemäärä säilyy', () => {
    const [a, b] = collideTubePair(tube(0, 0, 1, 0), tube(1.2, 0, -1, 0))!;
    expect(b.pos.x - a.pos.x).toBeCloseTo(TUBE_RADIUS * 2);
    expect(a.vel.x).toBeLessThan(0);
    expect(b.vel.x).toBeGreaterThan(0);
    expect(a.vel.x + b.vel.x).toBeCloseTo(0);
    // Kimmoisuus 0,6: nopeudet pienenevät.
    expect(Math.abs(a.vel.x)).toBeCloseTo(0.6);
  });

  it('paikallaan olevaa työnnetään', () => {
    const [a, b] = collideTubePair(tube(0, 0, 1, 0), tube(1.5, 0))!;
    expect(b.vel.x).toBeGreaterThan(0.5);
    expect(a.vel.x).toBeLessThan(0.5);
    expect(a.vel.x + b.vel.x).toBeCloseTo(1);
  });

  it('erkanevat renkaat vain erotetaan', () => {
    const [a, b] = collideTubePair(tube(0, 0, -1, 0), tube(1.5, 0, 1, 0))!;
    expect(a.vel.x).toBe(-1);
    expect(b.vel.x).toBe(1);
  });

  it('päällekkäiset erotetaan aina samaan suuntaan', () => {
    const [a, b] = collideTubePair(tube(5, 5), tube(5, 5))!;
    expect(a.pos.x).toBeLessThan(b.pos.x);
    expect(a.pos.y).toBe(b.pos.y);
  });

  it('usean renkaan ryhmä', () => {
    const list = [tube(0, 0, 1, 0), tube(1.4, 0), tube(2.8, 0, -1, 0), tube(50, 50)];
    const hit = collideTubes(list);
    expect([...hit].sort()).toEqual([0, 1, 2]);
    expect(list[3]!.pos).toEqual({ x: 50, y: 50 });
  });
});
