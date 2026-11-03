import { createCompetition, DEFAULT_SETTINGS, rankPlayers, type CatchRecord } from '@lunki/shared';
import { describe, expect, it } from 'vitest';
import { baitKey, raceStatus, type Bait } from './raceStatus';

const fish = (species: CatchRecord['species'], weight: number, time: number): CatchRecord => ({
  species,
  name: species,
  weight,
  time,
});

describe('taukovalikon kisatilanne (#469)', () => {
  it('yksinpelissä oma saalis, paras kala vieheineen ja jäljellä oleva aika', () => {
    const c = createCompetition({ ...DEFAULT_SETTINGS, durationMinutes: 15 });
    c.elapsed = 300;
    c.catches.push(fish('perch', 0.62, 100), fish('pike', 1.48, 200));
    const baits = new Map<string, Bait>([[baitKey(c.catches[1]!), { lure: 'spoon' }]]);
    const s = raceStatus(c, null, 'me', baits);
    expect(s.count).toBe(2);
    expect(s.total).toBeCloseTo(2.1);
    expect(s.best).toEqual({ species: 'pike', weight: 1.48, bait: { lure: 'spoon' } });
    expect(s.place).toBeNull();
    expect(s.time).toEqual({ kind: 'left', seconds: 600 });
  });

  it('moninpelissä sija ja luvut tulostaulun omalta riviltä', () => {
    const c = createCompetition(DEFAULT_SETTINGS);
    const standings = rankPlayers(
      [
        { id: 'a', name: 'A', catches: [fish('pike', 3, 50)] },
        { id: 'me', name: 'Minä', catches: [fish('perch', 0.4, 60)] },
        { id: 'b', name: 'B', catches: [] },
      ],
      'total',
    );
    const s = raceStatus(c, standings, 'me', new Map());
    expect(s.place).toEqual({ rank: 2, of: 3 });
    expect(s.count).toBe(1);
    expect(s.best).toEqual({ species: 'perch', weight: 0.4, bait: null });
  });

  it('ennen ensimmäistä kalaa sijaa ei ole, vaikka nollat ovat tasapeli (#488)', () => {
    const c = createCompetition(DEFAULT_SETTINGS);
    const standings = rankPlayers(
      [
        { id: 'me', name: 'Minä', catches: [] },
        { id: 'b', name: 'B', catches: [] },
      ],
      'total',
    );
    const s = raceStatus(c, standings, 'me', new Map());
    expect(standings.find((r) => r.id === 'me')!.rank).toBe(1);
    expect(s.place).toEqual({ rank: null, of: 2 });
    expect(s.count).toBe(0);
  });
});
