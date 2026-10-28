import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyRaceStats } from '@lunki/shared';
import { addLifetimeRace, loadLifetimeStats } from './lifetimeStats';

describe('kaikkien kisojen tilastot laitteella (#367)', () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('kisat lasketaan yhteen ja suurin kala säilyy', () => {
    expect(loadLifetimeStats().races).toBe(0);
    addLifetimeRace({ ...emptyRaceStats(), casts: 10, longestCast: 30 }, [
      { species: 'pike', weight: 2 },
      { species: 'perch', weight: 0.25 },
    ]);
    const life = addLifetimeRace({ ...emptyRaceStats(), casts: 5, longestCast: 41 }, [
      { species: 'perch', weight: 0.5 },
    ]);
    expect(life).toMatchObject({
      races: 2,
      fish: 3,
      weight: 2.75,
      biggest: { species: 'pike', weight: 2 },
      species: ['pike', 'perch'],
    });
    expect(life.stats).toMatchObject({ casts: 15, longestCast: 41 });
    expect(loadLifetimeStats()).toEqual(life);
  });

  it('rikkinäinen tai vieras tallenne ei kaada peliä', () => {
    store.set('lunki.stats', '{"races":-4,"species":["pike","valas"],"stats":{"casts":"x"}');
    expect(loadLifetimeStats().races).toBe(0);
    store.set(
      'lunki.stats',
      '{"races":3,"species":["pike","valas"],"biggest":{"species":"valas","weight":9}}',
    );
    expect(loadLifetimeStats()).toMatchObject({ races: 3, species: ['pike'], biggest: null });
  });
});
