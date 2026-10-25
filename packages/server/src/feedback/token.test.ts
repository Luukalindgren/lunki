import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TOKEN_FILE, authorized, loadFeedbackToken } from './token';

describe('palauteavain', () => {
  it('luodaan tietokannan viereen ja luetaan samana uudelleen', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lunki-'));
    const db = join(dir, 'lunki.sqlite');
    const token = loadFeedbackToken(db, {});
    expect(token).toMatch(/^[\w-]{43}$/);
    expect(readFileSync(join(dir, TOKEN_FILE), 'utf8').trim()).toBe(token);
    expect(loadFeedbackToken(db, {})).toBe(token);
  });

  it('ympäristömuuttuja voittaa, muistikannalla ei avainta', () => {
    expect(loadFeedbackToken(':memory:', { LUNKI_FEEDBACK_TOKEN: ' abc ' })).toBe('abc');
    expect(loadFeedbackToken(':memory:', {})).toBeNull();
  });

  it('vain oikea Bearer-avain kelpaa', () => {
    expect(authorized('Bearer abc', 'abc')).toBe(true);
    expect(authorized('Bearer abd', 'abc')).toBe(false);
    expect(authorized('abc', 'abc')).toBe(false);
    expect(authorized(null, 'abc')).toBe(false);
    expect(authorized('Bearer ', null)).toBe(false);
  });
});
