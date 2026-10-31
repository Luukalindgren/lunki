import type { SpeciesId } from '../fishing/fish';
import type { RaceStats } from '../game/raceStats';
import { CONTROL_CHARS, INVISIBLE_CHARS } from './text';

/** Yhteiset määrittelyt asiakkaan ja palvelimen välille. */

/** Colyseus-huonetyypin nimi. */
export const ROOM_NAME = 'lunki';

/**
 * Palvelimen protokollaversio (LunkiState.protocol). Uusi asiakas voi
 * olla jo julkaistu, vaikka pelikoneen palvelinta ei ole käynnistetty
 * uudelleen: asiakas ei lähetä vanhemmalle palvelimelle viestejä, joita se
 * ei tunne. Vanha palvelin ilman kenttää = 1.
 */
export const PROTOCOL_VERSION = 13;
/** Chat tuli versiossa 2. */
export const CHAT_PROTOCOL = 2;
/** Maalle juuttuneen vieheen siiman katkaisu (ClientMsg.landCut) tuli versiossa 3. */
export const LAND_CUT_PROTOCOL = 3;
/** Katsojat (JoinOptions.spectate, ClientMsg.spectate) tulivat versiossa 4. */
export const SPECTATE_PROTOCOL = 4;
/** Käsimerkit (ClientMsg.emote, ServerMsg.emote) tulivat versiossa 5. */
export const EMOTE_PROTOCOL = 5;
/**
 * Veneet (ClientMsg.boat, PlayerState.boat/seat/look) pelaajan omana
 * kulkupelinä tulivat versiossa 7 (versiossa 6 venekisa oli huoneen asetus).
 * Asiakas kertoo versionsa (JoinOptions.protocol): vanha asiakas ei osaa
 * venettä, joten se ei pääse huoneeseen, jossa joku on valinnut veneen.
 */
export const BOAT_PROTOCOL = 7;
/**
 * Ankkuri (#355): syötteen bitti 32 ja PlayerState.anchor… tulivat versiossa 8.
 * Vanha palvelin ei laske ankkuria, joten asiakas ei silloin tarjoa sitä.
 */
export const ANCHOR_PROTOCOL = 8;
/**
 * Paikanvaihto veneessä (#357): ClientMsg.seat ja PlayerState.seatAsk tulivat
 * versiossa 9. Vanha palvelin ei vaihda paikkoja, joten asiakas ei tarjoa sitä.
 */
export const SEAT_PROTOCOL = 9;
/**
 * Kisan tilastot tulossivulle (#367): ClientMsg.stats ja ServerMsg.stats
 * tulivat versiossa 10. Vanhan palvelimen kanssa näkyvät vain omat tilastot.
 */
export const STATS_PROTOCOL = 10;
/**
 * Vuodenaika (#427): SettingsState.season tuli versiossa 11. Vanha palvelin
 * ei tunne kautta, joten aula ei silloin tarjoa sitä ja kisa on kesällä.
 */
export const SEASON_PROTOCOL = 11;
/**
 * Rantautuminen (#457): syötteen bitti 64 (pääkonteksti maalla) ja
 * PlayerState.shore… tulivat versiossa 12. Vanhan palvelimen kanssa ranta on
 * seinä kuten ennen, eikä vanhan asiakkaan pelaaja nouse maihin.
 */
export const SHORE_PROTOCOL = 12;
/**
 * Täyttökisa (#458): SettingsState.inflate ja PlayerState.inflate…/fill…
 * tulivat versiossa 13. Vanha asiakas ei pääse huoneeseen, jossa täyttökisa
 * on valittu, eikä aula tarjoa sitä vanhan palvelimen kanssa.
 */
export const INFLATE_PROTOCOL = 13;

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
  const s = typeof name === 'string' ? name.slice(0, NAME_MAX_LENGTH * 4) : '';
  const printable = s.replace(CONTROL_CHARS, '').replace(INVISIBLE_CHARS, '');
  const clean = printable.trim().replace(/\s+/g, ' ');
  return [...clean].slice(0, NAME_MAX_LENGTH).join('') || 'Kalastaja';
}

/** Liittymisen valinnat (create/join). */
export interface JoinOptions {
  name: string;
  /** Selaimen muistiin tallennettu satunnainen tunniste. */
  playerId: string;
  /**
   * Kisan aikana: jos kisaan ei pääse mukaan (huoneen asetus), liitytään
   * katsojaksi. Vanha palvelin ei tunne valintaa ja hylkää liittymisen.
   */
  spectate?: boolean;
  /** Asiakkaan PROTOCOL_VERSION; vanha asiakas ei lähetä. */
  protocol?: number;
}

/**
 * Palvelimen syyt hylätä liittyminen koodeina (virheen viesti); asiakas
 * kääntää ne pelaajan kielelle.
 */
export const JoinRefusal = {
  closed: 'late-join-closed',
  returnOnly: 'late-join-return-only',
  full: 'room-full',
  /** Palvelimella on jo enimmäismäärä huoneita. */
  serverFull: 'server-full',
  /** Asiakas on liian vanha huoneen kisaan (esim. huoneessa on vene). */
  outdated: 'client-outdated',
} as const;
export type JoinRefusalCode = (typeof JoinRefusal)[keyof typeof JoinRefusal];

/**
 * Palvelimen virheilmoitus aulassa (ServerMsg.error): koodi ja tarvittaessa
 * pelaajien nimet. Asiakas kääntää koodin; vanha palvelin lähetti valmiin
 * suomenkielisen lauseen.
 */
export type RoomErrorCode = 'host-only' | 'need-angler' | 'not-ready';
export interface RoomError {
  code: RoomErrorCode;
  /** not-ready: pelaajat, joita odotetaan. */
  names?: string[];
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
  /** Sotkeutunut pelaaja katkaisee oman siimansa. */
  cutLine: 'cutLine',
  /** Pelaajan varusteet (Tackle): aulassa ja kisan aikana vieheen vaihtuessa. */
  tackle: 'tackle',
  /** Chat-viesti muille (teksti), ks. ChatMessage. */
  chat: 'chat',
  /** Pelaajan värit (Appearance): aulassa. */
  appearance: 'appearance',
  /** Pelaaja katkaisi siiman maalle juuttuneen vieheen takia: aikasakko. */
  landCut: 'landCut',
  /** Aulassa: seuraava kisa katsojana (true) tai kalastajana (false). */
  spectate: 'spectate',
  /** Käsimerkki muille (EmoteId). */
  emote: 'emote',
  /**
   * Aulassa kulkupeli: veneeseen n (1…) kyytiin, omaan uuteen veneeseen (0)
   * tai kelluntarenkaalle (BOAT_TUBE).
   */
  boat: 'boat',
  /**
   * Veneessä paikka (BoatSeat), johon pelaaja haluaa (#357): vapaalle
   * siirrytään, varatusta pyydetään vaihtoa; -1 perii pyynnön.
   */
  seat: 'seat',
  /** Kisan lopussa omat tilastot (RaceStats) muiden tulossivulle (#367). */
  stats: 'stats',
} as const;

/** Vieheen tila muille näytettäväksi. */
export const LureStage = { none: 0, flight: 1, water: 2, hooked: 3 } as const;
export type LureStage = (typeof LureStage)[keyof typeof LureStage];

/**
 * Soutajan kädet ovat vavassa: viehe lentää tai hän kelaa. Silloin soutaa ei
 * voi; viehe vedessä soutaa saa (soutu-uistelu, #263).
 */
export const rodInHand = (stage: number, reeling: boolean): boolean =>
  stage === LureStage.flight || reeling;

export interface InputMessage {
  /** encodeInputs()-muodossa. */
  i: number[];
  /** Viehe: [x, y, LureStage, kelaa (1/0)]. */
  l?: [number, number, number, number?];
  /** Soutaja kääntyneenä tuhdolla: kulma veneen suunnasta (rad); puuttuu = 0. */
  look?: number;
}

/** ClientMsg.boat: kelluntarenkaalle veneestä. */
export const BOAT_TUBE = -1;

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
  /** Iso aalto osui, ks. BigWaveMessage. */
  bigWave: 'bigWave',
  /** Trombi nappasi renkaita, ks. SpoutMessage. */
  spout: 'spout',
  /** Sotku selvisi, ks. UntangledMessage. */
  untangled: 'untangled',
  /** Saalis pääsi järven ennätyslistalle, ks. RecordMessage. */
  record: 'record',
  /** Uusi chat-viesti (ChatMessage). */
  chat: 'chat',
  /** Viimeisimmät viestit liittyvälle tai palaavalle (ChatMessage[]). */
  chatHistory: 'chatHistory',
  /** Viestiä ei välitetty: liian tiheään. */
  chatRejected: 'chatRejected',
  /** Toisen pelaajan käsimerkki (EmoteMessage). */
  emote: 'emote',
  /** Kisan tilastot tulossivulle: kaikki tähän mennessä saadut (RaceStatsMessage). */
  stats: 'stats',
} as const;

/** ServerMsg.stats: pelaajien tilastot sessionId:n mukaan. */
export type RaceStatsMessage = Record<string, RaceStats>;

export interface RecordMessage {
  /** Saajan sessionId. */
  player: string;
  angler: string;
  species: SpeciesId;
  weight: number;
  /** Sija lajin listalla samalla vaikeustasolla (1 = järven ennätys). */
  place: number;
}

export interface UntangledMessage {
  /** Sotkussa olleet sessionId:t. */
  players: [string, string];
  /** Selvitettiin yhdessä kelaamalla, tai `by` katkaisi siimansa. */
  how: 'untangled' | 'cut';
  by: string;
}

export interface BigWaveMessage {
  /** Kaatuneiden sessionId:t. */
  victims: string[];
}

/** Trombi nappasi renkaita ja lennätti ne muualle järvelle. */
export interface SpoutMessage extends BigWaveMessage {
  /** Lennot: kuka, mistä ja minne (palvelin on jo siirtänyt renkaan perille). */
  flights: { id: string; fromX: number; fromY: number; toX: number; toY: number }[];
}

export interface LightningMessage {
  x: number;
  y: number;
  /** Osuman saaneiden sessionId:t. */
  victims: string[];
}

export interface StartedMessage {
  seed: number;
}
