import { Room, type Client } from '@colyseus/core';
import {
  ClientMsg,
  DEFAULT_MAX_PLAYERS,
  MAX_PLAYERS_LIMIT,
  ServerMsg,
  sanitizeName,
  type JoinOptions,
} from '@lunki/shared';
import { releaseCode, reserveCode } from './codes';
import { LunkiState, PlayerState } from './state';

export interface CreateOptions extends Partial<JoinOptions> {
  maxPlayers?: number;
}

/**
 * Yksi kilpailuhuone. Huoneen tunniste on lyhyt koodi (esim. 4F7K), jolla
 * kaverit liittyvät. Vaiheessa 2 huone hoitaa aulan; pelisilmukka tulee
 * issuessa #13.
 */
export class LunkiRoom extends Room<{ state: LunkiState }> {
  override state = new LunkiState();

  override onCreate(options: CreateOptions = {}) {
    const code = reserveCode();
    this.roomId = code;
    this.state.code = code;
    const max = Math.round(Number(options.maxPlayers) || DEFAULT_MAX_PLAYERS);
    this.state.settings.maxPlayers = Math.min(Math.max(max, 1), MAX_PLAYERS_LIMIT);
    this.maxClients = this.state.settings.maxPlayers;
    // Koodilla liitytään, joten huone ei näy julkisessa listassa.
    void this.setPrivate(true);

    this.onMessage(ClientMsg.ready, (client, ready: unknown) => {
      const p = this.state.players.get(client.sessionId);
      if (p && this.state.phase === 'lobby') p.ready = ready === true;
    });

    this.onMessage(ClientMsg.name, (client, name: unknown) => {
      const p = this.state.players.get(client.sessionId);
      if (p) p.name = sanitizeName(name);
    });

    this.onMessage(ClientMsg.start, (client) => {
      if (client.sessionId !== this.state.hostId) {
        client.send(ServerMsg.error, 'Vain huoneen luoja voi aloittaa kisan');
        return;
      }
      if (this.state.phase !== 'lobby') return;
      const notReady = [...this.state.players.entries()]
        .filter(([id, p]) => !p.ready && id !== this.state.hostId)
        .map(([, p]) => p);
      if (notReady.length > 0) {
        client.send(ServerMsg.error, `Odotetaan: ${notReady.map((p) => p.name).join(', ')}`);
        return;
      }
      this.state.seed = (Math.random() * 2 ** 32) >>> 0;
      this.state.phase = 'playing';
      void this.lock();
      this.broadcast(ServerMsg.started, { seed: this.state.seed });
    });
  }

  override onJoin(client: Client, options: Partial<JoinOptions> = {}) {
    const p = new PlayerState();
    p.playerId = typeof options.playerId === 'string' ? options.playerId.slice(0, 64) : '';
    p.name = this.uniqueName(sanitizeName(options.name));
    this.state.players.set(client.sessionId, p);
    if (!this.state.hostId) this.state.hostId = client.sessionId;
  }

  override onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    if (this.state.hostId === client.sessionId) {
      // Isännyys siirtyy seuraavaksi liittyneelle.
      this.state.hostId = this.state.players.keys().next().value ?? '';
    }
  }

  override onDispose() {
    releaseCode(this.state.code);
  }

  /** Lisää numeron, jos sama nimi on jo huoneessa. */
  private uniqueName(name: string): string {
    const taken = new Set([...this.state.players.values()].map((p) => p.name));
    if (!taken.has(name)) return name;
    for (let i = 2; ; i++) {
      const candidate = `${name.slice(0, 13)} ${i}`;
      if (!taken.has(candidate)) return candidate;
    }
  }
}
