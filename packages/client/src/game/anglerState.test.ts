import { describe, expect, it } from 'vitest';
import { LureStage } from '@lunki/shared';
import { setLangForTest } from '../i18n';
import { anglerState } from './anglerState';

describe('seurattavan tilarivi (#814)', () => {
  it('kertoo tavan, vaiheen ja siiman pituuden', () => {
    setLangForTest('fi');
    const pos = { x: 0, y: 0 };
    const lure = { x: 9.1, y: 0 };
    expect(anglerState({ pos, lure, lureStage: LureStage.hooked, pole: true })).toBe(
      'Onki · kala kiinni · 9,1 m',
    );
    expect(anglerState({ pos, lure, lureStage: LureStage.water })).toBe(
      'Virveli · vedessä · 9,1 m',
    );
    expect(anglerState({ pos, lure, lureStage: LureStage.flight, fly: true })).toBe(
      'Perho · heitto',
    );
    expect(anglerState({ pos, lure: null, lureStage: LureStage.none })).toBe(
      'Virveli · siima sisällä',
    );
    expect(anglerState({ pos, lure, lureStage: LureStage.hooked }, true)).toBe(
      'Virveli · kala pinnassa · 9,1 m',
    );
  });
});
