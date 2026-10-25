import { describe, expect, it } from 'vitest';
import { CHAT_MAX_LENGTH, CHAT_RATE, ChatLimiter, sanitizeChat } from './chat';

describe('sanitizeChat', () => {
  it('siistii välilyönnit ja ohjausmerkit', () => {
    expect(sanitizeChat('  moi\n\tkaikki  ')).toBe('moi kaikki');
    expect(sanitizeChat('a\u0000b\u007fc')).toBe('a b c');
  });

  it('tyhjä tai muu kuin teksti ei kelpaa', () => {
    expect(sanitizeChat('   ')).toBeNull();
    expect(sanitizeChat('')).toBeNull();
    expect(sanitizeChat(42)).toBeNull();
    expect(sanitizeChat(undefined)).toBeNull();
  });

  it('pitkä viesti katkaistaan', () => {
    const s = sanitizeChat('ä'.repeat(500))!;
    expect([...s]).toHaveLength(CHAT_MAX_LENGTH);
    expect([...sanitizeChat('🐟'.repeat(200))!]).toHaveLength(CHAT_MAX_LENGTH);
  });
});

describe('ChatLimiter', () => {
  it('sallii purskeen ja sitten viestin aina täyttymisen jälkeen', () => {
    const l = new ChatLimiter();
    for (let i = 0; i < CHAT_RATE.burst; i++) expect(l.take(1000)).toBe(true);
    expect(l.take(1000)).toBe(false);
    expect(l.take(1000 + CHAT_RATE.refillMs / 2)).toBe(false);
    expect(l.take(1000 + CHAT_RATE.refillMs)).toBe(true);
    expect(l.take(1000 + CHAT_RATE.refillMs)).toBe(false);
  });

  it('pitkän tauon jälkeen pursketta ei voi kerätä yli rajan', () => {
    const l = new ChatLimiter();
    l.take(0);
    let ok = 0;
    for (let i = 0; i < 10; i++) if (l.take(10 * 60_000)) ok++;
    expect(ok).toBe(CHAT_RATE.burst);
  });
});
