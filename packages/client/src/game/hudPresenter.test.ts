import { describe, expect, it } from 'vitest';
import { DEFAULT_TACKLE, createFishing, type FishingState, type Tackle } from '@lunki/shared';
import { biteAction } from './hudPresenter';

const state = (method: Tackle['method'], s: Partial<FishingState> = {}): FishingState => ({
  ...createFishing(),
  stage: 'water',
  tackle: { ...DEFAULT_TACKLE, method },
  ...s,
});

describe('vieheluotaimen tärppiteksti', () => {
  it('kertoo toiminnon, joka tarttuttaa kalan', () => {
    expect(biteAction(state('spin'))).toBeUndefined();
    expect(biteAction(state('spin', { struckId: 1 }))).toBe('reel');
    expect(biteAction(state('spin', { struckId: 1, strikeBig: true }))).toBe('twitch');
    expect(biteAction(state('fly', { struckId: 1, onReel: false }))).toBe('strip');
    expect(biteAction(state('fly', { struckId: 1, onReel: true }))).toBe('reel');
  });

  it('ongella näykinnässä odotetaan ja viennissä nostetaan (#570)', () => {
    const nibble = { phase: 'nibble', left: 2, timer: 1 } as const;
    expect(biteAction(state('pole', { struckId: 1, bite: nibble }))).toBe('wait');
    expect(biteAction(state('pole', { struckId: 1, bite: { ...nibble, phase: 'run' } }))).toBe(
      'lift',
    );
  });
});
