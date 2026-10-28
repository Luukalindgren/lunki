import { describe, expect, it } from 'vitest';
import { SPECIES } from '../fishing/fish';
import { DEFAULT_APPEARANCE } from '../net/appearance';
import { DEFAULT_TACKLE } from '../fishing/gear';
import { parseSoloRecord, recordTackle } from './records';

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

  it('myöhässä lähetetty saalis pitää saantihetkensä, jos se on uskottava', () => {
    const at = '2026-10-20T18:30:00.000Z';
    expect(parseSoloRecord({ ...valid, at }, now)).toMatchObject({ date: '2026-10-20', at });
    // Tulevaisuudessa, liian vanha tai roskaa: palvelimen aika.
    for (const bad of ['2026-10-27T00:00:00Z', '2026-01-01T00:00:00Z', 'eilen', 42])
      expect(parseSoloRecord({ ...valid, at: bad }, now)?.at).toBe('2026-10-26T00:10:00.000Z');
    // Selaimen kello hieman edellä: ei tulevaisuuteen.
    expect(parseSoloRecord({ ...valid, at: '2026-10-26T00:12:00Z' }, now)?.at).toBe(
      '2026-10-26T00:10:00.000Z',
    );
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

  it('perhosaaliiseen tallentuvat perhovälineet, virvelin tiedot jäävät pois (#233)', () => {
    const e = parseSoloRecord(
      {
        ...valid,
        ...recordTackle({ ...DEFAULT_TACKLE, method: 'fly', fly: 'popper' }),
        lure: 'spoon',
      },
      now,
    )!;
    expect(e.method).toBe('fly');
    expect(e.fly).toBe('popper');
    expect(e.flyRod).toBe('fly8');
    expect(e.flyLine).toBe('floating');
    expect(e.flyLeader).toBe('steel');
    expect(e.lure).toBeUndefined();
    expect(recordTackle(DEFAULT_TACKLE)).toEqual({
      method: 'spin',
      lure: 'spoon',
      rod: 'medium',
      line: 'medium',
      leader: false,
    });
    expect(parseSoloRecord({ ...valid, method: 'net', fly: 'popper' }, now)!.fly).toBeUndefined();
  });

  it('jigin paino ja vaapun syvyys tallentuvat vieheen säätönä (#363)', () => {
    const jig = recordTackle({ ...DEFAULT_TACKLE, lure: 'jig', jigWeight: 'g20' });
    expect(jig.lureVariant).toBe('g20');
    expect(parseSoloRecord({ ...valid, ...jig }, now)!.lureVariant).toBe('g20');
    const deep = recordTackle({ ...DEFAULT_TACKLE, lure: 'wobbler', crankDepth: 'deep' });
    expect(parseSoloRecord({ ...valid, ...deep }, now)!.lureVariant).toBe('deep');
    expect(parseSoloRecord({ ...valid, lure: 'jig', lureVariant: 'g99' }, now)!.lureVariant).toBe(
      undefined,
    );
  });

  it('ulkonäkö tallennetaan punnituskorttiin, tuntemattomat värit oletuksiksi', () => {
    const look = { ...DEFAULT_APPEARANCE, tube: 0xf6d04d };
    expect(parseSoloRecord({ ...valid, appearance: look }, now)!.appearance).toEqual(look);
    const odd = parseSoloRecord({ ...valid, appearance: { tube: 0x123456, shirt: 'red' } }, now)!;
    expect(odd.appearance).toEqual(DEFAULT_APPEARANCE);
    expect(parseSoloRecord({ ...valid, appearance: 'red' }, now)!.appearance).toBeUndefined();
    expect(parseSoloRecord(valid, now)!.appearance).toBeUndefined();
  });
});
