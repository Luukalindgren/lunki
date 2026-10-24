import { Room, type Client } from '@colyseus/core';
import {
  ClientMsg,
  DEFAULT_MAX_PLAYERS,
  InputQueue,
  LUNKINJARVI,
  MAX_PLAYERS_LIMIT,
  NET_DT,
  Rng,
  ServerMsg,
  WaterBody,
  createTube,
  decodeInputs,
  distance,
  findLaunchPoint,
  isPlausibleSplash,
  sanitizeName,
  validateSettingsPatch,
  type InputMessage,
  type JoinOptions,
  type SplashMessage,
  type TubeState,
  type Vec2,
} from '@lunki/shared';
import { releaseCode, reserveCode } from './codes';
import { stepSims, type Sim } from './simulation';
import { LunkiState, PlayerState } from './state';

export interface CreateOptions extends Partial<JoinOptions> {
  maxPlayers?: number;
}

/** Järvi on sama kaikille huoneille. */
const water = new WaterBody(LUNKINJARVI);

/** Pelaajat aloittavat vähintään näin kaukana toisistaan (m), jos mahdollista. */
const SPAWN_SPACING = 15;
/** …ja samalta rannalta, korkeintaan näin kaukana ensimmäisestä (m). */
const SPAWN_RADIUS = 120;

/**
 * Yksi kilpailuhuone. Huoneen tunniste on lyhyt koodi (esim. 4F7K), jolla
 * kaverit liittyvät. Aulan jälkeen palvelin ajaa renkaiden liikkeen
 * 60 Hz:n askeleella ja lähettää tilan 20 kertaa sekunnissa.
 */
export class LunkiRoom extends Room<{ state: LunkiState }> {
  override state = new LunkiState();
  /** Palvelimen sisäinen tila pelaajittain (sessionId). */
  private readonly sims = new Map<string, Sim>();

  override onCreate(options: CreateOptions = {}) {
    const code = reserveCode();
    this.roomId = code;
    this.state.code = code;
    const max = Math.round(Number(options.maxPlayers) || DEFAULT_MAX_PLAYERS);
    this.state.settings.maxPlayers = Math.min(Math.max(max, 1), MAX_PLAYERS_LIMIT);
    this.maxClients = this.state.settings.maxPlayers;
    // Koodilla liitytään, joten huone ei näy julkisessa listassa.
    void this.setPrivate(true);
    // Syötteitä tulee 20 viestiä sekunnissa; reilu yläraja väärinkäytöksille.
    this.maxMessagesPerSecond = 60;

    this.onMessage(ClientMsg.input, (client, msg: InputMessage) => {
      const sim = this.sims.get(client.sessionId);
      const p = this.state.players.get(client.sessionId);
      if (!sim || !p || this.state.phase !== 'playing') return;
      sim.inputs.push(decodeInputs(msg?.i));
      const l = msg?.l;
      if (Array.isArray(l) && l.every((v) => typeof v === 'number' && Number.isFinite(v))) {
        // Vieheen sijainti on vain näytettävä; rajataan järkevälle alueelle.
        const lure = { x: l[0]!, y: l[1]! };
        const ok = distance(lure, sim.tube.pos) < 200;
        p.lureStage = ok ? Math.max(0, Math.min(3, Math.round(l[2]!))) : 0;
        if (ok) {
          p.lureX = lure.x;
          p.lureY = lure.y;
        }
      } else {
        p.lureStage = 0;
      }
    });

    this.onMessage(ClientMsg.splash, (client, msg: SplashMessage) => {
      const sim = this.sims.get(client.sessionId);
      if (!sim || this.state.phase !== 'playing') return;
      if (!isPlausibleSplash(sim.tube.pos, { x: Number(msg?.x), y: Number(msg?.y) }))
        client.send(ServerMsg.castRejected);
    });

    this.onMessage(ClientMsg.ready, (client, ready: unknown) => {
      const p = this.state.players.get(client.sessionId);
      if (p && this.state.phase === 'lobby') p.ready = ready === true;
    });

    this.onMessage(ClientMsg.settings, (client, patch: unknown) => {
      if (client.sessionId !== this.state.hostId || this.state.phase !== 'lobby') return;
      const valid = validateSettingsPatch(patch, this.state.players.size);
      const s = this.state.settings;
      let changed = false;
      for (const [key, value] of Object.entries(valid)) {
        if (key === 'species') {
          const list = value as string[];
          if (list.join() !== [...s.species].join()) {
            s.species.splice(0, s.species.length, ...list);
            changed = true;
          }
        } else if ((s as unknown as Record<string, unknown>)[key] !== value) {
          (s as unknown as Record<string, unknown>)[key] = value;
          changed = true;
        }
      }
      if (valid.maxPlayers !== undefined) {
        this.maxClients = valid.maxPlayers;
        void this.setMatchmaking({ maxClients: valid.maxPlayers });
      }
      // Muuttuneet säännöt: muiden pitää kuitata valmius uudelleen.
      if (changed) this.state.players.forEach((p) => (p.ready = false));
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
      this.spawnPlayers(this.state.seed);
      this.state.phase = 'playing';
      void this.lock();
      this.setFixedTimestep(() => this.step(), 1 / NET_DT);
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

  /**
   * Arpoo aloituspaikat rannan tuntumasta: kaikki samalle rannalle
   * (korkeintaan SPAWN_RADIUS päähän ensimmäisestä), toisistaan erilleen.
   */
  private spawnPlayers(seed: number) {
    const rng = new Rng(seed ^ 0x5bd1e995);
    const launch = () => findLaunchPoint(water, LUNKINJARVI.bounds, () => rng.next());
    const taken: Vec2[] = [];
    this.state.players.forEach((p, id) => {
      let pos = launch();
      if (taken.length > 0) {
        const fits = (q: Vec2) =>
          distance(q, taken[0]!) < SPAWN_RADIUS &&
          taken.every((t) => distance(t, q) >= SPAWN_SPACING);
        for (let k = 0; k < 400 && !fits(pos); k++) pos = launch();
      }
      taken.push(pos);
      // Selkä rantaan päin, katse järvelle.
      const shore = water.closestShorePoint(pos)?.point ?? pos;
      const tube = createTube(pos, Math.atan2(pos.y - shore.y, pos.x - shore.x));
      this.sims.set(id, { tube, inputs: new InputQueue() });
      writeTube(p, tube, 0);
    });
  }

  /** Yksi palvelimen askel (ks. stepSims). */
  private step() {
    const ids = [...this.sims.keys()];
    const sims = ids.map((id) => this.sims.get(id)!);
    for (const i of stepSims(sims, water)) {
      const p = this.state.players.get(ids[i]!);
      if (p) writeTube(p, sims[i]!.tube, sims[i]!.inputs.lastSeq);
    }
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

function writeTube(p: PlayerState, t: TubeState, ack: number) {
  p.x = t.pos.x;
  p.y = t.pos.y;
  p.vx = t.vel.x;
  p.vy = t.vel.y;
  p.heading = t.heading;
  p.angVel = t.angVel;
  p.kickPhase = t.kickPhase;
  p.ack = ack;
}
