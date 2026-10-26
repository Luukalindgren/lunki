import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE, type RecordEntry } from '@lunki/shared';
import {
  SCENE_HEIGHT,
  SCENE_WIDTH,
  anglerScene,
  formatCardDate,
  recordCard,
  sceneFishWidth,
  weighCardText,
  type WeighCardInfo,
} from './weighCard';

const look = { tube: 0xd23a2a, fins: 0x0b0f14, shirt: 0x2f9e8f, line: 0xf6d04d };

describe('punnituskortti', () => {
  it('kala on samassa mittakaavassa kuin kalastaja', () => {
    // Iso hauki on moninkertainen pieneen ahveneen verrattuna.
    expect(sceneFishWidth('pike', 8)).toBeGreaterThan(sceneFishWidth('perch', 0.1) * 4);
    // Ennätyshaukikin mahtuu kuvaan.
    expect(sceneFishWidth('pike', 12)).toBeLessThan(SCENE_WIDTH);
  });

  it('kuva on täysin peitetty ja rengas on kalastajan värinen', () => {
    for (const time of ['morning', 'day', 'evening', 'night'] as const) {
      const scene = anglerScene('pike', 2, look, time);
      expect(scene.width).toBe(SCENE_WIDTH);
      expect(scene.height).toBe(SCENE_HEIGHT);
      expect(scene.data.every((c) => c >= 0)).toBe(true);
      expect(scene.data).toContain(look.tube);
      expect(scene.data).toContain(look.shirt);
    }
    // Yö ja päivä näyttävät eri väreiltä.
    const day = anglerScene('perch', 0.2, look, 'day').data[0];
    const night = anglerScene('perch', 0.2, look, 'night').data[0];
    expect(day).not.toBe(night);
  });

  it('jaettava teksti kertoo lajin, painon ja pituuden', () => {
    const info: WeighCardInfo = {
      fish: { species: 'pike', name: 'Hauki', weight: 3.1, time: 200 },
      angler: 'Luuka',
      appearance: look,
      timeOfDay: 'day',
      spot: null,
      date: new Date(2026, 9, 25),
    };
    const text = weighCardText(info, 'https://example.com/lunki/');
    expect(text).toContain('Luuka');
    expect(text).toContain('hauki 3,10 kg');
    expect(text).toMatch(/\(\d+ cm\)/);
    expect(text).toContain('https://example.com/lunki/');
    expect(formatCardDate(info.date)).toBe('25.10.2026');
  });
});

describe('punnituskortti ennätysrivistä (#238)', () => {
  const old: RecordEntry = {
    species: 'pike',
    weight: 4.2,
    angler: 'Luuka',
    difficulty: 'normal',
    date: '2026-10-24',
  };

  it('vanhassa ennätyksessä oletusulkonäkö, päivä ja ei kisa-aikaa', () => {
    const card = recordCard(old, null);
    expect(card.appearance).toEqual(DEFAULT_APPEARANCE);
    expect(card.timeOfDay).toBe('day');
    expect(Number.isFinite(card.fish.time)).toBe(false);
    expect(card.date.getUTCDate()).toBe(24);
    expect(card.fish.at).toBeUndefined();
  });

  it('uudessa ennätyksessä kalastajan oma ulkonäkö, aika ja paikka', () => {
    const card = recordCard(
      {
        ...old,
        appearance: look,
        timeOfDay: 'evening',
        raceTime: 312,
        x: 10,
        y: -4,
        at: '2026-10-26T17:40:00.000Z',
      },
      'Syvyys 2,1 m',
    );
    expect(card.appearance).toEqual(look);
    expect(card.timeOfDay).toBe('evening');
    expect(card.fish.time).toBe(312);
    expect(card.fish.at).toEqual({ x: 10, y: -4 });
    expect(card.spot).toBe('Syvyys 2,1 m');
    expect(card.date.toISOString()).toBe('2026-10-26T17:40:00.000Z');
  });
});
