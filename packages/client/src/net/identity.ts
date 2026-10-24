import { sanitizeName } from '@lunki/shared';

const NAME_KEY = 'lunki.name';
const ID_KEY = 'lunki.playerId';

export interface Identity {
  name: string;
  /** Satunnainen tunniste, joka pysyy selaimen muistissa. Ei kirjautumista. */
  playerId: string;
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Yksityinen ikkuna tms.: tunniste elää vain tämän käynnin ajan.
  }
}

let fallbackId: string | null = null;

export function loadIdentity(): Identity {
  let playerId = read(ID_KEY) ?? fallbackId;
  if (!playerId) {
    playerId = crypto.randomUUID();
    fallbackId = playerId;
    write(ID_KEY, playerId);
  }
  const name = read(NAME_KEY);
  return { name: name ? sanitizeName(name) : '', playerId };
}

export function saveName(name: string): string {
  const clean = sanitizeName(name);
  write(NAME_KEY, clean);
  return clean;
}
