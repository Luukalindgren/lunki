import { describe, expect, it } from 'vitest';
import {
  QUALITIES,
  QUALITY,
  SUPERSAMPLE_MAX_PIXELS,
  defaultLook,
  lookDetail,
  smoothLook,
} from './look';

describe('defaultLook', () => {
  it('on Terävä, kun ilmettä ei ole valittu', () => {
    expect(defaultLook(false)).toBe('sharp');
  });

  it('on Retro automaation ohjaamassa selaimessa', () => {
    expect(defaultLook(true)).toBe('retro');
  });
});

describe('piirron tarkkuus (#650)', () => {
  const hd = { width: 480, height: 270, scale: 4 };

  it('Retro piirtää sisäisellä tarkkuudella ja Terävä näytön tarkkuudella', () => {
    for (const q of QUALITIES) {
      expect(lookDetail('retro', q, hd)).toBe(1);
      expect(lookDetail('sharp', q, hd)).toBe(4);
    }
  });

  it('Moderni piirtää korkealla laadulla näyttöä tarkemmin', () => {
    expect(lookDetail('modern', 'low', hd)).toBe(4);
    expect(lookDetail('modern', 'medium', hd)).toBe(4);
    expect(lookDetail('modern', 'high', hd)).toBe(4 * QUALITY.high.supersample);
  });

  it('ei ylitä pikselikattoa isolla näytöllä eikä alita näytön tarkkuutta', () => {
    const uhd = { width: 480, height: 270, scale: 8 };
    const detail = lookDetail('modern', 'high', uhd);
    expect(detail).toBeGreaterThanOrEqual(uhd.scale);
    expect(detail).toBeLessThan(uhd.scale * QUALITY.high.supersample);
    // Katto ei koske näytön omaa tarkkuutta: sen alle ei mennä.
    if (detail > uhd.scale)
      expect(uhd.width * uhd.height * detail * detail).toBeLessThanOrEqual(SUPERSAMPLE_MAX_PIXELS);
  });

  it('vain Retro käyttää palettia ja pikselikuvia', () => {
    expect(smoothLook('retro')).toBe(false);
    expect(smoothLook('sharp')).toBe(true);
    expect(smoothLook('modern')).toBe(true);
  });

  it('parempi laatu piirtää maiseman tarkat mallit kauemmas', () => {
    expect(QUALITY.low.detailRange).toBeLessThan(QUALITY.medium.detailRange);
    expect(QUALITY.medium.detailRange).toBeLessThan(QUALITY.high.detailRange);
  });
});
