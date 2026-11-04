import { afterEach, describe, expect, it } from 'vitest';
import type { BoatLaunch, InflateState } from '@lunki/shared';
import { setLangForTest } from '../i18n';
import { setControlMode } from './controls';
import { inflateHint, launchBars, launchHint } from './craftController';

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

describe('veneen äyskäröinnin palkit (#494)', () => {
  it('keulan ja perän kuiva osuus, työn alla oleva osa korostettuna', () => {
    setLangForTest('fi');
    const launch: BoatLaunch = { water: [0, 30], full: 40, stage: 0, seed: 1 };
    const bars = launchBars(launch, { part: 1, moving: null, handle: 0.5, arrow: -1, stage: 0 });
    expect(bars).toEqual([
      { label: 'Keula', pct: 100, state: 'full' },
      { label: 'Perä', pct: 25, state: 'active' },
    ]);
    expect(launchHint(launch, { part: 1, moving: null, handle: 1, arrow: -1, stage: 0 })).toBe(
      'Äyskäröi välilyönti: perä',
    );
  });

  it('täysi vene on 0 %, vajaa ei pyöristy valmiiksi, ja työnnössä palkit piiloon', () => {
    const b = { part: 0, moving: null, handle: 1, arrow: -1, stage: 0 };
    const bars = launchBars({ water: [40, 0.01], full: 40, stage: 0, seed: 1 }, b)!;
    expect(bars.map((x) => [x.pct, x.state])).toEqual([
      [0, 'ready'],
      [99, 'todo'],
    ]);
    expect(launchBars({ water: [0, 0], full: 40, stage: 1, seed: 1 }, b)).toBeNull();
  });
});
