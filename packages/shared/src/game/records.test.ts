import { describe, expect, it } from 'vitest';
import { SPECIES } from '../fishing/fish';
import { parseSoloRecord } from './records';

const now = new Date('2026-10-26T00:10:00Z');
const valid = {
  species: 'pike',
  weight: 2.4567,
  angler: '  Luuka  ',
  difficulty: 'normal',
  x: 12.34,
  y: -5.67,
  raceTime: 123.4,
  timeOfDay: 'evening',
  sky: 'rain',
  wind: 4.56,
  lure: 'spoon',
  rod: 'medium',
  line: 'medium',
  leader: true,
};

describe('yksinpelin saaliin tarkistus', () => {
  it('kelvollinen saalis siistitään merkinnäksi', () => {
    const e = parseSoloRecord(valid, now)!;
    expect(e).toMatchObject({
      species: 'pike',
      weight: 2.457,
      angler: 'Luuka',
      difficulty: 'normal',
      date: '2026-10-26',
      at: '2026-10-26T00:10:00.000Z',
      x: 12.3,
      y: -5.7,
      raceTime: 123,
      timeOfDay: 'evening',
      sky: 'rain',
      wind: 4.6,
      lure: 'spoon',
      rod: 'medium',
      line: 'medium',
      leader: true,
    });
  });

  it('väärä laji, vaikeus tai mahdoton paino hylätään', () => {
    expect(parseSoloRecord({ ...valid, species: 'whale' }, now)).toBeNull();
    expect(parseSoloRecord({ ...valid, difficulty: 'cheat' }, now)).toBeNull();
    expect(parseSoloRecord({ ...valid, weight: SPECIES.pike.maxWeight + 1 }, now)).toBeNull();
    expect(parseSoloRecord({ ...valid, weight: Number.NaN }, now)).toBeNull();
    expect(parseSoloRecord({ ...valid, weight: '2' }, now)).toBeNull();
    expect(parseSoloRecord(null, now)).toBeNull();
    expect(parseSoloRecord({ ...valid, species: 'toString' }, now)).toBeNull();
  });

  it('virheelliset lisätiedot jäävät pois', () => {
    const e = parseSoloRecord(
      { ...valid, x: 'a', lure: 'dynamite', sky: 1, leader: 'yes', angler: 42 },
      now,
    )!;
    expect(e.x).toBeUndefined();
    expect(e.y).toBeUndefined();
    expect(e.lure).toBeUndefined();
    expect(e.sky).toBeUndefined();
    expect(e.leader).toBeUndefined();
    expect(e.angler).toBe('Kalastaja');
  });
});
