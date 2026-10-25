import { JoinRefusal } from '@lunki/shared';
import { describe, expect, it } from 'vitest';
import { MAX_ROOMS, releaseCode, reserveCode } from './codes';

describe('huonekoodit', () => {
  it('huoneita ei voi luoda rajattomasti', () => {
    const codes = Array.from({ length: MAX_ROOMS }, () => reserveCode());
    expect(new Set(codes).size).toBe(MAX_ROOMS);
    expect(() => reserveCode()).toThrow(JoinRefusal.serverFull);
    releaseCode(codes[0]!);
    codes[0] = reserveCode();
    codes.forEach(releaseCode);
  });
});
