import { Room, ServerError, type Client } from '@colyseus/core';
import {
  COUNTDOWN_SECONDS,
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
  findStartNear,
  isValidStart,
  BIG_WAVE,
  LureStage,
  TANGLE,
  findTangles,
  rodTip,
  bigWaveHeight,
  capsizes,
  isPenalty,
  planBigWaves,
  planWaterspouts,
  spoutAffects,
  spoutCapture,
  spoutWind,
  isWeatherLevel,
  penaltyOutcome,
  planLightning,
  planWeather,
  resolveStrike,
  weatherAt,
  windVector,
  isPlausibleCatch,
  isPlausibleSplash,
  SPECIES,
  type Catch,
  sanitizeName,
  validateSettingsPatch,
  parseTackle,
  parseAppearance,
  isFishTag,
  isLateJoin,
  JoinRefusal,
  RECORDS_PER_SPECIES,
  type Difficulty,
  type RecordMessage,
  type SpeciesId,
  type InputMessage,
  type JoinOptions,
  type BigWave,
  type BigWaveMessage,
  type UntangledMessage,
  CHAT_HISTORY,
  ChatLimiter,
  sanitizeChat,
  type ChatMessage,
  type Waterspout,
  type LightningMessage,
  type Penalty,
  type Strike,
  type SplashMessage,
  type TubeState,
  type Vec2,
  type WeatherPlan,
} from '@lunki/shared';
import { recordStore } from '../records';
import { releaseCode, reserveCode } from './codes';
import { FROZEN, stepSims, type Sim } from './simulation';
import { CatchState, LunkiState, PlayerState } from './state';

export interface CreateOptions extends Partial<JoinOptions> {
  maxPlayers?: number;
  /** Vain testeihin: lyhyempi lähtölaskenta ja kisa (s). */
  testTiming?: { countdown: number; duration: number };
}

/**
 * Näin kauan (s) katkenneen yhteyden paikka odottaa automaattista paluuta.
 * Sen jälkeenkin samalla selaimella (playerId) pääsee kisaan takaisin
 * huonekoodilla, ks. Seat.
 */
export const RECONNECT_SECONDS = Number(process.env.LUNKI_RECONNECT_SECONDS) || 60;

/** Kisasta lähteneen paikka: sama selain pääsee jatkamaan siitä. */
interface Seat {
  /** Lähtijän sessionId: saaliit siirretään palaajalle. */
  sessionId: string;
  name: string;
  outUntil: number;
  capsizedUntil: number;
  sim: Sim | null;
}

const playerIdOf = (options: Partial<JoinOptions>) =>
  typeof options.playerId === 'string' ? options.playerId.slice(0, 64) : '';

/** Järvi on sama kaikille huoneille. */
const water = new WaterBody(LUNKINJARVI);
const rings = [LUNKINJARVI.shore, ...LUNKINJARVI.islands];

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
  private countdownSeconds = COUNTDOWN_SECONDS;
  /** Kisan sää; sama suunnitelma lasketaan asiakkailla siemenestä. */
  private weather: WeatherPlan | null = null;
  /** Kisan salamat ja seuraavan indeksi. */
  private strikes: Strike[] = [];
  private nextStrike = 0;
  /** Kisan isot aallot ja seuraavan indeksi. */
  private bigWaves: BigWave[] = [];
  private nextWave = 0;
  /** Kisan trombit. */
  private spouts: Waterspout[] = [];
  /** Kelaako pelaaja juuri nyt (siimojen sotkeutumiseen). */
  private readonly reeling = new Map<string, boolean>();
  /** Selvityksen jälkeen siima ei sotkeudu heti uudelleen (kisa-aika, s). */
  private readonly tangleFree = new Map<string, number>();
  /** Kisassa nostetut kalat "paikka:sukupolvi" (FishTag). */
  private readonly caughtFish = new Set<string>();
  /** Viimeisimmät chat-viestit uusille tulijoille. */
  private readonly chatLog: ChatMessage[] = [];
  private chatId = 0;
  /** Chatin nopeusrajoitus pelaajittain (sessionId). */
  private readonly chatLimits = new Map<string, ChatLimiter>();
  /** Selaimen pysyvä tunniste pelaajittain (sessionId); ei jaeta muille. */
  private readonly playerIds = new Map<string, string>();
  /** Kesken kisan lähteneiden paikat (playerId); tyhjenee uuden kisan alkaessa. */
  private readonly seats = new Map<string, Seat>();
  /** Kisan ensimmäinen aloituspaikka: myöhästyneet aloittavat sen läheltä. */
  private spawnOrigin: Vec2 | null = null;
  /** Kehitystä varten: LUNKI_RACE_SECONDS lyhentää kaikki kisat. */
  private durationOverride: number | null = Number(process.env.LUNKI_RACE_SECONDS) || null;

  override onCreate(options: CreateOptions = {}) {
    if (process.env.VITEST && options.testTiming) {
      this.countdownSeconds = options.testTiming.countdown;
      this.durationOverride = options.testTiming.duration;
    }
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
      if (!sim || !p || this.state.phase === 'lobby') return;
      // Kaatunut rengas ei liiku omin voimin (asiakas lähettää samoin nollia).
      const inputs = decodeInputs(msg?.i);
      sim.inputs.push(
        this.capsized(client.sessionId) ? inputs.map((i) => ({ ...i, ...FROZEN })) : inputs,
      );
      const l = msg?.l;
      if (Array.isArray(l) && l.every((v) => typeof v === 'number' && Number.isFinite(v))) {
        // Vieheen sijainti on vain näytettävä; rajataan järkevälle alueelle.
        const lure = { x: l[0]!, y: l[1]! };
        const ok = distance(lure, sim.tube.pos) < 200;
        p.lureStage = ok ? Math.max(0, Math.min(3, Math.round(l[2]!))) : 0;
        this.reeling.set(client.sessionId, l[3] === 1);
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
      if (this.timedOut(client.sessionId)) {
        client.send(ServerMsg.castRejected);
        return;
      }
      if (isPlausibleSplash(sim.tube.pos, { x: Number(msg?.x), y: Number(msg?.y) }))
        sim.splashed = true;
      else client.send(ServerMsg.castRejected);
    });

    this.onMessage(ClientMsg.catch, (client, msg: Partial<Catch>) => {
      const sim = this.sims.get(client.sessionId);
      const now = this.state.clock;
      // Sama kala (paikka ja sukupolvi) voidaan nostaa vain kerran: ensimmäinen voittaa.
      const tag = isFishTag(msg?.fish) ? msg.fish : null;
      const fish = tag ? `${tag.slot}:${tag.gen}` : null;
      if (
        !sim ||
        this.state.phase !== 'playing' ||
        this.timedOut(client.sessionId) ||
        this.state.players.get(client.sessionId)?.tangledWith ||
        (fish && this.caughtFish.has(fish)) ||
        !isPlausibleCatch(msg, {
          splashedSinceLastCatch: sim.splashed,
          now,
          lastCatchAt: sim.lastCatchAt,
          species: [...this.state.settings.species],
        })
      ) {
        client.send(ServerMsg.catchRejected);
        return;
      }
      sim.splashed = false;
      sim.lastCatchAt = now;
      const c = new CatchState();
      c.player = client.sessionId;
      c.angler = this.state.players.get(client.sessionId)?.name ?? '';
      c.species = msg.species;
      c.name = SPECIES[msg.species].name;
      c.weight = Math.round(msg.weight * 1000) / 1000;
      c.time = now;
      if (tag) {
        c.fishSlot = tag.slot;
        c.fishGen = tag.gen;
        this.caughtFish.add(fish!);
      }
      this.state.catches.push(c);
      this.recordCatch(client.sessionId, c);
    });

    this.onMessage(ClientMsg.cutLine, (client) => {
      const p = this.state.players.get(client.sessionId);
      if (p?.tangledWith) this.untangle(client.sessionId, p.tangledWith, 'cut', client.sessionId);
    });

    this.onMessage(ClientMsg.landCut, (client) => {
      const p = this.state.players.get(client.sessionId);
      const sim = this.sims.get(client.sessionId);
      if (!p || !sim || this.state.phase !== 'playing') return;
      // Uuden vieheen solmiminen: kalastaa ei voi ennen sakon loppua.
      p.outUntil = Math.max(p.outUntil, this.state.clock + this.state.settings.landPenalty);
      p.lureStage = 0;
      sim.splashed = false;
    });

    this.onMessage(ClientMsg.tackle, (client, msg: unknown) => {
      const p = this.state.players.get(client.sessionId);
      const t = parseTackle(msg);
      if (!p || !t) return;
      p.rod = t.rod;
      p.lure = t.lure;
      p.line = t.line;
      p.leader = t.leader;
    });

    this.onMessage(ClientMsg.appearance, (client, msg: unknown) => {
      const p = this.state.players.get(client.sessionId);
      const a = parseAppearance(msg);
      if (!p || !a) return;
      p.tubeColor = a.tube;
      p.finColor = a.fins;
      p.shirtColor = a.shirt;
      p.lineColor = a.line;
    });

    this.onMessage(ClientMsg.restart, (client) => {
      if (client.sessionId !== this.state.hostId || this.state.phase !== 'finished') return;
      this.setTimestep();
      this.sims.clear();
      this.tangleFree.clear();
      this.caughtFish.clear();
      this.state.catches.clear();
      this.state.clock = 0;
      this.state.countdown = 0;
      this.state.players.forEach((p) => {
        p.ready = false;
        p.lureStage = 0;
        p.outUntil = 0;
        p.capsizedUntil = 0;
        p.tangledWith = '';
        p.untangle = 0;
      });
      this.seats.clear();
      this.spawnOrigin = null;
      this.state.phase = 'lobby';
    });

    this.onMessage(ClientMsg.chat, (client, text: unknown) => {
      const p = this.state.players.get(client.sessionId);
      const clean = sanitizeChat(text);
      if (!p || !clean) return;
      let limiter = this.chatLimits.get(client.sessionId);
      if (!limiter) this.chatLimits.set(client.sessionId, (limiter = new ChatLimiter()));
      if (!limiter.take(Date.now())) {
        client.send(ServerMsg.chatRejected);
        return;
      }
      const msg: ChatMessage = {
        id: ++this.chatId,
        from: client.sessionId,
        name: p.name,
        text: clean,
      };
      this.chatLog.push(msg);
      if (this.chatLog.length > CHAT_HISTORY) this.chatLog.shift();
      this.broadcast(ServerMsg.chat, msg);
    });

    // Uudemman asiakkaan tuntematon viesti ohitetaan: muuten Colyseus
    // katkaisisi yhteyden (tuotantotilassa käsittelijätön viesti = potku).
    this.onMessage('*', () => undefined);

    this.onMessage(ClientMsg.ready, (client, ready: unknown) => {
      const p = this.state.players.get(client.sessionId);
      if (p && this.state.phase === 'lobby') p.ready = ready === true;
    });

    this.onMessage(ClientMsg.settings, (client, patch: unknown) => {
      if (client.sessionId !== this.state.hostId || this.state.phase !== 'lobby') return;
      const valid = validateSettingsPatch(patch, this.state.players.size, (p) =>
        isValidStart(water, p),
      );
      const s = this.state.settings;
      let changed = false;
      for (const [key, value] of Object.entries(valid)) {
        if (key === 'start') {
          const start = value as Vec2 | null;
          const same = start
            ? s.customStart &&
              s.startX === Math.fround(start.x) &&
              s.startY === Math.fround(start.y)
            : !s.customStart;
          if (!same) {
            s.customStart = start !== null;
            s.startX = start?.x ?? 0;
            s.startY = start?.y ?? 0;
            changed = true;
          }
        } else if (key === 'species') {
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
      const level = this.state.settings.weather;
      this.weather = planWeather(
        this.state.seed,
        isWeatherLevel(level) ? level : 'realistic',
        this.durationOverride ?? this.state.settings.durationMinutes * 60,
      );
      this.state.sky = this.weather.segments[0]!.sky;
      this.strikes = planLightning(
        this.weather,
        this.state.seed,
        this.durationOverride ?? this.state.settings.durationMinutes * 60,
      );
      this.nextStrike = 0;
      this.bigWaves = planBigWaves(
        this.weather,
        this.state.seed,
        this.durationOverride ?? this.state.settings.durationMinutes * 60,
      );
      this.nextWave = 0;
      this.spouts = planWaterspouts(
        this.weather,
        this.state.seed,
        this.durationOverride ?? this.state.settings.durationMinutes * 60,
        water,
        LUNKINJARVI.bounds,
      );

      this.state.clock = 0;
      this.state.countdown = this.countdownSeconds;
      this.state.phase = 'countdown';
      this.setFixedTimestep(() => this.step(), 1 / NET_DT);
      this.broadcast(ServerMsg.started, { seed: this.state.seed });
    });
  }

  /** Aulaan pääsee aina; kisan alettua asetus lateJoin päättää. */
  override onAuth(_client: Client, options: Partial<JoinOptions> = {}) {
    if (this.state.phase === 'lobby') return true;
    const id = playerIdOf(options);
    const returning = id !== '' && (this.seats.has(id) || this.droppedSession(id) !== undefined);
    const rule = isLateJoin(this.state.settings.lateJoin) ? this.state.settings.lateJoin : 'open';
    if (rule === 'closed') throw new ServerError(4403, JoinRefusal.closed);
    if (returning) return true;
    if (rule === 'return') throw new ServerError(4403, JoinRefusal.returnOnly);
    // Lähteneiden paikat pidetään vapaana paluuta varten.
    if (this.state.players.size + this.seats.size >= this.state.settings.maxPlayers)
      throw new ServerError(4403, JoinRefusal.full);
    return true;
  }

  override onJoin(client: Client, options: Partial<JoinOptions> = {}) {
    const id = playerIdOf(options);
    const racing = this.state.phase !== 'lobby';
    if (id) this.playerIds.set(client.sessionId, id);
    // Sama selain uudesta välilehdestä: katkennut yhteys luovuttaa paikkansa.
    const dropped = racing && id ? this.droppedSession(id) : undefined;
    if (dropped) this.vacate(dropped);
    const seat = racing && id ? this.seats.get(id) : undefined;
    if (seat) this.seats.delete(id);
    const p = new PlayerState();
    p.name = this.uniqueName(seat?.name ?? sanitizeName(options.name));
    this.state.players.set(client.sessionId, p);
    if (!this.state.hostId) this.state.hostId = client.sessionId;
    if (seat) this.resumeSeat(client.sessionId, p, seat);
    else if (this.state.phase === 'countdown' || this.state.phase === 'playing')
      this.spawnLate(client.sessionId, p);
    client.send(ServerMsg.chatHistory, this.chatLog);
  }

  /** Katkennut (paluuta odottava) yhteys samalta selaimelta. */
  private droppedSession(playerId: string): string | undefined {
    for (const [sid, pid] of this.playerIds)
      if (pid === playerId && this.state.players.get(sid)?.connected === false) return sid;
    return undefined;
  }

  /** Palaaja jatkaa samasta kohdasta, samoilla jäähyillä ja saaliilla. */
  private resumeSeat(id: string, p: PlayerState, seat: Seat) {
    p.outUntil = seat.outUntil;
    p.capsizedUntil = seat.capsizedUntil;
    for (const c of this.state.catches) if (c.player === seat.sessionId) c.player = id;
    if (seat.sim) {
      const sim = { ...seat.sim, inputs: new InputQueue() };
      this.sims.set(id, sim);
      writeTube(p, sim.tube, 0);
    }
  }

  /** Uusi pelaaja kesken kisan: rannan tuntumaan muiden aloitusalueelle. */
  private spawnLate(id: string, p: PlayerState) {
    const origin = this.spawnOrigin ?? findLaunchPoint(water, LUNKINJARVI.bounds, Math.random);
    const others = [...this.sims.values()].map((s) => s.tube.pos);
    const free = (q: Vec2) => others.every((o) => distance(o, q) >= SPAWN_SPACING);
    let pos = findStartNear(water, origin, SPAWN_RADIUS / 2, Math.random);
    for (let k = 0; k < 400 && !free(pos); k++)
      pos = findStartNear(water, origin, SPAWN_RADIUS / 2, Math.random);
    this.placeTube(id, p, pos);
  }

  /** Rengas paikalleen selkä rantaan päin, katse järvelle. */
  private placeTube(id: string, p: PlayerState, pos: Vec2) {
    const shore = water.closestShorePoint(pos)?.point ?? pos;
    const tube = createTube(pos, Math.atan2(pos.y - shore.y, pos.x - shore.x));
    this.sims.set(id, {
      tube,
      inputs: new InputQueue(),
      splashed: false,
      lastCatchAt: -Infinity,
    });
    writeTube(p, tube, 0);
  }

  /** Yhteys katkesi ilman lähtöä: paikka pidetään hetken. */
  override onDrop(client: Client) {
    const p = this.state.players.get(client.sessionId);
    if (p) p.connected = false;
    // Rengas jää odottamaan; vanhat syötteet hylätään, kuittaus säilyy.
    this.sims.get(client.sessionId)?.inputs.clear();
    // Jos paluuta ei tule ajoissa, Colyseus kutsuu onLeave-metodia.
    // Huonetta suljettaessa paluuta ei voi enää sallia.
    try {
      this.allowReconnection(client, RECONNECT_SECONDS);
    } catch {
      // ei haittaa
    }
  }

  override onReconnect(client: Client) {
    const p = this.state.players.get(client.sessionId);
    // Paikka siirtyi jo uudelle yhteydelle samalta selaimelta.
    if (!p) return void client.leave();
    p.connected = true;
    // Katkon aikana tulleet viestit.
    client.send(ServerMsg.chatHistory, this.chatLog);
  }

  override onLeave(client: Client) {
    this.vacate(client.sessionId);
  }

  /** Pelaaja pois huoneesta; kisan aikana paikka jää odottamaan paluuta. */
  private vacate(id: string) {
    const p = this.state.players.get(id);
    // Paikka luovutettiin jo uudelle yhteydelle (ks. onJoin).
    if (!p) return;
    // Siima sotkussa lähtevän kanssa: toinen pääsee jatkamaan heti.
    if (p.tangledWith) this.untangle(id, p.tangledWith, 'cut', id);
    const playerId = this.playerIds.get(id);
    if (playerId && this.state.phase !== 'lobby')
      this.seats.set(playerId, {
        sessionId: id,
        name: p.name,
        outUntil: p.outUntil,
        capsizedUntil: p.capsizedUntil,
        sim: this.sims.get(id) ?? null,
      });
    this.playerIds.delete(id);
    this.state.players.delete(id);
    // Lähtijän rengas ei saa jäädä näkymättömäksi esteeksi.
    this.sims.delete(id);
    this.reeling.delete(id);
    this.tangleFree.delete(id);
    this.chatLimits.delete(id);
    if (this.state.hostId === id) {
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
   * Jos isäntä valitsi paikan kartalta, ensimmäinen aloittaa siitä ja muut
   * sen ympäriltä.
   */
  private spawnPlayers(seed: number) {
    const rng = new Rng(seed ^ 0x5bd1e995);
    const set = this.state.settings;
    const chosen = set.customStart ? { x: set.startX, y: set.startY } : null;
    const launch = () =>
      chosen
        ? findStartNear(water, chosen, SPAWN_RADIUS / 2, () => rng.next())
        : findLaunchPoint(water, LUNKINJARVI.bounds, () => rng.next());
    const taken: Vec2[] = [];
    this.state.players.forEach((p, id) => {
      let pos = taken.length === 0 && chosen ? { ...chosen } : launch();
      if (taken.length > 0) {
        const fits = (q: Vec2) =>
          distance(q, taken[0]!) < SPAWN_RADIUS &&
          taken.every((t) => distance(t, q) >= SPAWN_SPACING);
        for (let k = 0; k < 400 && !fits(pos); k++) pos = launch();
      }
      taken.push(pos);
      this.placeTube(id, p, pos);
    });
    this.spawnOrigin = taken[0] ?? null;
  }

  /** Yksi palvelimen askel: kisan kello ja renkaat (ks. stepSims). */
  private step() {
    const st = this.state;
    if (st.phase === 'countdown') {
      st.countdown = Math.max(0, st.countdown - NET_DT);
      if (st.countdown === 0) st.phase = 'playing';
    } else if (st.phase === 'playing') {
      const end = this.durationOverride ?? st.settings.durationMinutes * 60;
      st.clock = Math.min(end, st.clock + NET_DT);
      if (st.clock >= end) st.phase = 'finished';
    }
    const weather =
      this.weather && st.phase === 'playing' ? weatherAt(this.weather, st.clock) : null;
    if (weather) st.sky = weather.sky;
    if (st.phase === 'playing') this.strikeLightning();
    if (weather) this.breakBigWaves(weather.windSpeed, weather.windDir);
    const ids = [...this.sims.keys()];
    const sims = ids.map((id) => this.sims.get(id)!);
    const base = weather ? windVector(weather) : undefined;
    // Trombi lisää tuuleen imun ja pyörteen renkaan kohdalla.
    const wind = (sim: Sim, i: number) => {
      const until = st.players.get(ids[i]!)?.capsizedUntil ?? 0;
      if (!base || !spoutAffects(until, st.clock)) return base ?? { x: 0, y: 0 };
      const s = spoutWind(this.spouts, st.clock, sim.tube.pos);
      return { x: base.x + s.x, y: base.y + s.y };
    };
    for (const i of stepSims(sims, water, st.phase === 'countdown', base && wind)) {
      const p = this.state.players.get(ids[i]!);
      if (p) writeTube(p, sims[i]!.tube, sims[i]!.inputs.lastSeq);
    }
    if (st.phase === 'playing') {
      this.catchInSpouts();
      this.updateTangles();
    }
  }

  /**
   * Siimojen sotkeutuminen: vedessä olevat siimat (vavan kärjestä
   * vieheeseen) sotkeutuvat, kun ne ovat ristissä ja jompikumpi kelaa.
   * Sotku selviää, kun pelaajat kelaavat yhteensä TANGLE.untangleSeconds,
   * tai kun toinen katkaisee siimansa.
   */
  private updateTangles() {
    const st = this.state;
    for (const [id, p] of st.players) {
      if (!p.tangledWith || id > p.tangledWith) continue;
      const other = st.players.get(p.tangledWith);
      if (!other) {
        p.tangledWith = '';
        continue;
      }
      const holders =
        Number(this.reeling.get(id) ?? false) + Number(this.reeling.get(p.tangledWith) ?? false);
      p.untangle = other.untangle = Math.min(
        1,
        p.untangle + (holders * NET_DT) / TANGLE.untangleSeconds,
      );
      if (p.untangle >= 1) this.untangle(id, p.tangledWith, 'untangled', id);
    }
    const lines = [...this.sims.entries()].flatMap(([id, sim]) => {
      const p = st.players.get(id);
      if (!p || p.tangledWith || p.lureStage < LureStage.water) return [];
      // Asiakas kelaa siiman sisään vasta viestin saatuaan.
      if (st.clock < (this.tangleFree.get(id) ?? 0)) return [];
      return [
        {
          id,
          tip: rodTip(sim.tube.pos, sim.tube.heading),
          lure: { x: p.lureX, y: p.lureY },
          reeling: this.reeling.get(id) ?? false,
        },
      ];
    });
    for (const t of findTangles(lines)) {
      for (const [id, other] of [
        [t.a, t.b],
        [t.b, t.a],
      ] as const) {
        const p = st.players.get(id)!;
        p.tangledWith = other;
        p.tangleX = t.at.x;
        p.tangleY = t.at.y;
        p.untangle = 0;
      }
    }
  }

  /** Tallentaa punnitun saaliin ennätyksiin ja kertoo kaikille, jos se pääsi listalle. */
  private recordCatch(player: string, c: CatchState): void {
    const store = recordStore();
    if (!store) return;
    const species = c.species as SpeciesId;
    const place = store.add({
      species,
      weight: c.weight,
      angler: c.angler,
      difficulty: this.state.settings.difficulty as Difficulty,
      date: new Date().toISOString().slice(0, 10),
    });
    if (place > RECORDS_PER_SPECIES) return;
    const msg: RecordMessage = { player, angler: c.angler, species, weight: c.weight, place };
    this.broadcast(ServerMsg.record, msg);
  }

  private untangle(a: string, b: string, how: UntangledMessage['how'], by: string) {
    for (const id of [a, b]) {
      const p = this.state.players.get(id);
      if (p) {
        p.tangledWith = '';
        p.untangle = 0;
      }
      this.tangleFree.set(id, this.state.clock + 2);
    }
    const msg: UntangledMessage = { players: [a, b], how, by };
    this.broadcast(ServerMsg.untangled, msg);
  }

  /** Trombi nappaa liian lähelle tulleen: kaataa ja sinkoaa ulospäin. */
  private catchInSpouts() {
    const st = this.state;
    const victims: string[] = [];
    for (const [id, sim] of this.sims) {
      const p = st.players.get(id);
      if (!p || !spoutAffects(p.capsizedUntil, st.clock)) continue;
      const fling = spoutCapture(this.spouts, st.clock, sim.tube.pos);
      if (!fling) continue;
      victims.push(id);
      sim.tube = { ...sim.tube, vel: fling };
      writeTube(p, sim.tube, sim.inputs.lastSeq);
      p.capsizedUntil = st.clock + BIG_WAVE.recover;
      this.punish(id, isPenalty(st.settings.capsizePenalty) ? st.settings.capsizePenalty : 'none');
    }
    if (victims.length > 0) {
      const msg: BigWaveMessage = { victims };
      this.broadcast(ServerMsg.spout, msg);
    }
  }

  /** Kalastaa ei voi: salaman jäähy tai rengas kumollaan. */
  private timedOut(id: string): boolean {
    return this.state.clock < (this.state.players.get(id)?.outUntil ?? 0) || this.capsized(id);
  }

  private capsized(id: string): boolean {
    return this.state.clock < (this.state.players.get(id)?.capsizedUntil ?? 0);
  }

  /** Rangaistus osumasta: siima poikki, jäähy ja/tai saaliin menetys. */
  private punish(id: string, penalty: Penalty) {
    const st = this.state;
    const p = st.players.get(id);
    const sim = this.sims.get(id);
    if (!p || !sim) return;
    const outcome = penaltyOutcome(penalty, st.clock);
    p.outUntil = Math.max(p.outUntil, outcome.outUntil);
    p.lureStage = 0;
    sim.splashed = false;
    if (outcome.loseCatch)
      for (let i = st.catches.length - 1; i >= 0; i--)
        if (st.catches[i]!.player === id) st.catches.splice(i, 1);
  }

  /**
   * Isot aallot: kaatavat renkaan, jos aalto on tarpeeksi korkea renkaan
   * kohdalla ja tulee sivulta tai takaa (ks. capsizes).
   */
  private breakBigWaves(windSpeed: number, windDir: number) {
    const st = this.state;
    while (this.nextWave < this.bigWaves.length && this.bigWaves[this.nextWave]!.t <= st.clock) {
      this.nextWave++;
      const victims: string[] = [];
      for (const [id, sim] of this.sims) {
        const p = st.players.get(id);
        if (!p || this.capsized(id)) continue;
        const h = bigWaveHeight(rings, sim.tube.pos, windSpeed, windDir);
        if (!capsizes(sim.tube.heading, windDir, h)) continue;
        victims.push(id);
        p.capsizedUntil = st.clock + BIG_WAVE.recover;
        this.punish(
          id,
          isPenalty(st.settings.capsizePenalty) ? st.settings.capsizePenalty : 'none',
        );
      }
      const msg: BigWaveMessage = { victims };
      this.broadcast(ServerMsg.bigWave, msg);
    }
  }

  /**
   * Salamat kisan kellon mukaan. Osuma on mahdollinen vain, jos vapa on
   * ylhäällä (viehe heitossa, vedessä tai kala kiinni); siima palaa aina
   * poikki, ja valittu rangaistus seuraa.
   */
  private strikeLightning() {
    const st = this.state;
    while (this.nextStrike < this.strikes.length && this.strikes[this.nextStrike]!.t <= st.clock) {
      const strike = this.strikes[this.nextStrike++]!;
      const targets = [...this.sims.entries()].map(([id, sim]) => ({
        id,
        pos: sim.tube.pos,
        rodUp: (st.players.get(id)?.lureStage ?? 0) !== 0 && !this.timedOut(id),
      }));
      const result = resolveStrike(strike, targets, water, LUNKINJARVI.bounds);
      const penalty = isPenalty(st.settings.lightningPenalty)
        ? st.settings.lightningPenalty
        : 'none';
      for (const id of result.victims) this.punish(id, penalty);
      const msg: LightningMessage = { x: result.pos.x, y: result.pos.y, victims: result.victims };
      this.broadcast(ServerMsg.lightning, msg);
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
  p.stamina = t.stamina;
  p.ack = ack;
}
