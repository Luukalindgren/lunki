import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_HUD_SCALE, HUD_SCALES, loadHudScale, saveHudScale } from './hudScale';

describe('HUDin koko', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('portaat ovat kasvavia ja oletus on niiden joukossa', () => {
    expect([...HUD_SCALES].sort((a, b) => a - b)).toEqual(HUD_SCALES);
    expect(HUD_SCALES).toContain(DEFAULT_HUD_SCALE);
  });

  it('tallentuu ja latautuu', () => {
    expect(loadHudScale()).toBe(DEFAULT_HUD_SCALE);
    saveHudScale(1.3);
    expect(loadHudScale()).toBe(1.3);
  });

  it('tuntematon arvo palaa oletukseen', () => {
    localStorage.setItem('lunki.hudScale', '7');
    expect(loadHudScale()).toBe(DEFAULT_HUD_SCALE);
  });
});
