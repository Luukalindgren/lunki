import { describe, expect, it } from 'vitest';
import {
  formatRoomCode,
  isSurfacedFish,
  isFloatDepthMessage,
  parseRoomCode,
  randomRoomCode,
  sanitizeName,
} from './protocol';
import { landingBy } from '../fishing/fishing';

describe('huonekoodi', () => {
  it('arpoo kelvollisen koodin', () => {
    for (let i = 0; i < 200; i++) {
      const c = randomRoomCode();
      expect(parseRoomCode(c)).toBe(c);
      expect(parseRoomCode(formatRoomCode(c))).toBe(c);
    }
  });

  it('tulkitsee eri kirjoitusasut ja linkin', () => {
    expect(parseRoomCode('lunki-4f7k')).toBe('4F7K');
    expect(parseRoomCode(' 4f 7k ')).toBe('4F7K');
    expect(parseRoomCode('https://luukalindgren.github.io/lunki/?huone=LUNKI-4F7K')).toBe('4F7K');
  });

  it('hylkää väärät', () => {
    expect(parseRoomCode('')).toBeNull();
    expect(parseRoomCode('LUNKI-4F7')).toBeNull();
    expect(parseRoomCode('O0I1')).toBeNull();
  });
});

describe('nimimerkki', () => {
  it('siistii ja lyhentää', () => {
    expect(sanitizeName('  Luuka   L ')).toBe('Luuka L');
    expect(sanitizeName('a'.repeat(40))).toHaveLength(16);
    expect(sanitizeName('\u0007')).toBe('Kalastaja');
    expect(sanitizeName(42)).toBe('Kalastaja');
    // Suunnanvaihto naamioisi nimen; ESC ja C1 ohjaisivat päätettä.
    expect(sanitizeName('Luuka\u202eakuuL')).toBe('LuukaakuuL');
    expect(sanitizeName('\u001b[31mA\u009bB')).toBe('[31mAB');
    expect(sanitizeName('x'.repeat(10_000_000))).toHaveLength(16);
  });
});

describe('muiden kohon syvyys (#822)', () => {
  it('hyväksyy vain sallitut syvyydet', () => {
    expect(isFloatDepthMessage({ a: 1.5, 'bot:1': 4 })).toBe(true);
    expect(isFloatDepthMessage({ a: 1.3 })).toBe(false);
    expect(isFloatDepthMessage({ a: 9 })).toBe(false);
    expect(isFloatDepthMessage({ a: '1.5' })).toBe(false);
    expect(isFloatDepthMessage([1.5])).toBe(false);
    expect(isFloatDepthMessage(null)).toBe(false);
  });
});

describe('pintaan noussut kala (#813)', () => {
  it('hyväksyy tunnetun lajin ja järkevän painon', () => {
    expect(isSurfacedFish({ species: 'perch', weight: 0.3 })).toBe(true);
    expect(isSurfacedFish({ species: 'perch', weight: 0 })).toBe(false);
    expect(isSurfacedFish({ species: 'perch', weight: Number.NaN })).toBe(false);
    expect(isSurfacedFish({ species: 'perch', weight: 1000 })).toBe(false);
    expect(isSurfacedFish({ species: 'nemo', weight: 1 })).toBe(false);
    expect(isSurfacedFish(null)).toBe(false);
  });

  it('nostotapa kasvaa kalan koon mukana', () => {
    expect(landingBy('perch', 0.05)).toBe('swing');
    expect(landingBy('pike', 8)).toBe('net');
  });
});
