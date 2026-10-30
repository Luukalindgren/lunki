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

/** Tallentaa nimimerkin ja vaihtaa sen profiiliin. Tyhjä nimi on nimetön profiili. */
export function saveName(name: string): string {
  const clean = name.trim() ? sanitizeName(name) : '';
  migrateOnce();
  const prev = read(NAME_KEY) ?? '';
  // Ensimmäinen nimimerkki ottaa nimettömänä kertyneet tiedot omikseen.
  if (!profileId(prev) && profileId(clean) && !hasProfile(clean)) moveProfile('', clean);
  write(NAME_KEY, clean);
  return clean;
}

/**
 * Omat tiedot nimimerkin profiilissa (#415). Kirjautumista ei ole: profiili
 * on tämän laitteen ja selaimen tietoa nimimerkin alla. Uusi nimimerkki
 * aloittaa alusta, ja vanhalla pääsee takaisin omiin tietoihinsa. Laitteen
 * asetukset (HUD, äänet, kieli) eivät ole profiilissa.
 */
const PROFILE_DATA = ['stats', 'journal', 'tackle', 'tackleBox', 'appearance', 'craft'] as const;
export type ProfileData = (typeof PROFILE_DATA)[number];

/** Profiilin tunniste: kirjainkoolla ei väliä, oletusnimi on nimetön profiili. */
function profileId(name: string): string {
  if (!name.trim()) return '';
  const clean = sanitizeName(name);
  return clean === sanitizeName('') ? '' : clean.toLocaleLowerCase('fi');
}

/** Nimetön profiili käyttää profiileja vanhempia avaimia (`lunki.stats`). */
function keyOf(data: ProfileData, name: string): string {
  const id = profileId(name);
  return id ? `lunki.profile.${encodeURIComponent(id)}.${data}` : `lunki.${data}`;
}

const hasProfile = (name: string) => PROFILE_DATA.some((d) => read(keyOf(d, name)) !== null);

function moveProfile(from: string, to: string): void {
  for (const d of PROFILE_DATA) {
    const v = read(keyOf(d, from));
    if (v === null) continue;
    write(keyOf(d, to), v);
    try {
      localStorage.removeItem(keyOf(d, from));
    } catch {
      // ei haittaa
    }
  }
}

const PROFILES_KEY = 'lunki.profiles';

/** Ennen profiileja nimen asettaneen pelaajan tiedot siirretään kerran hänen profiiliinsa. */
function migrateOnce(): void {
  if (read(PROFILES_KEY) !== null) return;
  const name = read(NAME_KEY) ?? '';
  if (profileId(name) && !hasProfile(name)) moveProfile('', name);
  write(PROFILES_KEY, '1');
}

/** Tallennusavain nykyisen nimimerkin profiilissa. */
export function profileKey(data: ProfileData): string {
  migrateOnce();
  return keyOf(data, read(NAME_KEY) ?? '');
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
