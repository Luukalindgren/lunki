/** Käsimerkit (#228): yhteiset tunnisteet, rajat ja tarkistukset. */

/** Eleet valikon järjestyksessä (numeronäppäimet 1–6). */
export const EMOTES = ['wave', 'thumbsUp', 'middleFinger', 'fist', 'comeHere', 'bigFish'] as const;
export type EmoteId = (typeof EMOTES)[number];

export function isEmoteId(v: unknown): v is EmoteId {
  return typeof v === 'string' && (EMOTES as readonly string[]).includes(v);
}

/** Eleen animaation kesto (s): sen aikana kalastaja ei voi heittää. */
export const EMOTE_DURATION = 2.2;
/** Nopeusrajoitus: korkeintaan `burst` elettä putkeen, sitten yksi per `refillMs`. */
export const EMOTE_RATE = { burst: 2, refillMs: 2000 };

/** Palvelin välittää eleen muille. */
export interface EmoteMessage {
  /** Tekijän sessionId. */
  from: string;
  emote: EmoteId;
}
