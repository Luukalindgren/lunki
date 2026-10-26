import { describe, expect, it } from 'vitest';
import { FLY } from '@lunki/shared';
import { FlyStrip, ROD_LIFT_FLICK, STRIP_PER_SCREEN } from './flyStrip';

const DT = 1 / 60;
const H = 800;

/** Vetää siimaa, kunnes kertynyt veto on käytetty (enintään `max` askelta). */
function drain(s: FlyStrip, y: number, max = 600): number {
  let total = 0;
  for (let i = 0; i < max; i++) total += s.read(true, y, H, DT).strip;
  return total;
}

describe('perhon vedot hiirellä', () => {
  it('ensimmäinen painallus ei vedä, liike alas vetää ruudun osuuden verran', () => {
    const s = new FlyStrip();
    expect(s.read(true, 100, H, DT).strip).toBe(0);
    // Hidas veto: neljännes ruudusta sekunnissa.
    let total = 0;
    for (let i = 1; i <= 60; i++) total += s.read(true, 100 + (i * H) / 4 / 60, H, DT).strip;
    expect(total).toBeCloseTo(STRIP_PER_SCREEN / 4, 5);
  });

  it('nopea pyyhkäisy ei hukkaa siimaa: ylitys vedetään seuraavilla askelilla', () => {
    const s = new FlyStrip();
    s.read(true, 0, H, DT);
    // Viidesosa ruudusta yhdessä askeleessa (kosketuslevyn nopea pyyhkäisy).
    const first = s.read(true, H / 5, H, DT).strip;
    expect(first).toBeCloseTo(FLY.maxStripSpeed * DT);
    const total = first + drain(s, H / 5);
    expect(total).toBeCloseTo(STRIP_PER_SCREEN / 5, 5);
  });

  it('pitkä riuhtaisu vetää enintään sekunnin verran siimaa', () => {
    const s = new FlyStrip();
    s.read(true, 0, H, DT);
    s.read(true, H * 3, H, DT);
    expect(drain(s, H * 3)).toBeLessThanOrEqual(FLY.maxStripSpeed + 1e-9);
  });

  it('käden irrotus lopettaa vedon ja hiiren siirto ilman nappia ei vedä', () => {
    const s = new FlyStrip();
    s.read(true, 0, H, DT);
    s.read(true, H / 2, H, DT);
    expect(s.read(false, H / 2, H, DT).strip).toBe(0);
    expect(s.read(false, H, H, DT).strip).toBe(0);
    expect(s.read(true, H, H, DT).strip).toBe(0);
  });

  it('nopea nosto ylös on vavan nosto, hidas nosto vain siirtää kättä', () => {
    const s = new FlyStrip();
    s.read(true, 400, H, DT);
    expect(s.read(true, 399, H, DT)).toEqual({ strip: 0, rodLift: false });
    expect(s.read(true, 399 - H * ROD_LIFT_FLICK * 2, H, DT).rodLift).toBe(true);
  });

  it('nollaus unohtaa edellisen sijainnin', () => {
    const s = new FlyStrip();
    s.read(true, 0, H, DT);
    s.reset();
    expect(s.read(true, H, H, DT).strip).toBe(0);
  });
});
