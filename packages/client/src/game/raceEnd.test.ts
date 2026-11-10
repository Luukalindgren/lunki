import { describe, expect, it } from 'vitest';
import { raceEndCue } from './raceEnd';

describe('kisan loppu (#566)', () => {
  it('ilmoitus kerran, kun kello ylittää minuutin', () => {
    expect(raceEndCue(60.02, 59.99).minute).toBe(true);
    expect(raceEndCue(59.99, 59.97).minute).toBe(false);
    expect(raceEndCue(120, 119.98).minute).toBe(false);
    // Kesken viimeistä minuuttia liittynyt ei saa ilmoitusta ensimmäisellä askeleella.
    expect(raceEndCue(null, 30).minute).toBe(false);
  });

  it('loppulaskenta kymmenestä ykköseen, piippaus numeron vaihtuessa', () => {
    expect(raceEndCue(10.02, 9.99)).toEqual({ minute: false, tick: 10, count: 10 });
    expect(raceEndCue(9.99, 9.5)).toEqual({ minute: false, tick: null, count: 10 });
    expect(raceEndCue(9.01, 8.99)).toEqual({ minute: false, tick: 9, count: 9 });
    expect(raceEndCue(1.01, 0.5).count).toBe(1);
    expect(raceEndCue(0.01, 0).count).toBeNull();
    expect(raceEndCue(11, 10.5).count).toBeNull();
  });
});
