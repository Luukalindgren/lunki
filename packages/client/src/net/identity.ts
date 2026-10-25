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

/** crypto.randomUUID puuttuu suojaamattomalta http-sivulta (LAN-peli), getRandomValues ei. */
function randomId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

export function loadIdentity(): Identity {
  let playerId = read(ID_KEY) ?? fallbackId;
  if (!playerId) {
    playerId = randomId();
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

const LAST_ROOM_KEY = 'lunki.lastRoom';
/** Näin kauan (ms) päävalikko tarjoaa paluuta: pisin kisa ja reilusti varaa. */
const LAST_ROOM_TTL = 2 * 60 * 60 * 1000;

/**
 * Viimeisin moninpelihuone: välilehden tai selaimen sulkemisen jälkeen
 * päävalikosta pääsee takaisin samaan kisaan. Koodit kiertävät, joten
 * vanha muisti unohdetaan.
 */
export function saveLastRoom(code: string): void {
  write(LAST_ROOM_KEY, JSON.stringify({ code, at: Date.now() }));
}

export function loadLastRoom(now = Date.now()): string | null {
  try {
    const v = JSON.parse(read(LAST_ROOM_KEY) ?? 'null') as { code?: unknown; at?: unknown } | null;
    if (typeof v?.code !== 'string' || typeof v.at !== 'number') return null;
    return now - v.at < LAST_ROOM_TTL ? v.code : null;
  } catch {
    return null;
  }
}

export function clearLastRoom(): void {
  try {
    localStorage.removeItem(LAST_ROOM_KEY);
  } catch {
    // ei haittaa
  }
}
