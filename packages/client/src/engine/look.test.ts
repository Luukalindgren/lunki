import { describe, expect, it } from 'vitest';
import {
  LookGuard,
  QUALITIES,
  QUALITY,
  SUPERSAMPLE_MAX_PIXELS,
  lookDetail,
  lowerQuality,
  smoothLook,
} from './look';

/** Ajaa vahtia tasaisella ruutunopeudella; palauttaa, vaatiko se paluuta Retroon. */
function run(guard: LookGuard, fps: number, seconds: number): boolean {
  let fell = false;
  for (let i = 0; i < fps * seconds; i++) fell = guard.frame(1 / fps) || fell;
  return fell;
}

describe('LookGuard', () => {
  it('ei vaihda ilmettä, kun ruutunopeus riittää', () => {
    expect(run(new LookGuard(), 60, 30)).toBe(false);
    expect(run(new LookGuard(), 33, 30)).toBe(false);
  });

  it('palauttaa Retroon, kun ruutunopeus jää alle 30', () => {
    expect(run(new LookGuard(), 20, 10)).toBe(true);
  });

  it('ei laske kisan alun hitaita ruutuja', () => {
    const guard = new LookGuard();
    expect(run(guard, 10, 2.5)).toBe(false);
    expect(run(guard, 60, 20)).toBe(false);
  });

  it('pitkä tauko ei ole hidas ruutu', () => {
    const guard = new LookGuard();
    run(guard, 60, 5);
    expect(guard.frame(5)).toBe(false);
    expect(run(guard, 60, 10)).toBe(false);
  });

  it('palauttaa Retroon, kun joka ruutu kestää yli puoli sekuntia', () => {
    const guard = new LookGuard();
    let fell = false;
    for (let i = 0; i < 12; i++) fell = guard.frame(0.8) || fell;
    expect(fell).toBe(true);
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

  it('laatu kevenee askel kerrallaan matalaan asti', () => {
    expect(lowerQuality('high')).toBe('medium');
    expect(lowerQuality('medium')).toBe('low');
    expect(lowerQuality('low')).toBeNull();
  });
});
