/** Kilpailun sisäinen chat: yhteiset rajat ja tarkistukset. */
import { CONTROL_CHARS, INVISIBLE_CHARS } from './text';

/** Viestin enimmäispituus merkkeinä. */
export const CHAT_MAX_LENGTH = 140;
/** Palvelin muistaa näin monta viimeisintä viestiä uusille tulijoille. */
export const CHAT_HISTORY = 30;
/** Nopeusrajoitus: korkeintaan `burst` viestiä putkeen, sitten yksi per `refillMs`. */
export const CHAT_RATE = { burst: 4, refillMs: 2000 };

/** Yksi chat-viesti kaikille huoneessa. */
export interface ChatMessage {
  /** Juokseva numero huoneen sisällä. */
  id: number;
  /** Lähettäjän sessionId. */
  from: string;
  /** Lähettäjän nimi lähetyshetkellä. */
  name: string;
  text: string;
}

/**
 * Siistii viestin: ohjausmerkit pois, välilyönnit yhdeksi, pituus rajattu.
 * Palauttaa null, jos viesti on tyhjä.
 */
export function sanitizeChat(text: unknown): string | null {
  if (typeof text !== 'string') return null;
  const printable = text
    .slice(0, CHAT_MAX_LENGTH * 4)
    .replace(CONTROL_CHARS, ' ')
    .replace(INVISIBLE_CHARS, '');
  const clean = printable.trim().replace(/\s+/g, ' ');
  const cut = [...clean].slice(0, CHAT_MAX_LENGTH).join('').trimEnd();
  return cut || null;
}

/**
 * Nopeusrajoitin (token bucket). Sama luokka palvelimella (pakottaa) ja
 * asiakkaalla (kertoo heti, ettei viestiä lähetetty).
 */
export class ChatLimiter {
  private tokens: number;
  private last: number | null = null;

  constructor(private readonly rate = CHAT_RATE) {
    this.tokens = rate.burst;
  }

  /** Saako viestin lähettää hetkellä `now` (ms)? Käyttää vuoron, jos saa. */
  take(now: number): boolean {
    if (this.last !== null) {
      const refill = (now - this.last) / this.rate.refillMs;
      this.tokens = Math.min(this.rate.burst, this.tokens + Math.max(0, refill));
    }
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
