import { afterEach, describe, expect, it } from 'vitest';
import type { RecordEntry } from '@lunki/shared';
import { setLangForTest } from '../i18n';
import { formatDate, recordDetails, recordTitle } from './recordDetails';

const old: RecordEntry = {
  species: 'perch',
  weight: 0.52,
  angler: 'Luuka',
  difficulty: 'normal',
  date: '2026-10-20',
};

describe('ennätyskalan tiedot', () => {
  afterEach(() => setLangForTest('fi'));

  it('vanhasta saaliista näytetään se, mikä on tallessa', () => {
    expect(recordTitle(old)).toBe('Ahven 520 g');
    expect(recordDetails(old)).toEqual([
      ['Kalastaja', 'Luuka'],
      ['Saatu', '20.10.2026'],
      ['Paikka', 'Ei tallessa: saalis on ajalta ennen paikkojen tallennusta'],
    ]);
  });

  it('uudesta saaliista aika, sää, viehe, varusteet ja paikka', () => {
    const at = new Date(2026, 9, 25, 19, 5);
    const r: RecordEntry = {
      ...old,
      species: 'pike',
      weight: 3.2,
      date: '2026-10-25',
      at: at.toISOString(),
      x: 10,
      y: 20,
      raceTime: 312,
      timeOfDay: 'evening',
      sky: 'rain',
      wind: 5.3,
      lure: 'wobbler',
      rod: 'heavy',
      line: 'thick',
      leader: true,
    };
    expect(recordTitle(r)).toBe('Hauki 3,20 kg');
    expect(recordDetails(r, 'Syvyys 3,2 m')).toEqual([
      ['Kalastaja', 'Luuka'],
      ['Saatu', '25.10.2026 klo 19.05'],
      ['Kisa', 'Ilta, 5:12 kisan alusta'],
      ['Sää', 'Sade, tuuli 5,3 m/s'],
      ['Viehe', 'Vaappu'],
      ['Varusteet', 'Järeä vapa, siima 0,30 mm, teräsperuke'],
      ['Paikka', 'Syvyys 3,2 m'],
    ]);
  });

  it('perhosaaliista tapa, perho ja perhovälineet (#233)', () => {
    const r: RecordEntry = {
      ...old,
      species: 'pike',
      method: 'fly',
      fly: 'pikeStreamer',
      flyRod: 'fly10',
      flyLine: 'intermediate',
      flyLeader: 'steel',
    };
    expect(recordDetails(r)).toEqual([
      ['Kalastaja', 'Luuka'],
      ['Saatu', '20.10.2026'],
      ['Tapa', 'Perho'],
      ['Perho', 'Hauki-streameri'],
      ['Varusteet', 'Perhovapa #10, siima Intermediate, peruke teräs'],
      ['Paikka', 'Ei tallessa: saalis on ajalta ennen paikkojen tallennusta'],
    ]);
  });

  it('päivämäärä suomalaisittain', () => {
    expect(formatDate('2026-01-05')).toBe('5.1.2026');
  });

  it('englanniksi samat tiedot englanninkielisinä', () => {
    setLangForTest('en');
    const r: RecordEntry = {
      ...old,
      species: 'pike',
      weight: 3.2,
      x: 1,
      y: 2,
      timeOfDay: 'evening',
      sky: 'rain',
      wind: 5.3,
      lure: 'wobbler',
      line: 'thick',
    };
    expect(recordTitle(r)).toBe('Pike 3.20 kg');
    expect(recordDetails(r, 'Depth 3.2 m')).toEqual([
      ['Angler', 'Luuka'],
      ['Caught', '20 Oct 2026'],
      ['Race', 'Evening'],
      ['Weather', 'Rain, wind 5.3 m/s'],
      ['Lure', 'Crankbait'],
      ['Tackle', 'line 0.30 mm'],
      ['Spot', 'Depth 3.2 m'],
    ]);
  });

  it('tuntematon tallennettu arvo näytetään sellaisenaan', () => {
    expect(recordDetails({ ...old, lure: 'dynamite' as never })[2]).toEqual(['Viehe', 'dynamite']);
  });
});
