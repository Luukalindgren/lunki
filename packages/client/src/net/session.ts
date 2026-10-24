import { Client, type Room } from '@colyseus/sdk';
import {
  ClientMsg,
  ROOM_NAME,
  ServerMsg,
  formatRoomCode,
  type CompetitionSettings,
  type Difficulty,
  type JoinOptions,
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
}

export interface LobbyView {
  code: string;
  phase: RoomPhase;
  players: LobbyPlayer[];
  maxPlayers: number;
  settings: CompetitionSettings;
  amHost: boolean;
  /** Kaikki muut kuin isäntä ovat valmiina. */
  allReady: boolean;
}

interface PlayerSchema {
  name: string;
  ready: boolean;
}

interface StateSchema {
  code: string;
  phase: string;
  hostId: string;
  seed: number;
  settings: { durationMinutes: number; difficulty: string; winRule: string; maxPlayers: number };
  players: Map<string, PlayerSchema>;
}

/** Yhteys yhteen huoneeseen. */
export class NetSession {
  onChange: ((view: LobbyView) => void) | null = null;
  onStarted: ((msg: StartedMessage, view: LobbyView) => void) | null = null;
  onError: ((message: string) => void) | null = null;
  /** Yhteys katkesi muusta syystä kuin omasta lähdöstä. */
  onDisconnect: (() => void) | null = null;
  private leaving = false;

  private constructor(readonly room: Room<unknown, StateSchema>) {
    room.onStateChange(() => {
      if (this.ready) this.onChange?.(this.view());
    });
    room.onMessage(ServerMsg.started, (m: StartedMessage) => this.onStarted?.(m, this.view()));
    room.onMessage(ServerMsg.error, (m: string) => this.onError?.(m));
    room.onLeave(() => {
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

  async leave(): Promise<void> {
    this.leaving = true;
    await this.room.leave(true).catch(() => undefined);
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
