import { describe, expect, it } from 'vitest';
import { loonCallLength } from './loon';
import { craneCall, gooseFlock } from './seasonCalls';

describe('seasonCalls', () => {
  it('kurki toitottaa 2–4 kertaa rullaten, ja sarja laskee', () => {
    for (const r of [0, 0.5, 0.99]) {
      const notes = craneCall(() => r);
      expect(notes.length).toBeGreaterThanOrEqual(2);
      expect(notes.length).toBeLessThanOrEqual(4);
      for (const n of notes) expect(n.trill).toBeGreaterThan(20);
      const top = (i: number) => Math.max(...notes[i]!.pitch.map(([, f]) => f));
      expect(top(notes.length - 1)).toBeLessThan(top(0));
      for (let i = 1; i < notes.length; i++)
        expect(notes[i]!.at).toBeGreaterThanOrEqual(notes[i - 1]!.at + notes[i - 1]!.dur);
    }
  });

  it('hanhiaura on lyhyitä, matalampia ääniä muutaman sekunnin ajan', () => {
    for (const r of [0, 0.5, 0.99]) {
      const notes = gooseFlock(() => r);
      expect(notes.length).toBeGreaterThanOrEqual(8);
      for (const n of notes) {
        expect(n.dur).toBeLessThan(0.25);
        for (const [t, f] of n.pitch) {
          expect(t).toBeLessThanOrEqual(n.dur);
          expect(f).toBeGreaterThan(250);
          expect(f).toBeLessThan(500);
        }
      }
      for (let i = 1; i < notes.length; i++)
        expect(notes[i]!.at).toBeGreaterThanOrEqual(notes[i - 1]!.at);
      expect(loonCallLength(notes)).toBeLessThan(5);
    }
  });
});
