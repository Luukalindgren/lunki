import type { Room } from '@colyseus/sdk';
import {
  ClientMsg,
  ROOM_NAME,
  ServerMsg,
  formatRoomCode,
  isLateJoin,
  isSpeciesId,
  isTimeOfDay,
  isWeatherLevel,
  JoinRefusal,
  parseTackle,
  parseAppearance,
  DEFAULT_TACKLE,
  DEFAULT_APPEARANCE,
  type Appearance,
  type Tackle,
  type Difficulty,
  rankTeams,
  rankPlayers,
  BOAT_PROTOCOL,
  SEAT_PROTOCOL,
  PROTOCOL_VERSION,
  type Catch,
  type CatchRecord,
  type InputMessage,
  type PlayerCatches,
  type PlayerResult,
  type SpeciesId,
  type BigWaveMessage,
  type SpoutMessage,
  type ChatMessage,
  type EmoteId,
  type EmoteMessage,
  EMOTE_PROTOCOL,
  STATS_PROTOCOL,
  SPECIES,
  parseRaceStats,
  type RaceStats,
  isEmoteId,
  CHAT_HISTORY,
  CHAT_PROTOCOL,
  LAND_CUT_PROTOCOL,
  SPECTATE_PROTOCOL,
  type UntangledMessage,
  RECORDS_PATH,
  SOLO_RECORDS_PATH,
  type RecordBoard,
  type RecordEntry,
  type RecordMode,
  type SoloRecordReply,
  type RecordMessage,
  type JoinRefusalCode,
  type RoomError,
  type JoinOptions,
  type LightningMessage,
  type Penalty,
  type RoomSettings,
  type SplashMessage,
  type RoomPhase,
  type StartedMessage,
  type WinRule,
} from '@lunki/shared';
import { t, type MsgKey } from '../i18n';

/**
 * Palvelimen osoite: ?palvelin=wss://… ohittaa. LAN-tilassa (pnpm lan) sivun
 * jakava palvelin on itse pelipalvelin, joten yhteys samaan osoitteeseen.
 * Muuten koontiaikainen VITE_LUNKI_SERVER tai sama kone portissa 2567 (kehitys).
 */
export function serverUrl(): string {
  const param = new URLSearchParams(location.search).get('palvelin');
  if (param) return param;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  if (import.meta.env.MODE === 'lan') return `${proto}://${location.host}`;
  const env = import.meta.env.VITE_LUNKI_SERVER as string | undefined;
  if (env) return env;
  return `${proto}://${location.hostname || 'localhost'}:2567`;
}

/**
 * Muu kuin pelin oma palvelin (?palvelin=…): sen nimi näytetään valikossa,
 * koska vieras palvelin näkee nimimerkin ja voi esittää omaa peliään.
 */
export function customServer(): string | null {
  const param = new URLSearchParams(location.search).get('palvelin');
  if (!param) return null;
  try {
    return new URL(param).host || param;
  } catch {
    return param;
  }
}

/**
 * Colyseuksen asiakas ladataan vasta moninpeliin mentäessä: yksinpelaaja ei
 * lataa sitä lainkaan, ja sivu aukeaa nopeammin.
 */
const importSdk = () => import('@colyseus/sdk');
let sdk: ReturnType<typeof importSdk> | null = null;
const loadSdk = () => (sdk ??= importSdk());
const client = async () => new (await loadSdk()).Client(serverUrl());

/** Palvelimen HTTP-osoite (terveystarkistus, ennätykset, palaute). */
export const serverHttpUrl = () => serverUrl().replace(/^ws/, 'http').replace(/\/$/, '');

/** Pelipalvelin ei vastannut terveystarkistukseen (kone kiinni). */
export class ServerDownError extends Error {
  constructor() {
    super('server down');
  }
}

/** Onko pelipalvelin tavoitettavissa? (Colyseuksen /__healthcheck) */
export async function checkServer(timeoutMs = 3000): Promise<boolean> {
  // Moninpelivalikko on auki: asiakas valmiiksi ladattavaksi liittymistä varten.
  loadSdk().catch(() => (sdk = null));
  const http = serverHttpUrl();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${http}/__healthcheck`, { signal: ctrl.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Yhdistäminen keskeytetään heti, kun terveystarkistus kertoo palvelimen
 * olevan kiinni: muuten huono yhteys voisi jättää pelaajan odottamaan
 * pitkäksi aikaa. Myöhässä onnistunut yhteys suljetaan.
 */
async function unlessServerDown(connecting: Promise<NetSession>): Promise<NetSession> {
  const down = checkServer().then((ok) =>
    ok ? new Promise<never>(() => undefined) : Promise.reject(new ServerDownError()),
  );
  try {
    return await Promise.race([connecting, down]);
  } catch (err) {
    if (err instanceof ServerDownError) connecting.then((s) => s.leave()).catch(() => undefined);
    throw err;
  }
}

/**
 * Järven ennätyslista palvelimelta (moninpelin tai yksinpelin); null, jos
 * palvelinta ei tavoiteta tai se ei vielä tunne listaa.
 */
export async function fetchRecords(
  mode: RecordMode = 'race',
  timeoutMs = 4000,
): Promise<RecordBoard | null> {
  const http = serverHttpUrl();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const path = mode === 'solo' ? SOLO_RECORDS_PATH : RECORDS_PATH;
    const res = await fetch(`${http}${path}`, { signal: ctrl.signal });
    return res.ok ? ((await res.json()) as RecordBoard) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Yksinpelin saaliin lähetyksen tulos: sija lajin listalla (null = ei
 * mahtunut listalle), palvelin hylkäsi saaliin, tai palvelinta ei tavoitettu.
 */
export type SoloSubmit = { place: number | null } | 'rejected' | 'offline';

/** Lähettää yksinpelin saaliin yksinpelin ennätyslistalle. */
export async function submitSoloRecord(
  entry: Omit<RecordEntry, 'date'>,
  timeoutMs = 6000,
): Promise<SoloSubmit> {
  const http = serverHttpUrl();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    // Teksti rungoksi, ettei selain tee CORS-esikyselyä (kuten palautteessa).
    const res = await fetch(`${http}${SOLO_RECORDS_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify(entry),
      signal: ctrl.signal,
    });
    if (res.ok) return { place: ((await res.json()) as SoloRecordReply).place };
    // Cloudflare vastaa itse 5xx:llä, kun tunnelin takana oleva kone on kiinni.
    return res.status >= 500 ? 'offline' : 'rejected';
  } catch {
    return 'offline';
  } finally {
    clearTimeout(timer);
  }
}

/** Linkki, jolla kaveri pääsee suoraan huoneeseen. */
export function inviteLink(code: string): string {
  const url = new URL(location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('huone', formatRoomCode(code));
  const server = new URLSearchParams(location.search).get('palvelin');
  if (server) url.searchParams.set('palvelin', server);
  return url.toString();
}

export interface LobbyPlayer {
  sessionId: string;
  name: string;
  ready: boolean;
  host: boolean;
  me: boolean;
  connected: boolean;
  /** Katsoo kisaa osallistumatta. */
  spectator: boolean;
  tackle: Tackle;
  appearance: Appearance;
  /** Kulkupeli (#263): vene 1… ja paikka (BoatSeat); 0 = kelluntarengas. */
  boat: number;
  seat: number;
  /** Paikka, johon pelaaja haluaa vaihtaa (#357); null = ei pyyntöä. */
  seatAsk: number | null;
}

export interface LobbyView {
  code: string;
  phase: RoomPhase;
  players: LobbyPlayer[];
  maxPlayers: number;
  settings: RoomSettings;
  amHost: boolean;
  /** Kaikki muut yhteydessä olevat kalastajat kuin isäntä ovat valmiina. */
  allReady: boolean;
  /** Palvelin tuntee katsojat (vanha palvelin ei). */
  canSpectate: boolean;
  /** Palvelin osaa veneet kulkupelinä (vanha palvelin ei). */
  canBoat: boolean;
  /** Palvelin vaihtaa paikkoja veneessä (#357). */
  canSwapSeats: boolean;
}

export interface PlayerSchema {
  name: string;
  ready: boolean;
  connected: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  heading: number;
  angVel: number;
  kickPhase: number;
  /** Puuttuu vanhalta palvelimelta. */
  stamina?: number;
  /** Katsoja; puuttuu vanhalta palvelimelta. */
  spectator?: boolean;
  /** Vene ja paikka; puuttuvat vanhalta palvelimelta. */
  boat?: number;
  seat?: number;
  /** Soutaja kääntyneenä tuhdolla (rad veneen suunnasta); puuttuu vanhalta palvelimelta. */
  look?: number;
  /** Ankkuri (AnchorPhase) ja sen tila (#355); puuttuvat vanhalta palvelimelta. */
  anchor?: number;
  anchorX?: number;
  anchorY?: number;
  anchorDepth?: number;
  anchorDrop?: number;
  /** Paikanvaihtopyyntö (#357): haluttu paikka + 1; puuttuu vanhalta palvelimelta. */
  seatAsk?: number;
  ack: number;
  lureX: number;
  lureY: number;
  lureStage: number;
  outUntil: number;
  capsizedUntil: number;
  tangledWith: string;
  tangleX: number;
  tangleY: number;
  untangle: number;
  rod: string;
  lure: string;
  line: string;
  leader: boolean;
  method: string;
  flyRod: string;
  flyLine: string;
  flyLeader: string;
  fly: string;
  tubeColor: number;
  finColor: number;
  shirtColor: number;
  lineColor: number;
}

export interface StateSchema {
  code: string;
  phase: string;
  hostId: string;
  seed: number;
  settings: {
    durationMinutes: number;
    difficulty: string;
    winRule: string;
    maxPlayers: number;
    weather: string;
    /** Puuttuu vanhalta palvelimelta. */
    timeOfDay?: string;
    lightningPenalty: string;
    capsizePenalty: string;
    /** Puuttuu vanhalta palvelimelta. */
    landPenalty?: number;
    /** Puuttuu vanhalta palvelimelta. */
    lateJoin?: string;
    species: Iterable<string>;
    customStart: boolean;
    startX: number;
    startY: number;
  };
  players: Map<string, PlayerSchema>;
  clock: number;
  countdown: number;
  catches: Iterable<CatchSchema>;
  /** Puuttuu palvelimelta, joka on vanhempi kuin PROTOCOL_VERSION 2. */
  protocol?: number;
}

export interface CatchSchema {
  player: string;
  angler: string;
  species: string;
  name: string;
  weight: number;
  time: number;
  fishSlot: number;
  fishGen: number;
  /** Saajan vene (0 = rengas); puuttuu vanhalta palvelimelta. */
  boat?: number;
}

/** Yhteys yhteen huoneeseen. */
export class NetSession {
  onChange: ((view: LobbyView) => void) | null = null;
  /** Jokainen tilapäivitys pelin aikana (renkaiden synkronointi). */
  onState: ((state: StateSchema) => void) | null = null;
  onCastRejected: (() => void) | null = null;
  onCatchRejected: (() => void) | null = null;
  onLightning: ((msg: LightningMessage) => void) | null = null;
  onBigWave: ((msg: BigWaveMessage) => void) | null = null;
  onSpout: ((msg: SpoutMessage) => void) | null = null;
  onUntangled: ((msg: UntangledMessage) => void) | null = null;
  onRecord: ((msg: RecordMessage) => void) | null = null;
  /** Chat muuttui (uusi viesti tai historia palvelimelta). */
  onChat: (() => void) | null = null;
  /** Palvelin hylkäsi viestin (liian tiheään). */
  onChatRejected: (() => void) | null = null;
  /** Uusi chat-viesti puhekuplaksi pelaajan ylle (ei historiaa). */
  onChatBubble: ((msg: ChatMessage) => void) | null = null;
  /** Toisen pelaajan käsimerkki. */
  onEmote: ((msg: EmoteMessage) => void) | null = null;
  /** Viimeisimmät chat-viestit, vanhin ensin. */
  chat: ChatMessage[] = [];
  /** Päättyneen kisan tilastot sessionId:n mukaan (#367); uusi kisa tyhjentää. */
  raceStats = new Map<string, RaceStats>();
  /** Joku lähetti tilastonsa: tulossivu piirretään uudelleen. */
  onRaceStats: (() => void) | null = null;
  onStarted: ((msg: StartedMessage, view: LobbyView) => void) | null = null;
  onError: ((message: string) => void) | null = null;
  /** Yhteys katkesi muusta syystä kuin omasta lähdöstä. */
  onDisconnect: (() => void) | null = null;
  private leaving = false;

  /** Oma yhteys katkesi hetkeksi / palasi (automaattinen uudelleenyhdistys). */
  onConnection: ((connected: boolean) => void) | null = null;

  private constructor(readonly room: Room<unknown, StateSchema>) {
    saveResume(room.reconnectionToken);
    // SDK yhdistää oletuksena uudelleen vasta 5 s liittymisen jälkeen: heti
    // kisaan palatessa tullut katko veisi muuten suoraan valikkoon (#273).
    room.reconnection.minUptime = 0;
    room.onDrop(() => this.onConnection?.(false));
    room.onReconnect(() => {
      if (this.leaving) return;
      saveResume(room.reconnectionToken);
      this.onConnection?.(true);
    });
    room.onStateChange(() => {
      // Lähtiessä palvelimelta voi vielä tulla tiloja ennen kuin huone sulkeutuu:
      // ne eivät saa enää ohjata peliä.
      if (!this.ready || this.leaving) return;
      this.onState?.(this.room.state);
      this.onChange?.(this.view());
    });
    room.onMessage(ServerMsg.started, (m: StartedMessage) => {
      this.raceStats = new Map();
      this.onStarted?.(m, this.view());
    });
    room.onMessage(ServerMsg.stats, (m: unknown) => {
      if (typeof m !== 'object' || m === null) return;
      const isSpecies = (s: string) => Object.hasOwn(SPECIES, s);
      this.raceStats = new Map(
        Object.entries(m).map(([id, raw]) => [id, parseRaceStats(raw, isSpecies)]),
      );
      this.onRaceStats?.();
    });
    room.onMessage(ServerMsg.error, (m: RoomError | string) =>
      this.onError?.(describeRoomError(m)),
    );
    room.onMessage(ServerMsg.castRejected, () => this.onCastRejected?.());
    room.onMessage(ServerMsg.catchRejected, () => this.onCatchRejected?.());
    room.onMessage(ServerMsg.lightning, (m: LightningMessage) => this.onLightning?.(m));
    room.onMessage(ServerMsg.bigWave, (m: BigWaveMessage) => this.onBigWave?.(m));
    room.onMessage(ServerMsg.spout, (m: SpoutMessage) => this.onSpout?.(m));
    room.onMessage(ServerMsg.untangled, (m: UntangledMessage) => this.onUntangled?.(m));
    room.onMessage(ServerMsg.record, (m: RecordMessage) => this.onRecord?.(m));
    room.onMessage(ServerMsg.chat, (m: ChatMessage) => {
      this.chat = [...this.chat, m].slice(-CHAT_HISTORY);
      this.onChat?.();
      this.onChatBubble?.(m);
    });
    room.onMessage(ServerMsg.chatHistory, (m: ChatMessage[]) => {
      this.chat = Array.isArray(m) ? m.slice(-CHAT_HISTORY) : [];
      this.onChat?.();
    });
    room.onMessage(ServerMsg.chatRejected, () => this.onChatRejected?.());
    room.onMessage(ServerMsg.emote, (m: EmoteMessage) => {
      if (m && typeof m.from === 'string' && isEmoteId(m.emote)) this.onEmote?.(m);
    });
    room.onLeave(() => {
      clearResume();
      if (!this.leaving) this.onDisconnect?.();
    });
  }

  /** Palvelimen ollessa kiinni heittää ServerDownErrorin parissa sekunnissa. */
  static create(options: JoinOptions): Promise<NetSession> {
    return unlessServerDown(
      client()
        .then((c) => c.create<StateSchema>(ROOM_NAME, { ...options, protocol: PROTOCOL_VERSION }))
        .then((room) => new NetSession(room)),
    );
  }

  /** Jos kisaan ei pääse mukaan (huoneen asetus), liitytään katsojaksi. */
  static join(code: string, options: JoinOptions): Promise<NetSession> {
    return unlessServerDown(
      client()
        .then((c) =>
          c.joinById<StateSchema>(code, {
            ...options,
            spectate: true,
            protocol: PROTOCOL_VERSION,
          }),
        )
        .then((room) => new NetSession(room)),
    );
  }

  /**
   * Sivun uudelleenlatauksen jälkeen: palaa samaan huoneeseen ja renkaaseen,
   * jos paikka on vielä varattu. Palauttaa null, jos palattavaa ei ole.
   */
  static canResume(): boolean {
    return loadResume() !== null;
  }

  static async resume(): Promise<NetSession | null> {
    const token = loadResume();
    if (!token) return null;
    try {
      return await unlessServerDown(
        client()
          .then((c) => c.reconnect<StateSchema>(token))
          .then((room) => new NetSession(room)),
      );
    } catch {
      clearResume();
      return null;
    }
  }

  /** Ensimmäinen tila on saapunut. */
  get ready(): boolean {
    return this.room.state?.players !== undefined;
  }

  view(): LobbyView {
    const s = this.room.state;
    const me = this.room.sessionId;
    const players: LobbyPlayer[] = [];
    s.players.forEach((p, id) =>
      players.push({
        sessionId: id,
        name: p.name,
        ready: p.ready,
        host: id === s.hostId,
        me: id === me,
        connected: p.connected,
        spectator: p.spectator === true,
        tackle: playerTackle(p),
        appearance: playerAppearance(p),
        boat: p.boat ?? 0,
        seat: p.seat ?? 0,
        seatAsk: p.seatAsk ? p.seatAsk - 1 : null,
      }),
    );
    return {
      code: s.code,
      phase: s.phase as RoomPhase,
      players,
      maxPlayers: s.settings.maxPlayers,
      settings: {
        durationMinutes: s.settings.durationMinutes,
        difficulty: s.settings.difficulty as Difficulty,
        winRule: s.settings.winRule as WinRule,
        maxPlayers: s.settings.maxPlayers,
        weather: isWeatherLevel(s.settings.weather) ? s.settings.weather : 'realistic',
        timeOfDay: isTimeOfDay(s.settings.timeOfDay) ? s.settings.timeOfDay : 'day',
        lightningPenalty: s.settings.lightningPenalty as Penalty,
        capsizePenalty: s.settings.capsizePenalty as Penalty,
        landPenalty: s.settings.landPenalty ?? 0,
        lateJoin: isLateJoin(s.settings.lateJoin) ? s.settings.lateJoin : 'closed',
        species: [...s.settings.species].filter(isSpeciesId),
        start: s.settings.customStart ? { x: s.settings.startX, y: s.settings.startY } : null,
      },
      amHost: s.hostId === me,
      // Katkennutta ei odoteta, kuten palvelinkaan ei (#275).
      allReady: players.every((p) => p.host || p.ready || p.spectator || !p.connected),
      canSpectate: this.serverProtocol >= SPECTATE_PROTOCOL,
      canBoat: this.serverProtocol >= BOAT_PROTOCOL,
      canSwapSeats: this.serverProtocol >= SEAT_PROTOCOL,
    };
  }

  setReady(ready: boolean): void {
    this.room.send(ClientMsg.ready, ready);
  }

  /** Aulassa: seuraava kisa katsojana. Vanha palvelin ei tunne viestiä. */
  setSpectator(on: boolean): void {
    if (this.serverProtocol >= SPECTATE_PROTOCOL) this.room.send(ClientMsg.spectate, on);
  }

  /** Aulassa kulkupeli: veneeseen n kyytiin, omaan uuteen veneeseen (0) tai renkaalle (BOAT_TUBE). */
  sendBoat(boat: number): void {
    if (this.serverProtocol >= BOAT_PROTOCOL) this.room.send(ClientMsg.boat, boat);
  }

  /**
   * Veneessä paikka, johon haluaa (#357): vapaalle siirrytään, varatusta
   * pyydetään vaihtoa (-1 perii pyynnön). Vanha palvelin ei tunne viestiä.
   */
  sendSeat(seat: number): void {
    if (this.serverProtocol >= SEAT_PROTOCOL) this.room.send(ClientMsg.seat, seat);
  }

  /** Joku kisassa on veneessä (#263): venekunnat kisaavat joukkueina. */
  get hasBoats(): boolean {
    if (this.serverProtocol < BOAT_PROTOCOL) return false;
    let any = false;
    this.room.state?.players?.forEach((p) => (any ||= (p.boat ?? 0) > 0));
    return any;
  }

  /** Oma pelaaja katsoo kisaa osallistumatta. */
  get spectating(): boolean {
    return this.room.state?.players?.get(this.room.sessionId)?.spectator === true;
  }

  start(): void {
    this.room.send(ClientMsg.start);
  }

  /** Vain isäntä; palvelin tarkistaa arvot. */
  changeSettings(patch: Partial<RoomSettings>): void {
    this.room.send(ClientMsg.settings, patch);
  }

  get sessionId(): string {
    return this.room.sessionId;
  }

  sendInput(msg: InputMessage): void {
    this.room.send(ClientMsg.input, msg);
  }

  sendSplash(msg: SplashMessage): void {
    this.room.send(ClientMsg.splash, msg);
  }

  sendCatch(c: Catch): void {
    this.room.send(ClientMsg.catch, c);
  }

  sendCutLine(): void {
    this.room.send(ClientMsg.cutLine);
  }

  /** Vanha palvelin ei tunne viestiä; silloin sakko pidetään vain omalla koneella. */
  sendLandCut(): void {
    if (this.serverProtocol >= LAND_CUT_PROTOCOL) this.room.send(ClientMsg.landCut);
  }

  sendTackle(t: Tackle): void {
    this.room.send(ClientMsg.tackle, t);
  }

  /** Palvelimen protokollaversio; vanha palvelin ei kerro sitä (= 1). */
  get serverProtocol(): number {
    return this.room.state?.protocol ?? 1;
  }

  /** Vanha palvelin katkaisisi yhteyden tuntemattomasta viestistä. */
  get chatAvailable(): boolean {
    return this.serverProtocol >= CHAT_PROTOCOL;
  }

  sendChat(text: string): void {
    if (this.chatAvailable) this.room.send(ClientMsg.chat, text);
  }

  /** Vanha palvelin ei välitä eleitä: ne näkyvät silloin vain omalla koneella. */
  sendEmote(emote: EmoteId): void {
    if (this.serverProtocol >= EMOTE_PROTOCOL) this.room.send(ClientMsg.emote, emote);
  }

  /** Omat tilastot muiden tulossivulle; vanha palvelin ei välitä niitä. */
  sendRaceStats(stats: RaceStats): void {
    if (this.serverProtocol >= STATS_PROTOCOL) this.room.send(ClientMsg.stats, stats);
  }

  sendAppearance(a: Appearance): void {
    this.room.send(ClientMsg.appearance, a);
  }

  /** Isäntä: takaisin aulaan uutta kisaa varten. */
  restart(): void {
    this.room.send(ClientMsg.restart);
  }

  /** Tulostaulu voittoehdon mukaan (myös lähteneiden saaliit). */
  results(): PlayerResult[] {
    const s = this.room.state;
    const rows = new Map<string, PlayerCatches & { catches: CatchRecord[] }>();
    // Katsojat eivät ole tulostaulussa (paitsi jos heillä on saaliita, ks. alla).
    s.players.forEach((p, id) => {
      if (!p.spectator) rows.set(id, { id, name: p.name, catches: [] });
    });
    for (const c of s.catches) {
      let row = rows.get(c.player);
      if (!row) {
        row = { id: c.player, name: c.angler, catches: [] };
        rows.set(c.player, row);
      }
      row.catches.push({
        species: c.species as SpeciesId,
        name: c.name,
        weight: c.weight,
        time: c.time,
      });
    }
    return rankPlayers([...rows.values()], s.settings.winRule as WinRule);
  }

  /**
   * Kisan sijoitukset: venekunnat joukkueina ja renkailla kukin itse
   * (rankTeams). Ilman veneitä sama kuin results().
   */
  standings(): PlayerResult[] {
    const s = this.room.state;
    const boatCatch = [...s.catches].some((c) => (c.boat ?? 0) > 0);
    if (!this.hasBoats && !boatCatch) return this.results();
    const players: { id: string; name: string; boat: number }[] = [];
    s.players.forEach((p, id) => {
      if (!p.spectator) players.push({ id, name: p.name, boat: p.boat ?? 0 });
    });
    const catches = [...s.catches].map((c) => ({
      species: c.species as SpeciesId,
      name: c.name,
      weight: c.weight,
      time: c.time,
      boat: c.boat ?? 0,
      player: c.player,
      angler: c.angler,
    }));
    return rankTeams(catches, players, s.settings.winRule as WinRule, (n) => t('boat.name', { n }));
  }

  async leave(): Promise<void> {
    this.leaving = true;
    clearResume();
    await this.room.leave(true).catch(() => undefined);
  }
}

const RESUME_KEY = 'lunki.resume';

// Välilehtikohtainen muisti: uudelleenlataus palaa peliin, uusi välilehti ei.
function saveResume(token: string): void {
  try {
    sessionStorage.setItem(RESUME_KEY, token);
  } catch {
    // ei haittaa
  }
}

function loadResume(): string | null {
  try {
    return sessionStorage.getItem(RESUME_KEY);
  } catch {
    return null;
  }
}

function clearResume(): void {
  try {
    sessionStorage.removeItem(RESUME_KEY);
  } catch {
    // ei haittaa
  }
}

const REFUSAL_KEYS: Record<JoinRefusalCode, MsgKey> = {
  [JoinRefusal.closed]: 'join.closed',
  [JoinRefusal.returnOnly]: 'join.returnOnly',
  [JoinRefusal.full]: 'join.full',
  [JoinRefusal.serverFull]: 'join.serverFull',
  [JoinRefusal.outdated]: 'join.outdated',
};

/**
 * Vanhan palvelimen valmiit suomenkieliset lauseet koodeiksi, jotta
 * käynnistämätön palvelin näkyy englanniksikin oikein.
 */
const LEGACY_REFUSALS: Record<string, JoinRefusalCode> = {
  'Kisa on jo käynnissä, eikä huoneen luoja salli liittymistä kesken kisan.': JoinRefusal.closed,
  'Kisa on jo käynnissä. Kesken kisan pääsee vain takaisin omalle paikalleen.':
    JoinRefusal.returnOnly,
  'Huone on täynnä.': JoinRefusal.full,
  'Palvelin on täynnä, yritä hetken päästä uudelleen': JoinRefusal.serverFull,
};

/** Selkokielinen virheilmoitus liittymisongelmille. */
export function describeJoinError(err: unknown): string {
  if (err instanceof ServerDownError) return t('join.noServer');
  const msg = err instanceof Error ? err.message : String(err);
  const code = Object.hasOwn(REFUSAL_KEYS, msg) ? (msg as JoinRefusalCode) : LEGACY_REFUSALS[msg];
  if (code) return t(REFUSAL_KEYS[code]);
  if (/not found|invalid|locked|full/i.test(msg)) return t('join.notFound');
  if (/fetch|network|ECONNREFUSED|failed/i.test(msg)) return t('join.noServer');
  return t('join.failed', { msg });
}

/** Aulan virheilmoitus pelaajan kielellä; vanhan palvelimen lauseet tunnistetaan. */
export function describeRoomError(m: RoomError | string): string {
  const e: RoomError | null =
    typeof m !== 'string'
      ? m
      : m === 'Vain huoneen luoja voi aloittaa kisan'
        ? { code: 'host-only' }
        : m === 'Kisaan tarvitaan ainakin yksi kalastaja'
          ? { code: 'need-angler' }
          : m.startsWith('Odotetaan: ')
            ? { code: 'not-ready', names: m.slice('Odotetaan: '.length).split(', ') }
            : null;
  if (!e) return String(m);
  if (e.code === 'host-only') return t('roomError.hostOnly');
  if (e.code === 'need-angler') return t('roomError.needAngler');
  return t('roomError.notReady', { names: (e.names ?? []).join(', ') });
}

/** Pelaajan varusteet tilasta; tuntemattomat arvot korvautuvat oletuksilla. */
export const playerTackle = (p: PlayerSchema): Tackle =>
  parseTackle({
    rod: p.rod,
    lure: p.lure,
    line: p.line,
    leader: p.leader,
    method: p.method,
    flyRod: p.flyRod,
    flyLine: p.flyLine,
    flyLeader: p.flyLeader,
    fly: p.fly,
  }) ?? { ...DEFAULT_TACKLE };

/** Pelaajan värit tilasta; tuntemattomat värit korvautuvat oletuksilla. */
export const playerAppearance = (p: PlayerSchema): Appearance =>
  parseAppearance({
    tube: p.tubeColor,
    fins: p.finColor,
    shirt: p.shirtColor,
    line: p.lineColor,
  }) ?? {
    ...DEFAULT_APPEARANCE,
  };
