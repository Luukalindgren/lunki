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
          capsizePenalty: 'drown',
          species: ['whale'],
          extra: 1,
        },
        2,
      ),
    ).toEqual({});
    expect(validateSettingsPatch(null, 1)).toEqual({});
  });

  it('salaman ja kaatumisen rangaistukset', () => {
    expect(
      validateSettingsPatch({ lightningPenalty: 'out', capsizePenalty: 'time-out' }, 1),
    ).toEqual({ lightningPenalty: 'out', capsizePenalty: 'time-out' });
    expect(validateSettingsPatch({ lightningPenalty: 'zap', capsizePenalty: 'flip' }, 1)).toEqual(
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

  it('aloituspaikka: null = satunnainen, piste vain tarkistettuna', () => {
    const wet = (p: { x: number }) => p.x > 0;
    expect(validateSettingsPatch({ start: null }, 1)).toEqual({ start: null });
    expect(validateSettingsPatch({ start: { x: 12.345, y: -3.21 } }, 1, wet)).toEqual({
      start: { x: 12.3, y: -3.2 },
    });
    expect(validateSettingsPatch({ start: { x: -5, y: 0 } }, 1, wet)).toEqual({});
    expect(validateSettingsPatch({ start: { x: 'a', y: 0 } }, 1, wet)).toEqual({});
    expect(validateSettingsPatch({ start: { x: Infinity, y: 0 } }, 1, wet)).toEqual({});
    // Ilman tarkistinta pistettä ei hyväksytä.
    expect(validateSettingsPatch({ start: { x: 5, y: 0 } }, 1)).toEqual({});
  });
});
