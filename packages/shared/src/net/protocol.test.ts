import { describe, expect, it } from 'vitest';
import { formatRoomCode, parseRoomCode, randomRoomCode, sanitizeName } from './protocol';

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
  });
});
