import { describe, expect, it } from 'vitest';
import { AIR_SAMPLES, flightLine, hangLine, rodSideOffset, tautness } from './lineHang';

/** Suora siima pinnalla kärjestä 20 m itään. */
const straight = Array.from({ length: 24 }, (_, i) => ({ x: (i * 20) / 23, y: 0 }));

/** Kohta, jossa siima koskee pintaa (vaakaetäisyys kärjestä). */
const touchdown = (pts: ReturnType<typeof hangLine>) => pts[AIR_SAMPLES]!.x;

describe('siiman roikkuma', () => {
  it('alkaa vavan kärjestä ja laskeutuu pinnalle', () => {
    const pts = hangLine(straight, 1.2, 0, 0.04);
    expect(pts[0]).toEqual({ x: 0, y: 0, h: 1.2 });
    expect(pts[AIR_SAMPLES]!.h).toBeCloseTo(0.04);
    for (let i = 1; i < pts.length; i++) expect(pts[i]!.h).toBeLessThanOrEqual(pts[i - 1]!.h);
    expect(pts.at(-1)).toEqual({ x: 20, y: 0, h: 0.04 });
    expect(pts.length).toBeLessThanOrEqual(AIR_SAMPLES + straight.length);
  });

  it('ei putoa pystysuoraan kärjen alle', () => {
    const pts = hangLine(straight, 1.2, 0, 0.04);
    expect(touchdown(pts)).toBeGreaterThan(0.3);
  });

  it('kireä siima osuu veteen kauempana ja on suorempi', () => {
    const slack = hangLine(straight, 1.2, 0, 0.04);
    const taut = hangLine(straight, 1.2, 1, 0.04);
    expect(touchdown(taut)).toBeGreaterThan(touchdown(slack) * 3);
    // Löysä roikkuu: puolivälissä selvästi suoran viivan alapuolella.
    const mid = AIR_SAMPLES / 2;
    expect(slack[mid]!.h).toBeLessThan(0.04 + (1.2 - 0.04) * 0.35);
    expect(taut[mid]!.h).toBeGreaterThan(slack[mid]!.h);
  });

  it('seuraa pinnalla kaartuvaa siimaa', () => {
    const curved = Array.from({ length: 24 }, (_, i) => ({ x: i * 0.3, y: Math.sin(i * 0.5) }));
    const pts = hangLine(curved, 1.2, 0.3, 0.04);
    const surface = pts.slice(AIR_SAMPLES + 1);
    for (const p of surface) expect(curved).toContainEqual({ x: p.x, y: p.y });
  });

  it('lyhyt siima päättyy vieheeseen', () => {
    const pts = hangLine(
      [
        { x: 0, y: 0 },
        { x: 0.2, y: 0 },
      ],
      1.2,
      1,
      0.04,
    );
    expect(pts.at(-1)!.x).toBeCloseTo(0.2);
    expect(pts.at(-1)!.h).toBeCloseTo(0.04);
  });

  it('sivuun siirretty kärki palaa siiman linjaan ennen viehettä', () => {
    const pts = hangLine(straight, 1.2, 0, 0.04, { x: 0, y: -0.5 });
    expect(pts[0]!.y).toBeCloseTo(-0.5);
    expect(pts.at(-1)).toEqual({ x: 20, y: 0, h: 0.04 });
    for (const p of pts.filter((q) => q.x > 4)) expect(p.y).toBe(0);
  });

  it('jännitys kireydeksi', () => {
    expect(tautness(0)).toBe(0);
    expect(tautness(0.15)).toBeCloseTo(0.5);
    expect(tautness(5)).toBe(1);
  });
});

it('vavan kärki on oikealla puolella', () => {
  // Itään katsottaessa oikea puoli on etelä (y < 0).
  const o = rodSideOffset(0);
  expect(o.x).toBeCloseTo(0);
  expect(o.y).toBeLessThan(0);
});

describe('siima heiton aikana', () => {
  it('kulkee kärjestä vieheeseen notkolla', () => {
    const pts = flightLine({ x: 0, y: 0, h: 1.2 }, { x: 10, y: 0, h: 3 }, 11, 0.04);
    expect(pts[0]!.h).toBeCloseTo(1.2);
    expect(pts[10]!.h).toBeCloseTo(3);
    expect(pts[5]!.h).toBeLessThan((1.2 + 3) / 2);
    expect(pts[5]!.x).toBeCloseTo(5);
  });

  it('ei painu veden alle', () => {
    const pts = flightLine({ x: 0, y: 0, h: 0.3 }, { x: 40, y: 0, h: 0.3 }, 11, 0.04);
    for (const p of pts) expect(p.h).toBeGreaterThanOrEqual(0.04);
  });
});
