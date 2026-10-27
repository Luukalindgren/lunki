import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_POV_FOV,
  MAX_HORIZONTAL_FOV,
  MIN_HORIZONTAL_FOV,
  POV_FOVS,
  effectivePovFov,
  horizontalFov,
  loadPovFov,
  savePovFov,
} from './povFov';

describe('POV-näkökentän asetus (#330)', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('portaat ovat kasvavia ja oletus on nykyinen 72°', () => {
    expect([...POV_FOVS].sort((a, b) => a - b)).toEqual(POV_FOVS);
    expect(DEFAULT_POV_FOV).toBe(72);
    expect(POV_FOVS).toContain(DEFAULT_POV_FOV);
  });

  it('tallentuu ja latautuu', () => {
    expect(loadPovFov()).toBe(DEFAULT_POV_FOV);
    savePovFov(85);
    expect(loadPovFov()).toBe(85);
  });

  it('virheellinen arvo palaa oletukseen', () => {
    for (const bad of ['7', 'abc', '', '73']) {
      localStorage.setItem('lunki.povFov', bad);
      expect(loadPovFov()).toBe(DEFAULT_POV_FOV);
    }
  });

  it('selain ilman tallennusta käyttää oletusta', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('estetty');
      },
    });
    expect(loadPovFov()).toBe(DEFAULT_POV_FOV);
  });
});

describe('tehollinen näkökenttä kuvasuhteen mukaan', () => {
  it('16:9-ruudulla kaikki portaat pätevät sellaisenaan', () => {
    for (const fov of POV_FOVS) expect(effectivePovFov(fov, 16 / 9)).toBe(fov);
    expect(horizontalFov(72, 16 / 9)).toBeCloseTo(104.6, 0);
  });

  it('pystypuhelimella kuvaa levennetään vähimmäisvaakaan', () => {
    const aspect = 9 / 19.5;
    const fov = effectivePovFov(72, aspect);
    expect(fov).toBeGreaterThan(90);
    expect(fov).toBeLessThanOrEqual(100);
    expect(horizontalFov(fov, aspect)).toBeCloseTo(MIN_HORIZONTAL_FOV, 5);
  });

  it('erittäin kapealla ruudulla pysty-FOV ei ylitä 100°', () => {
    expect(effectivePovFov(72, 0.2)).toBe(100);
  });

  it('ultrawidella leveä valinta rajataan', () => {
    const aspect = 21 / 9;
    expect(effectivePovFov(72, aspect)).toBe(72);
    const fov = effectivePovFov(90, aspect);
    expect(fov).toBeLessThan(90);
    expect(horizontalFov(fov, aspect)).toBeCloseTo(MAX_HORIZONTAL_FOV, 5);
  });
});
