import { describe, expect, it } from 'vitest';
import { PALETTE, PALETTE_HEX, hexToRgb, nearestPaletteColor } from './palette';

describe('paletti', () => {
  it('on shaderin taulukon kokoinen', () => {
    expect(PALETTE_HEX.length).toBe(32);
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
});
