import { describe, expect, it } from 'vitest';
import { catchJoy, isPersonalBest, isRaceBest, RELIEF_AFTER } from './catchJoy';
import type { JournalEntry } from './journal';

const entry = (over: Partial<JournalEntry> = {}): JournalEntry => ({
  species: 'perch',
  weight: 0.3,
  bait: { lure: 'spoon' },
  sky: 'calm',
  timeOfDay: 'day',
  season: 'summer',
  depth: 1.5,
  x: 10,
  y: 20,
  at: 1,
  ...over,
});

const journal = [
  entry({ weight: 0.3 }),
  entry({ weight: 0.5 }),
  entry({ species: 'pike', weight: 3 }),
];

describe('iloiset saaliit', () => {
  it('oma ennätys on lajin aiempia saaliita painavampi', () => {
    expect(isPersonalBest(journal, 'perch', 0.6)).toBe(true);
    expect(isPersonalBest(journal, 'perch', 0.5)).toBe(false);
    expect(isPersonalBest(journal, 'perch', 0.4)).toBe(false);
    // Hauen ennätys ei koske ahventa.
    expect(isPersonalBest(journal, 'pike', 2.9)).toBe(false);
  });

  it('lajin ensimmäinen kala ei vielä ole ennätys', () => {
    expect(isPersonalBest(journal, 'roach', 0.2)).toBe(false);
    expect(isPersonalBest([], 'perch', 5)).toBe(false);
  });

  it('kisan suurin on kisan aiempia omia saaliita painavampi', () => {
    expect(isRaceBest([{ weight: 0.3 }, { weight: 0.5 }], 0.6)).toBe(true);
    expect(isRaceBest([{ weight: 0.3 }, { weight: 0.5 }], 0.5)).toBe(false);
    expect(isRaceBest([], 2)).toBe(false);
  });

  it('järjestys: ennätys, sitten helpotus, sitten kisan suurin', () => {
    const small = { species: 'perch', weight: 0.2 } as const;
    const quick = { waited: 60, earlier: [{ weight: 0.1 }] };
    const long = { waited: RELIEF_AFTER.normal, earlier: [{ weight: 0.1 }] };
    expect(catchJoy(journal, small, { ...quick, earlier: [{ weight: 0.3 }] }, 'normal')).toBeNull();
    expect(catchJoy(journal, small, quick, 'normal')).toBe('raceBest');
    expect(catchJoy(journal, small, long, 'normal')).toBe('relief');
    expect(catchJoy(journal, { ...small, weight: 0.7 }, long, 'normal')).toBe('record');
    expect(catchJoy(journal, { ...small, weight: 0.7 }, quick, 'normal')).toBe('record');
  });

  it('helpolla odotus on lyhyempi kuin realistisella', () => {
    expect(RELIEF_AFTER.easy).toBeLessThan(RELIEF_AFTER.normal);
    expect(RELIEF_AFTER.normal).toBeLessThan(RELIEF_AFTER.realistic);
  });
});
