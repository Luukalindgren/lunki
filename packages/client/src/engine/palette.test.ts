import { describe, expect, it } from 'vitest';
import { GEAR_COLORS, LINE_COLORS, randomAppearance } from '@lunki/shared';
import { PALETTE, PALETTE_HEX, SHADE_RAMPS, hexToRgb, nearestPaletteColor } from './palette';

describe('paletti', () => {
  it('on shaderin taulukon kokoinen', () => {
    expect(PALETTE_HEX.length).toBe(36);
  });

  it('pelaajan väreillä on varjostus paletin sävyistä', () => {
    const palette: readonly number[] = PALETTE_HEX;
    for (const c of GEAR_COLORS) {
      const ramp = SHADE_RAMPS[c.hex];
      expect(ramp?.[0]).toBe(c.hex);
      for (const shade of ramp!) expect(palette).toContain(shade);
      // Varjopuoli on tummempi kuin valaistu pinta.
      const luma = (hex: number) => {
        const [r, g, b] = hexToRgb(hex);
        return r * 0.299 + g * 0.587 + b * 0.114;
      };
      if (c.hex !== 0x1c232b) expect(luma(ramp![1])).toBeLessThan(luma(ramp![0]));
      expect(luma(ramp![2])).toBeLessThanOrEqual(luma(ramp![1]));
    }
  });

  it('muuntaa hex-värin', () => {
    expect(hexToRgb(0xff8000)).toEqual([1, 128 / 255, 0]);
  });

  it('palauttaa palettivärin sellaisenaan', () => {
    for (const c of PALETTE) expect(nearestPaletteColor(c)).toBe(c);
  });

  it('kvantisoi lähimpään', () => {
    expect(nearestPaletteColor([0, 0, 0])).toEqual(hexToRgb(0x0b0f14));
    expect(nearestPaletteColor([1, 1, 1])).toEqual(hexToRgb(0xeef2f3));
  });

  it('pelaajan värit ovat paletista', () => {
    const palette: readonly number[] = PALETTE_HEX;
    for (const c of [...GEAR_COLORS, ...LINE_COLORS]) expect(palette).toContain(c.hex);
    expect(palette).toContain(randomAppearance().tube);
  });
});
