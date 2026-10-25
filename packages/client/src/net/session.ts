import { Client, type Room } from '@colyseus/sdk';
import {
  ClientMsg,
  ROOM_NAME,
  ServerMsg,
  formatRoomCode,
  isSpeciesId,
  isWeatherLevel,
  parseTackle,
  DEFAULT_TACKLE,
  type Tackle,
  type Difficulty,
  rankPlayers,
  type Catch,
  type CatchRecord,
  type InputMessage,
  type PlayerCatches,
  type PlayerResult,
  type SpeciesId,
  type BigWaveMessage,
  type UntangledMessage,
  RECORDS_PATH,
  type RecordBoard,
  type RecordMessage,
  type JoinOptions,
  type LightningMessage,
  type Penalty,
  type RoomSettings,
  type SplashMessage,
  type RoomPhase,
  type StartedMessage,
  type WinRule,
} from '@lunki/shared';

/**
 * Palvelimen osoite: ?palvelin=wss://… ohittaa, sitten koontiaikainen
 * VITE_LUNKI_SERVER, muuten sama kone portissa 2567 (kehitys).
 */
export function serverUrl(): string {
  const param = new URLSearchParams(location.search).get('palvelin');
  if (param) return param;
  const env = import.meta.env.VITE_LUNKI_SERVER as string | undefined;
  if (env) return env;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.hostname || 'localhost'}:2567`;
}

/** Onko pelipalvelin tavoitettavissa? (Colyseuksen /__healthcheck) */
export async function checkServer(timeoutMs = 4000): Promise<boolean> {
  const http = serverUrl().replace(/^ws/, 'http').replace(/\/$/, '');
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

/** Järven ennätyslista palvelimelta; null, jos palvelinta ei tavoiteta. */
export async function fetchRecords(timeoutMs = 4000): Promise<RecordBoard | null> {
  const http = serverUrl().replace(/^ws/, 'http').replace(/\/$/, '');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${http}${RECORDS_PATH}`, { signal: ctrl.signal });
    return res.ok ? ((await res.json()) as RecordBoard) : null;
  } catch {
    return null;
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
  tackle: Tackle;
}

export interface LobbyView {
  code: string;
  phase: RoomPhase;
  players: LobbyPlayer[];
  maxPlayers: number;
  settings: RoomSettings;
  amHost: boolean;
  /** Kaikki muut kuin isäntä ovat valmiina. */
  allReady: boolean;
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
    lightningPenalty: string;
    capsizePenalty: string;
    species: Iterable<string>;
  };
  players: Map<string, PlayerSchema>;
  clock: number;
  countdown: number;
  catches: Iterable<CatchSchema>;
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
  onSpout: ((msg: BigWaveMessage) => void) | null = null;
  onUntangled: ((msg: UntangledMessage) => void) | null = null;
  onRecord: ((msg: RecordMessage) => void) | null = null;
  onStarted: ((msg: StartedMessage, view: LobbyView) => void) | null = null;
  onError: ((message: string) => void) | null = null;
  /** Yhteys katkesi muusta syystä kuin omasta lähdöstä. */
  onDisconnect: (() => void) | null = null;
  private leaving = false;

  /** Oma yhteys katkesi hetkeksi / palasi (automaattinen uudelleenyhdistys). */
  onConnection: ((connected: boolean) => void) | null = null;

  private constructor(readonly room: Room<unknown, StateSchema>) {
    saveResume(room.reconnectionToken);
    room.onDrop(() => this.onConnection?.(false));
    room.onReconnect(() => {
      saveResume(room.reconnectionToken);
      this.onConnection?.(true);
    });
    room.onStateChange(() => {
      if (!this.ready) return;
      this.onState?.(this.room.state);
      this.onChange?.(this.view());
    });
    room.onMessage(ServerMsg.started, (m: StartedMessage) => this.onStarted?.(m, this.view()));
    room.onMessage(ServerMsg.error, (m: string) => this.onError?.(m));
    room.onMessage(ServerMsg.castRejected, () => this.onCastRejected?.());
    room.onMessage(ServerMsg.catchRejected, () => this.onCatchRejected?.());
    room.onMessage(ServerMsg.lightning, (m: LightningMessage) => this.onLightning?.(m));
    room.onMessage(ServerMsg.bigWave, (m: BigWaveMessage) => this.onBigWave?.(m));
    room.onMessage(ServerMsg.spout, (m: BigWaveMessage) => this.onSpout?.(m));
    room.onMessage(ServerMsg.untangled, (m: UntangledMessage) => this.onUntangled?.(m));
    room.onMessage(ServerMsg.record, (m: RecordMessage) => this.onRecord?.(m));
    room.onLeave(() => {
      clearResume();
      if (!this.leaving) this.onDisconnect?.();
    });
  }

  static async create(options: JoinOptions): Promise<NetSession> {
    const room = await new Client(serverUrl()).create<StateSchema>(ROOM_NAME, options);
    return new NetSession(room);
  }

  static async join(code: string, options: JoinOptions): Promise<NetSession> {
    const room = await new Client(serverUrl()).joinById<StateSchema>(code, options);
    return new NetSession(room);
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
      const room = await new Client(serverUrl()).reconnect<StateSchema>(token);
      return new NetSession(room);
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
        tackle: playerTackle(p),
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
        lightningPenalty: s.settings.lightningPenalty as Penalty,
        capsizePenalty: s.settings.capsizePenalty as Penalty,
        species: [...s.settings.species].filter(isSpeciesId),
      },
      amHost: s.hostId === me,
      allReady: players.every((p) => p.host || p.ready),
    };
  }

  setReady(ready: boolean): void {
    this.room.send(ClientMsg.ready, ready);
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

  sendTackle(t: Tackle): void {
    this.room.send(ClientMsg.tackle, t);
  }

  /** Isäntä: takaisin aulaan uutta kisaa varten. */
  restart(): void {
    this.room.send(ClientMsg.restart);
  }

  /** Tulostaulu voittoehdon mukaan (myös lähteneiden saaliit). */
  results(): PlayerResult[] {
    const s = this.room.state;
    const rows = new Map<string, PlayerCatches & { catches: CatchRecord[] }>();
    s.players.forEach((p, id) => rows.set(id, { id, name: p.name, catches: [] }));
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

/** Selkokielinen virheilmoitus liittymisongelmille. */
export function describeJoinError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/not found|invalid|locked|full/i.test(msg))
    return 'Huonetta ei löytynyt, se on täynnä tai kisa on jo alkanut.';
  if (/fetch|network|ECONNREFUSED|failed/i.test(msg))
    return 'Palvelimeen ei saada yhteyttä. Onko palvelin käynnissä?';
  return `Liittyminen epäonnistui: ${msg}`;
}

/** Pelaajan varusteet tilasta; tuntemattomat arvot korvautuvat oletuksilla. */
export const playerTackle = (p: PlayerSchema): Tackle =>
  parseTackle({ rod: p.rod, lure: p.lure, line: p.line, leader: p.leader }) ?? {
    ...DEFAULT_TACKLE,
  };
