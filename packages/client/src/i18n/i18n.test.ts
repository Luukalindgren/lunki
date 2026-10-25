import { afterEach, describe, expect, it } from 'vitest';
import {
  DIFFICULTY_NAMES,
  GEAR_COLORS,
  LATE_JOIN_OPTIONS,
  LINES,
  LURES,
  PENALTY_NAMES,
  RODS,
  SKY_NAMES,
  SPECIES,
  TIME_OF_DAY_NAMES,
  WARNING_TEXTS,
  WEATHER_LEVELS,
  WIN_RULE_NAMES,
  type Difficulty,
  type WeatherWarning,
  type WinRule,
  LINE_COLORS,
  LINE_IDS,
  LURE_IDS,
  PENALTY_IDS,
  ROD_IDS,
  SKIES,
  SPECIES_IDS,
  TIME_OF_DAY_IDS,
  WEATHER_LEVEL_IDS,
  mapCredits,
} from '@lunki/shared';
import { creditText } from '../ui/credits';
import { en } from './en';
import { fi } from './fi';
import {
  detectLang,
  formatClock,
  formatDay,
  formatWeight,
  ordinal,
  setLangForTest,
  t,
} from './index';
import {
  colorName,
  describeFullTackle,
  difficultyName,
  warningText,
  winRuleName,
  lineName,
  lureHint,
  lureName,
  penaltyName,
  rodHint,
  rodName,
  skyName,
  speciesName,
  timeOfDayName,
  weatherLevelName,
  lateJoinName,
} from './names';

const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('käännökset', () => {
  afterEach(() => setLangForTest('fi'));

  it('molemmissa kielissä on samat avaimet ja samat muuttujat', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(fi).sort());
    for (const key of Object.keys(fi) as (keyof typeof fi)[]) {
      expect(vars(en[key]), key).toEqual(vars(fi[key]));
      expect(en[key].trim(), key).not.toBe('');
    }
  });

  it('englanninkielinen teksti ei ole suomea', () => {
    // Paikannimet (Lunkinjärvi, Tammela, Syke) saavat jäädä.
    const finnish = /[äöÄÖ]/;
    const allowed = /Lunkinjärv|Järvi-meriwiki|Syke/g;
    for (const [key, text] of Object.entries(en))
      expect(finnish.test(text.replace(allowed, '')), `${key}: ${text}`).toBe(false);
  });

  it('kieli tallennetusta valinnasta tai selaimen kielestä', () => {
    expect(detectLang('en', 'fi-FI')).toBe('en');
    expect(detectLang('fi', 'en-US')).toBe('fi');
    expect(detectLang(null, 'fi-FI')).toBe('fi');
    expect(detectLang(null, 'FI')).toBe('fi');
    expect(detectLang(null, 'sv-FI')).toBe('en');
    expect(detectLang('de', undefined)).toBe('en');
  });

  it('muuttujat sijoitetaan tekstiin', () => {
    expect(t('lobby.players', { n: 2, max: 8 })).toBe('Pelaajat 2/8');
    setLangForTest('en');
    expect(t('lobby.players', { n: 2, max: 8 })).toBe('Players 2/8');
  });

  it('luvut, päivät ja järjestysluvut kielen mukaan', () => {
    expect(formatWeight(1.234)).toBe('1,23 kg');
    expect(formatWeight(0.52)).toBe('520 g');
    expect(ordinal(2)).toBe('2.');
    expect(formatDay(25, 10, 2026)).toBe('25.10.2026');
    expect(formatClock(19, 5)).toBe('klo 19.05');
    setLangForTest('en');
    expect(formatWeight(1.234)).toBe('1.23 kg');
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(ordinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '101st',
    ]);
    expect(formatDay(25, 10, 2026)).toBe('25 Oct 2026');
    expect(formatClock(19, 5)).toBe('19:05');
  });

  it('jaetun koodin nimet löytyvät molemmilla kielillä', () => {
    for (const lang of ['fi', 'en'] as const) {
      setLangForTest(lang);
      const names = [
        ...SPECIES_IDS.map(speciesName),
        ...LURE_IDS.flatMap((id) => [lureName(id), lureHint(id)]),
        ...ROD_IDS.flatMap((id) => [rodName(id), rodHint(id)]),
        ...LINE_IDS.map(lineName),
        ...SKIES.map(skyName),
        ...TIME_OF_DAY_IDS.map(timeOfDayName),
        ...WEATHER_LEVEL_IDS.map(weatherLevelName),
        ...PENALTY_IDS.map(penaltyName),
        ...LATE_JOIN_OPTIONS.map((o) => lateJoinName(o.value)),
      ];
      for (const name of names) expect(name).not.toMatch(/^\w+\.[\w.-]+$/);
      // Jokaisella värillä on käännös: ilman sitä näkyisi jaettu suomenkielinen nimi.
      for (const c of [...GEAR_COLORS, ...LINE_COLORS])
        expect(colorName(c.hex, '?'), c.name).not.toBe('?');
    }
    expect(speciesName('pike')).toBe('Pike');
    expect(describeFullTackle({ rod: 'heavy', lure: 'spoon', line: 'thin', leader: true })).toBe(
      'Heavy rod · Spoon · 0.20 mm · leader',
    );
  });

  it('suomeksi nimet ovat samat kuin jaetussa koodissa', () => {
    for (const c of [...GEAR_COLORS, ...LINE_COLORS]) expect(colorName(c.hex, '?')).toBe(c.name);
    for (const id of SPECIES_IDS) expect(speciesName(id)).toBe(SPECIES[id].name);
    for (const id of LURE_IDS) {
      expect(lureName(id)).toBe(LURES[id].name);
      expect(lureHint(id)).toBe(LURES[id].hint);
    }
    for (const id of ROD_IDS) {
      expect(rodName(id)).toBe(RODS[id].name);
      expect(rodHint(id)).toBe(RODS[id].hint);
    }
    for (const id of LINE_IDS) expect(lineName(id)).toBe(LINES[id].name);
    for (const id of SKIES) expect(skyName(id)).toBe(SKY_NAMES[id]);
    for (const id of TIME_OF_DAY_IDS) expect(timeOfDayName(id)).toBe(TIME_OF_DAY_NAMES[id]);
    for (const id of WEATHER_LEVEL_IDS) expect(weatherLevelName(id)).toBe(WEATHER_LEVELS[id].label);
    for (const id of PENALTY_IDS) expect(penaltyName(id)).toBe(PENALTY_NAMES[id]);
    for (const o of LATE_JOIN_OPTIONS) expect(lateJoinName(o.value)).toBe(o.label);
    for (const d of Object.keys(DIFFICULTY_NAMES) as Difficulty[])
      expect(difficultyName(d)).toBe(DIFFICULTY_NAMES[d]);
    for (const w of Object.keys(WIN_RULE_NAMES) as WinRule[])
      expect(winRuleName(w)).toBe(WIN_RULE_NAMES[w]);
    for (const w of Object.keys(WARNING_TEXTS) as WeatherWarning[])
      expect(warningText(w)).toBe(WARNING_TEXTS[w]);
  });

  it('kartta-aineistojen lähdemaininnat käännetään', () => {
    const credits = mapCredits();
    expect(credits.map(creditText)).toEqual(credits);
    setLangForTest('en');
    for (const c of credits) expect(creditText(c)).not.toBe(c);
    expect(creditText('Uusi lähde')).toBe('Uusi lähde');
  });
});
