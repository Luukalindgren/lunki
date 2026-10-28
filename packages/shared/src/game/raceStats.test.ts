import { describe, expect, it } from 'vitest';
import { SPECIES } from '../fishing/fish';
import { addRaceStats, emptyRaceStats, parseRaceStats, RaceStatsCounter } from './raceStats';

const isSpecies = (s: string) => s in SPECIES;
const tube = { x: 0, y: 0 };
const pike = { species: 'pike' as const, weight: 3.2 };

describe('kisan tilastot (#367)', () => {
  it('heitot lasketaan laskeutumisesta: pituus, pisin ja maalle heitot', () => {
    const c = new RaceStatsCounter();
    c.fishing({ cast: 0.8 }, tube, tube, null);
    c.fishing({ splash: { x: 30, y: 40 } }, tube, { x: 30, y: 40 }, null);
    c.fishing({ stuck: true }, tube, { x: 0, y: 12 }, null);
    expect(c.stats).toMatchObject({ casts: 2, longestCast: 50, castMeters: 62, landCasts: 1 });
  });

  it('karannut kala muistetaan, vaikka koukku on jo tyhjä', () => {
    const c = new RaceStatsCounter();
    c.fishing({ strike: true, hooked: true }, tube, tube, pike);
    c.fishing({}, tube, tube, pike);
    c.fishing({ escaped: true }, tube, tube, null);
    c.fishing({ hooked: true }, tube, tube, { species: 'perch', weight: 0.2 });
    c.fishing({ lineBroken: true }, tube, tube, null);
    expect(c.stats).toMatchObject({
      strikes: 1,
      hooked: 2,
      escaped: 1,
      lineBreaks: 1,
      luresLost: 1,
      biggestLost: pike,
    });
  });

  it('pohjaan jäänyt viehe ei ole karannut kala', () => {
    const c = new RaceStatsCounter();
    c.fishing({ snagged: true }, tube, tube, null);
    c.fishing({ lineBroken: true, lureLost: true }, tube, tube, null);
    c.fishing({ lineCut: true }, tube, tube, null);
    expect(c.stats).toMatchObject({ snags: 1, luresLost: 2, biggestLost: null });
  });

  it('matka ja paikallaanolo kerran sekunnissa, trombin lento ei ole matkaa', () => {
    const c = new RaceStatsCounter();
    c.move({ x: 0, y: 0 }, 0);
    c.move({ x: 0.5, y: 0 }, 0.5); // liian pian: ohitetaan
    c.move({ x: 2, y: 0 }, 1);
    c.move({ x: 2.1, y: 0 }, 2);
    c.move({ x: 400, y: 0 }, 3);
    expect(c.stats.distance).toBeCloseTo(2.1);
    expect(c.stats.idleSeconds).toBe(1);
  });

  it('salama: lähin etäisyys ja osumat', () => {
    const c = new RaceStatsCounter();
    expect(c.stats.closestLightning).toBeNull();
    c.lightning(300, false);
    c.lightning(120, false);
    expect(c.stats.closestLightning).toBe(120);
    c.lightning(0, true);
    expect(c.stats).toMatchObject({ lightningHits: 1, closestLightning: 0 });
  });

  it('yhteistilastot: laskurit summataan, ennätykset paremman mukaan', () => {
    const a = { ...emptyRaceStats(), casts: 3, longestCast: 40, closestLightning: 90 };
    const b = { ...emptyRaceStats(), casts: 2, longestCast: 25, biggestLost: pike };
    expect(addRaceStats(a, b)).toMatchObject({
      casts: 5,
      longestCast: 40,
      closestLightning: 90,
      biggestLost: pike,
    });
  });

  it('muualta tulleet tilastot siistitään', () => {
    const s = parseRaceStats(
      {
        casts: 4,
        strikes: -3,
        escaped: 'kolme',
        longestCast: 1e9,
        closestLightning: 'lähellä',
        biggestLost: { species: 'valas', weight: 1000 },
        extra: 1,
      },
      isSpecies,
    );
    expect(s).toEqual({ ...emptyRaceStats(), casts: 4, longestCast: 1000 });
    expect(parseRaceStats(null, isSpecies)).toEqual(emptyRaceStats());
    expect(parseRaceStats({ biggestLost: pike, closestLightning: 12 }, isSpecies)).toMatchObject({
      biggestLost: pike,
      closestLightning: 12,
    });
  });
});
