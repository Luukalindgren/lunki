import { describe, expect, it } from 'vitest';
import { loonCall, loonCallLength } from './loon';

describe('loonCall', () => {
  it('huuto on kaksiosainen ja nousee toisessa osassa korkeammalle', () => {
    const notes = loonCall('wail', () => 0.5);
    expect(notes).toHaveLength(2);
    const top = (i: number) => Math.max(...notes[i]!.pitch.map(([, f]) => f));
    expect(top(1)).toBeGreaterThan(top(0));
    expect(loonCallLength(notes)).toBeGreaterThan(2.5);
  });

  it('laulussa pitkät ja lyhyet sävelet vuorottelevat ja sarja päättyy pitkään', () => {
    for (const r of [0, 0.5, 0.99]) {
      const notes = loonCall('song', () => r);
      expect(notes.length % 2).toBe(1);
      notes.forEach((n, i) => expect(n.dur > 0.3).toBe(i % 2 === 0));
      // Sävelet eivät mene päällekkäin.
      for (let i = 1; i < notes.length; i++)
        expect(notes[i]!.at).toBeGreaterThanOrEqual(notes[i - 1]!.at + notes[i - 1]!.dur);
    }
  });

  it('taajuudet pysyvät kuikan äänialalla ja tukipisteet sävelen sisällä', () => {
    for (const kind of ['wail', 'song'] as const)
      for (const r of [0, 1]) {
        for (const n of loonCall(kind, () => r)) {
          for (const [t, f] of n.pitch) {
            expect(f).toBeGreaterThan(350);
            expect(f).toBeLessThan(1400);
            expect(t).toBeGreaterThanOrEqual(0);
            expect(t).toBeLessThanOrEqual(n.dur);
          }
        }
      }
  });
});
