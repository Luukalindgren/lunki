import { describe, expect, it } from 'vitest';
import { DEFAULT_PAD_SETTINGS, parsePadSettings, ReelLatch, TurnPulse } from './padSettings';

describe('peliohjaimen asetukset (#594)', () => {
  it('tuntematon tai rikkinäinen tallenne palaa oletuksiin', () => {
    expect(parsePadSettings(null)).toEqual(DEFAULT_PAD_SETTINGS);
    expect(parsePadSettings({ turn: 7, flyInvert: 'x' })).toEqual(DEFAULT_PAD_SETTINGS);
    expect(parsePadSettings({ turn: 0.5, flyInvert: true, reelToggle: true })).toEqual({
      turn: 0.5,
      flyInvert: true,
      reelToggle: true,
    });
  });

  it('herkkyys päästää käännöksestä läpi asetetun osuuden askelista', () => {
    const pulse = new TurnPulse();
    const steps = Array.from({ length: 100 }, () => pulse.step(1, 0.6));
    expect(steps.filter((t) => t === 1)).toHaveLength(60);
    // Tasaisin välein: ei kolmea tyhjää askelta peräkkäin.
    expect(steps.join('')).not.toContain('000');
  });

  it('täysi herkkyys ja käännös vasemmalle kulkevat sellaisinaan', () => {
    const pulse = new TurnPulse();
    expect(Array.from({ length: 5 }, () => pulse.step(-1, 1))).toEqual([-1, -1, -1, -1, -1]);
    expect(pulse.step(0, 0.5)).toBe(0);
  });

  it('kelaus kytkimenä: painallus aloittaa ja toinen lopettaa', () => {
    const latch = new ReelLatch();
    expect(latch.step(true, true, true)).toBe(true);
    expect(latch.step(false, false, true)).toBe(true);
    expect(latch.step(true, true, true)).toBe(false);
  });

  it('kytkin nollautuu, kun viehe ei ole vedessä, ja pito toimii kuten ennen', () => {
    const latch = new ReelLatch();
    latch.step(true, true, true);
    expect(latch.step(false, false, false)).toBe(false);
    expect(latch.step(true, false, false)).toBe(true);
    expect(latch.step(false, false, true)).toBe(false);
  });
});
