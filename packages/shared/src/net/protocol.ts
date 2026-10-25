/** Yhteiset määrittelyt asiakkaan ja palvelimen välille. */

/** Colyseus-huonetyypin nimi. */
export const ROOM_NAME = 'lunki';

/** Oletuspelaajamäärä huoneessa. Rakenne sallii isomman. */
export const DEFAULT_MAX_PLAYERS = 8;
export const MAX_PLAYERS_LIMIT = 32;

export const NAME_MAX_LENGTH = 16;

/** Huonekoodin merkit: ei sekoittuvia (0/O, 1/I/L). */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 4;
export const CODE_PREFIX = 'LUNKI-';

/** Arpoo huonekoodin (pelkkä tunnisteosa, esim. "4F7K"). */
export function randomRoomCode(random: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < CODE_LENGTH; i++)
    s += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)]!;
  return s;
}

/** Näytettävä muoto: LUNKI-4F7K. */
export const formatRoomCode = (code: string) => `${CODE_PREFIX}${code}`;

/**
 * Tulkitsee käyttäjän kirjoittaman koodin tai linkin. Hyväksyy esim.
 * "lunki-4f7k", "4F7K", " 4f 7k " ja "https://…/?huone=LUNKI-4F7K".
 * Palauttaa tunnisteosan tai null, jos koodi ei kelpaa.
 */
export function parseRoomCode(input: string): string | null {
  let s = input.trim();
  const fromUrl = /[?&]huone=([^&#]+)/i.exec(s);
  if (fromUrl) s = decodeURIComponent(fromUrl[1]!);
  s = s.toUpperCase().replace(/[\s-]/g, '');
  if (s.startsWith('LUNKI')) s = s.slice(5);
  if (s.length !== CODE_LENGTH) return null;
  for (const ch of s) if (!CODE_ALPHABET.includes(ch)) return null;
  return s;
}

/** Siistii nimimerkin: ei ohjausmerkkejä, korkeintaan 16 merkkiä. */
export function sanitizeName(name: unknown): string {
  const s = typeof name === 'string' ? name : '';
  const printable = [...s].filter((ch) => ch.charCodeAt(0) >= 0x20 && ch !== '\u007f').join('');
  const clean = printable.trim().replace(/\s+/g, ' ');
  return [...clean].slice(0, NAME_MAX_LENGTH).join('') || 'Kalastaja';
}

/** Liittymisen valinnat (create/join). */
export interface JoinOptions {
  name: string;
  /** Selaimen muistiin tallennettu satunnainen tunniste. */
  playerId: string;
}

/** Huoneen vaiheet. */
export type RoomPhase = 'lobby' | 'countdown' | 'playing' | 'finished';

/** Asiakkaan viestit palvelimelle. */
export const ClientMsg = {
  ready: 'ready',
  start: 'start',
  name: 'name',
  /** Isäntä muuttaa asetuksia: Partial<RoomSettings>. */
  settings: 'settings',
  /** Renkaan syötteet ja vieheen sijainti, ks. InputMessage. */
  input: 'input',
  /** Viehe osui veteen: palvelin tarkistaa heiton uskottavuuden. */
  splash: 'splash',
  /** Kala nostettu: palvelin punnitsee (Catch). */
  catch: 'catch',
  /** Isäntä palauttaa huoneen aulaan uutta kisaa varten. */
  restart: 'restart',
} as const;

/** Vieheen tila muille näytettäväksi. */
export const LureStage = { none: 0, flight: 1, water: 2, hooked: 3 } as const;
export type LureStage = (typeof LureStage)[keyof typeof LureStage];

export interface InputMessage {
  /** encodeInputs()-muodossa. */
  i: number[];
  /** Viehe: [x, y, LureStage]. */
  l?: [number, number, number];
}

export interface SplashMessage {
  x: number;
  y: number;
}

/** Palvelimen viestit asiakkaille. */
export const ServerMsg = {
  started: 'started',
  error: 'error',
  /** Palvelin hylkäsi heiton: viehe takaisin kelalle. */
  castRejected: 'castRejected',
  /** Palvelin ei hyväksynyt saalista punnitukseen. */
  catchRejected: 'catchRejected',
  /** Salama iski, ks. LightningMessage. */
  lightning: 'lightning',
} as const;

export interface LightningMessage {
  x: number;
  y: number;
  /** Osuman saaneiden sessionId:t. */
  victims: string[];
}

export interface StartedMessage {
  seed: number;
}
