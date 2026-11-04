import { afterEach, describe, expect, it } from 'vitest';
import type { InflateState } from '@lunki/shared';
import { setLangForTest } from '../i18n';
import { setControlMode } from './controls';
import { inflateHint } from './craftController';

const pumping: InflateState = {
  fill: [0.4, 0, 0],
  valve: 0,
  moving: null,
  handle: 1,
  arrow: -1,
  seed: 1,
} as InflateState;

describe('täyttökisan tilanneohje (#487, #495)', () => {
  afterEach(() => {
    setControlMode('keys');
    setLangForTest('fi');
  });

  it('näppäimillä ohje kertoo napin ja osan ilman prosentteja', () => {
    setLangForTest('fi');
    setControlMode('keys');
    expect(inflateHint(pumping)).toBe('Pumppaa välilyönti: vasen puolisko');
  });

  it('kosketuksella napin nimeä ei toisteta ("Pumppaa PUMPPAA")', () => {
    setLangForTest('fi');
    setControlMode('touch');
    expect(inflateHint(pumping)).toBe('Pumppaa: vasen puolisko');
    setLangForTest('en');
    expect(inflateHint(pumping)).toBe('Pump: left half');
  });
});
