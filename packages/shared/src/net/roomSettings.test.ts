import { describe, expect, it } from 'vitest';
import { validateSettingsPatch } from './roomSettings';

describe('validateSettingsPatch', () => {
  it('hyväksyy kelvolliset arvot', () => {
    expect(
      validateSettingsPatch(
        { durationMinutes: 30, winRule: 'biggest', difficulty: 'realistic', maxPlayers: 4 },
        2,
      ),
    ).toEqual({ durationMinutes: 30, winRule: 'biggest', difficulty: 'realistic', maxPlayers: 4 });
  });

  it('hylkää väärät ja toteuttamattomat', () => {
    expect(
      validateSettingsPatch(
        {
          durationMinutes: 11,
          winRule: 'most',
          difficulty: 'toString',
          maxPlayers: 1000,
          weather: 'stormy',
          capsizePenalty: 'lose-catch',
          species: ['pike'],
          extra: 1,
        },
        2,
      ),
    ).toEqual({});
    expect(validateSettingsPatch(null, 1)).toEqual({});
  });

  it('pelaajamäärä ei voi laskea alle nykyisten', () => {
    expect(validateSettingsPatch({ maxPlayers: 2 }, 3)).toEqual({});
    expect(validateSettingsPatch({ maxPlayers: 16 }, 3)).toEqual({ maxPlayers: 16 });
  });

  it('kalalajeista jää vain toteutetut', () => {
    expect(validateSettingsPatch({ species: ['perch', 'pike', 'perch'] }, 1)).toEqual({
      species: ['perch'],
    });
  });
});
