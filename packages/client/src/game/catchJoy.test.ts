import { describe, expect, it } from 'vitest';
import { catchJoy, isPersonalBest, RELIEF_AFTER } from './catchJoy';
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

  it('pitkä odotus tekee saaliista helpotuksen, ennätys voittaa sen', () => {
    const small = { species: 'perch', weight: 0.2 } as const;
    expect(catchJoy(journal, small, 60, 'normal')).toBeNull();
    expect(catchJoy(journal, small, RELIEF_AFTER.normal, 'normal')).toBe('relief');
    expect(catchJoy(journal, { ...small, weight: 0.7 }, 600, 'normal')).toBe('record');
    expect(catchJoy(journal, { ...small, weight: 0.7 }, 0, 'normal')).toBe('record');
  });

  it('helpolla odotus on lyhyempi kuin realistisella', () => {
    expect(RELIEF_AFTER.easy).toBeLessThan(RELIEF_AFTER.normal);
    expect(RELIEF_AFTER.normal).toBeLessThan(RELIEF_AFTER.realistic);
  });
});
