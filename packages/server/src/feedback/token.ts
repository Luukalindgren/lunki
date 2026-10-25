import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Avaintiedoston nimi tietokannan vieressä (pelikoneella packages\server\data). */
export const TOKEN_FILE = 'palauteavain.txt';

/**
 * Avain, jolla GitHub Actions hakee palautteet issueiksi (ks.
 * docs/windows-palvelin.md). LUNKI_FEEDBACK_TOKEN voittaa; muuten avain luetaan
 * tietokannan viereisestä tiedostosta, joka luodaan ensimmäisellä
 * käynnistyksellä. Muistitietokannalla ilman muuttujaa ei avainta (rajapinta pois).
 */
export function loadFeedbackToken(dbPath: string, env = process.env): string | null {
  const fromEnv = env.LUNKI_FEEDBACK_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  if (dbPath === ':memory:') return null;
  const file = join(dirname(dbPath), TOKEN_FILE);
  if (existsSync(file)) {
    const saved = readFileSync(file, 'utf8').trim();
    if (saved) return saved;
  }
  const token = randomBytes(32).toString('base64url');
  writeFileSync(file, `${token}\n`, { mode: 0o600 });
  return token;
}

const digest = (s: string) => createHash('sha256').update(s).digest();

/** Vertaa `Authorization: Bearer …` -otsaketta avaimeen vakioajassa. */
export function authorized(header: string | null, token: string | null): boolean {
  if (!token || !header?.startsWith('Bearer ')) return false;
  return timingSafeEqual(digest(header.slice(7).trim()), digest(token));
}
