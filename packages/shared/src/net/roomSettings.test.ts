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
          weather: 'tornado',
          capsizePenalty: 'lose-catch',
          species: ['whale'],
          extra: 1,
        },
        2,
      ),
    ).toEqual({});
    expect(validateSettingsPatch(null, 1)).toEqual({});
  });

  it('salaman rangaistukset kelpaavat, kaatumisen vasta myöhemmin', () => {
    expect(validateSettingsPatch({ lightningPenalty: 'out' }, 1)).toEqual({
      lightningPenalty: 'out',
    });
    expect(validateSettingsPatch({ lightningPenalty: 'zap', capsizePenalty: 'out' }, 1)).toEqual(
      {},
    );
  });

  it('pelaajamäärä ei voi laskea alle nykyisten', () => {
    expect(validateSettingsPatch({ maxPlayers: 2 }, 3)).toEqual({});
    expect(validateSettingsPatch({ maxPlayers: 16 }, 3)).toEqual({ maxPlayers: 16 });
  });

  it('kalalajeista jää vain tunnetut, aina samassa järjestyksessä', () => {
    expect(
      validateSettingsPatch({ species: ['trout', 'perch', 'whale', 'pike', 'perch'] }, 1),
    ).toEqual({ species: ['perch', 'pike', 'trout'] });
    expect(validateSettingsPatch({ species: [] }, 1)).toEqual({});
    expect(validateSettingsPatch({ species: ['toString'] }, 1)).toEqual({});
  });
});
