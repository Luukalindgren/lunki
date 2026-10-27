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
  bigWaveDir,
  bigWaveHeight,
  capsizes,
  boatCapsizes,
  BOAT_PROTOCOL,
  BoatSeat,
  seatPos,
  type Craft,
  isPenalty,
  planBigWaves,
  planWaterspouts,
  SPOUT,
  activeSpouts,
  spoutAffects,
  spoutCapture,
  spoutLanding,
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
  recordTackle,
  DEFAULT_TACKLE,
  type Tackle,
  parseAppearance,
  isFishTag,
  FISH_COUNT,
  LUNKINJARVI_BOTTOM,
  LakeBottom,
  catchRadius,
  DIFFICULTIES,
  createFishPopulation,
  fishHome,
  stockWeight,
  type FishPopulation,
  isLateJoin,
  JoinRefusal,
  RECORDS_PER_SPECIES,
  type Difficulty,
  type TimeOfDay,
  type RecordMessage,
  type SpeciesId,
  type InputMessage,
  type JoinOptions,
  type RoomError,
  type BigWave,
  type BigWaveMessage,
  type SpoutMessage,
  type UntangledMessage,
  CHAT_HISTORY,
  ChatLimiter,
  EMOTE_RATE,
  isEmoteId,
  type EmoteMessage,
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
import { moveToBoat, packCrews } from './crews';
import { FROZEN, followBoat, isPassenger, rowerOf, stepSims, type Sim } from './simulation';
import { CatchState, LunkiState, PlayerState } from './state';

/** Pelaajan varusteet tilasta (ennätyksiin). */
const playerTackle = (p: PlayerState): Tackle =>
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
  }) ?? DEFAULT_TACKLE;

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

/**
 * Viestiraja sekunnissa pelaajaa kohden. Syötteitä tulee 20 viestiä sekunnissa,
 * mutta kun yhteys jumittuu hetkeksi (puhelimen verkko, tunnelin hikka),
 * jumin aikana lähetetyt viestit saapuvat yhtenä ryöppynä. Ping katkaisee
 * hiljaisen yhteyden noin 6–9 sekunnissa, joten raja on sitä pidemmän jumin
 * ryöpylle mitoitettu: muuten Colyseus potkaisisi pelaajan pois ilman paluuta.
 * Syötejono rajaa liikkeen joka tapauksessa (MAX_INPUT_QUEUE).
 */
export const MAX_MESSAGES_PER_SECOND = 400;

/**
 * Katsojapaikat kalastajien lisäksi. Colyseuksen `maxClients` laskee kaikki
 * yhteydet, joten ilman varaa katsoja täyttäisi lähteneen kalastajan paikan.
 */
export const SPECTATOR_SLOTS = 8;

/** Kisasta lähteneen paikka: sama selain pääsee jatkamaan siitä. */
interface Seat {
  /** Lähtijän sessionId: saaliit siirretään palaajalle. */
  sessionId: string;
  name: string;
  outUntil: number;
  capsizedUntil: number;
  sim: Sim | null;
  /** Venekisa: vene ja paikka lähtiessä (palaaja yrittää samaan veneeseen). */
  boat: number;
  seat: number;
}

const playerIdOf = (options: Partial<JoinOptions>) =>
  typeof options.playerId === 'string' ? options.playerId.slice(0, 64) : '';

/** Järvi on sama kaikille huoneille. */
const water = new WaterBody(LUNKINJARVI);
const rings = [LUNKINJARVI.shore, ...LUNKINJARVI.islands];

/** Järven pohja kalojen sijoittelua varten; lasketaan ensimmäisen kisan alkaessa. */
let bottom: LakeBottom | null = null;
const fishWorld = () => {
  bottom ??= new LakeBottom(
    water,
    LUNKINJARVI.bounds,
    LUNKINJARVI_BOTTOM,
    LUNKINJARVI.reeds,
    LUNKINJARVI.piers,
  );
  const b = bottom;
  return {
    isWater: (p: Vec2) => water.isWater(p),
    depthAt: (p: Vec2) => b.depthAt(p),
    structures: b.structures,
  };
};

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
  /**
   * Kisan kalakanta sellaisena kuin se alkoi: samat kalat kuin pelaajien
   * koneilla. Palvelin ottaa saaliin lajin, painon ja kotipaikan tästä.
   */
  private stock: FishPopulation | null = null;
  /** Montako kertaa kunkin paikan kala on nostettu (= nykyinen sukupolvi). */
  private readonly fishGens = new Map<number, number>();
  /** Viimeisimmät chat-viestit uusille tulijoille. */
  private readonly chatLog: ChatMessage[] = [];
  private chatId = 0;
  /** Chatin nopeusrajoitus pelaajittain (sessionId). */
  private readonly chatLimits = new Map<string, ChatLimiter>();
  /** Käsimerkkien nopeusrajoitus pelaajittain (sessionId). */
  private readonly emoteLimits = new Map<string, ChatLimiter>();
  /** Asiakkaan protokollaversio pelaajittain (sessionId): vanha ei osaa venekisaa. */
  private readonly protocols = new Map<string, number>();
  /** Selaimen pysyvä tunniste pelaajittain (sessionId); ei jaeta muille. */
  private readonly playerIds = new Map<string, string>();
  /** Kesken kisan lähteneiden paikat (playerId); tyhjenee uuden kisan alkaessa. */
  private readonly seats = new Map<string, Seat>();
  /** Kesken kisan katsojiksi tulleet: uudessa kisassa he ovat kalastajia. */
  private readonly lateSpectators = new Set<string>();
  /** Kisan aikana vapaa ei enää vaihdeta: istunnot, joiden vapa on lukittu. */
  private readonly rodFixed = new Set<string>();
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
    this.maxClients = this.state.settings.maxPlayers + SPECTATOR_SLOTS;
    // Koodilla liitytään, joten huone ei näy julkisessa listassa.
    void this.setPrivate(true);
    this.maxMessagesPerSecond = MAX_MESSAGES_PER_SECOND;

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
        const stage = ok ? Math.max(0, Math.min(3, Math.round(l[2]!))) : 0;
        // Kala tarttui: paikka talteen saaliin tarkistusta varten.
        if (stage === LureStage.hooked && p.lureStage !== LureStage.hooked) sim.hookAt = lure;
        p.lureStage = stage;
        // Venekisassa soutaja ei voi soutaa, kun viehe on ilmassa tai vedessä.
        sim.fishing = stage !== LureStage.none;
        this.reeling.set(client.sessionId, l[3] === 1);
        if (ok) {
          p.lureX = lure.x;
          p.lureY = lure.y;
        }
      } else {
        p.lureStage = 0;
        sim.fishing = false;
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
      // Asiakas kertoo vain, mikä kala nousi; laji ja paino tulevat kalakannasta.
      // Sama kala (paikka ja sukupolvi) voidaan nostaa vain kerran: ensimmäinen voittaa.
      const tag = isFishTag(msg?.fish) ? msg.fish : null;
      const stock = this.stock;
      const fish = tag && stock ? stock.fish[tag.slot] : undefined;
      const current = tag && tag.gen === (this.fishGens.get(tag.slot) ?? 0);
      const home = fish && current ? fishHome(stock!, tag.slot, tag.gen) : null;
      const landed = fish && {
        species: fish.species,
        name: SPECIES[fish.species].name,
        weight: stockWeight(stock!, tag!.slot, tag!.gen),
      };
      const hookAt = sim?.hookAt;
      if (sim) sim.hookAt = null;
      if (
        !sim ||
        this.state.phase !== 'playing' ||
        this.timedOut(client.sessionId) ||
        this.state.players.get(client.sessionId)?.tangledWith ||
        !landed ||
        !home ||
        !hookAt ||
        distance(hookAt, home) >
          catchRadius(
            landed.species,
            DIFFICULTIES[this.state.settings.difficulty as Difficulty] ?? DIFFICULTIES.normal,
          ) ||
        !isPlausibleCatch(landed, {
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
      c.species = landed.species;
      c.name = landed.name;
      c.weight = landed.weight;
      c.time = now;
      c.fishSlot = tag!.slot;
      c.fishGen = tag!.gen;
      c.boat = sim.boat ?? 0;
      this.fishGens.set(tag!.slot, tag!.gen + 1);
      this.state.catches.push(c);
      this.recordCatch(client.sessionId, c, hookAt);
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
      sim.fishing = false;
      sim.splashed = false;
    });

    this.onMessage(ClientMsg.tackle, (client, msg: unknown) => {
      const p = this.state.players.get(client.sessionId);
      const t = parseTackle(msg);
      if (!p || !t) return;
      // Vavat valitaan ennen kisaa; kesken kisan tullut saa valita ne kerran.
      // Virvelin ja perhon välillä voi vaihtaa kesken kisan.
      if (this.state.phase === 'lobby' || !this.rodFixed.has(client.sessionId)) {
        p.rod = t.rod;
        p.flyRod = t.flyRod;
      }
      if (this.state.phase !== 'lobby') this.rodFixed.add(client.sessionId);
      p.lure = t.lure;
      p.line = t.line;
      p.leader = t.leader;
      p.method = t.method;
      p.flyLine = t.flyLine;
      p.flyLeader = t.flyLeader;
      p.fly = t.fly;
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
      this.stock = null;
      this.fishGens.clear();
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
      // Kesken kisan tulleet katsojat pääsevät nyt mukaan; aulassa itse katsojaksi
      // valinneet katsovat edelleen.
      for (const id of this.lateSpectators) {
        const p = this.state.players.get(id);
        if (p && this.anglerCount() < this.state.settings.maxPlayers) p.spectator = false;
      }
      this.lateSpectators.clear();
      this.rodFixed.clear();
      this.state.phase = 'lobby';
      // Kesken kisan tulleet saivat omat veneensä: numerot taas järjestykseen.
      this.packCrews();
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

    // Käsimerkki muille: tunnettu ele ja rajattu tiheys. Eleitä ei tallenneta.
    this.onMessage(ClientMsg.emote, (client, emote: unknown) => {
      if (!this.state.players.has(client.sessionId) || !isEmoteId(emote)) return;
      let limiter = this.emoteLimits.get(client.sessionId);
      if (!limiter) this.emoteLimits.set(client.sessionId, (limiter = new ChatLimiter(EMOTE_RATE)));
      if (!limiter.take(Date.now())) return;
      const msg: EmoteMessage = { from: client.sessionId, emote };
      this.broadcast(ServerMsg.emote, msg, { except: client });
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
      const valid = validateSettingsPatch(patch, this.anglerCount(), (p) => isValidStart(water, p));
      // Vanha asiakas ei osaa venekisaa: ennen päivitystä kisa pysyy renkailla.
      if (valid.craft === 'boat' && this.hasOutdatedClient()) delete valid.craft;
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
        this.maxClients = valid.maxPlayers + SPECTATOR_SLOTS;
        void this.setMatchmaking({ maxClients: this.maxClients });
      }
      // Muuttuneet säännöt: muiden pitää kuitata valmius uudelleen.
      if (changed) this.state.players.forEach((p) => (p.ready = false));
      if (valid.craft !== undefined) this.packCrews();
    });

    // Venekisan aulassa: siirto toisen veneeseen tai omaan uuteen veneeseen (#263).
    this.onMessage(ClientMsg.boat, (client, boat: unknown) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || p.spectator || this.state.phase !== 'lobby' || this.craft !== 'boat') return;
      const anglers = [...this.state.players.entries()].filter(([, q]) => !q.spectator);
      const moved = moveToBoat(
        anglers.map(([id, q]) => ({ id, boat: q.boat, seat: q.seat })),
        client.sessionId,
        typeof boat === 'number' ? boat : -1,
      );
      if (!moved) return;
      moved.forEach((c, i) => {
        const q = anglers[i]![1];
        // Joukkue muuttui: siirtyjän ja veneiden miehistön pitää kuitata valmius uudelleen.
        if (q.boat !== c.boat || c.id === client.sessionId) q.ready = false;
        q.boat = c.boat;
        q.seat = c.seat;
      });
    });

    this.onMessage(ClientMsg.spectate, (client, on: unknown) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || this.state.phase !== 'lobby') return;
      // Kalastajaksi vain, jos kalastajapaikkoja on vapaana.
      if (on !== true && p.spectator && this.anglerCount() >= this.state.settings.maxPlayers)
        return;
      p.spectator = on === true;
      p.ready = false;
      this.lateSpectators.delete(client.sessionId);
      this.packCrews();
    });

    this.onMessage(ClientMsg.name, (client, name: unknown) => {
      const p = this.state.players.get(client.sessionId);
      if (p) p.name = sanitizeName(name);
    });

    this.onMessage(ClientMsg.start, (client) => {
      if (client.sessionId !== this.state.hostId) {
        client.send(ServerMsg.error, { code: 'host-only' } satisfies RoomError);
        return;
      }
      if (this.state.phase !== 'lobby') return;
      const anglers = [...this.state.players.entries()].filter(([, p]) => !p.spectator);
      if (anglers.length === 0) {
        client.send(ServerMsg.error, { code: 'need-angler' } satisfies RoomError);
        return;
      }
      // Katkennutta ei odoteta: palatessaan hän jatkaa kisassa (#275).
      const notReady = anglers
        .filter(([id, p]) => !p.ready && p.connected && id !== this.state.hostId)
        .map(([, p]) => p);
      if (notReady.length > 0) {
        client.send(ServerMsg.error, {
          code: 'not-ready',
          names: notReady.map((p) => p.name),
        } satisfies RoomError);
        return;
      }
      this.state.seed = (Math.random() * 2 ** 32) >>> 0;
      this.spawnPlayers(this.state.seed);
      // Sama kalakanta kuin pelaajilla (SoloGame: Rng(seed) ja huoneen lajisto).
      this.stock = createFishPopulation(
        fishWorld(),
        LUNKINJARVI.bounds,
        new Rng(this.state.seed),
        FISH_COUNT,
        [...this.state.settings.species] as SpeciesId[],
      );
      this.fishGens.clear();
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
      for (const id of this.state.players.keys()) this.rodFixed.add(id);
      this.state.phase = 'countdown';
      this.setFixedTimestep(() => this.step(), 1 / NET_DT);
      this.broadcast(ServerMsg.started, { seed: this.state.seed });
    });
  }

  /**
   * Aulaan pääsee aina; kisan alettua asetus lateJoin päättää. Jos kisaan ei
   * pääse ja asiakas pyysi (JoinOptions.spectate), liitytään katsojaksi.
   */
  override onAuth(_client: Client, options: Partial<JoinOptions> = {}) {
    // Oma katkennut paikka (sama selain) vapautuu liittyessä, joten sitä ei lasketa (#309).
    const own = this.droppedSession(playerIdOf(options));
    const ownSeat = own !== undefined && !this.state.players.get(own)?.spectator ? 1 : 0;
    const outdated = this.craft === 'boat' && clientProtocol(options) < BOAT_PROTOCOL;
    // Vanha asiakas ei osaa piirtää venettä eikä istua kyydissä.
    if (outdated) throw new ServerError(4403, JoinRefusal.outdated);
    const refusal =
      this.state.phase === 'lobby'
        ? this.anglerCount() - ownSeat >= this.state.settings.maxPlayers
          ? JoinRefusal.full
          : null
        : this.lateJoinRefusal(options);
    if (!refusal) return true;
    if (options.spectate === true && this.spectatorCount() < SPECTATOR_SLOTS)
      return { spectator: true };
    throw new ServerError(4403, refusal);
  }

  /** Kisan alus: kelluntarenkaat tai veneet (#263). */
  private get craft(): Craft {
    return this.state.settings.craft === 'boat' ? 'boat' : 'tube';
  }

  /** Joku huoneessa käyttää asiakasta, joka ei osaa venekisaa. */
  private hasOutdatedClient(): boolean {
    for (const id of this.state.players.keys())
      if ((this.protocols.get(id) ?? 0) < BOAT_PROTOCOL) return true;
    return false;
  }

  /**
   * Aulan veneet järjestykseen (ks. packCrews): uudelle oma vene, lähteneen
   * paikka täyttyy. Rengaskisassa ja katsojilla ei ole venettä.
   */
  private packCrews() {
    const anglers: [string, PlayerState][] = [];
    this.state.players.forEach((p, id) => {
      if (this.craft === 'boat' && !p.spectator) anglers.push([id, p]);
      else p.boat = p.seat = 0;
    });
    packCrews(anglers.map(([id, p]) => ({ id, boat: p.boat, seat: p.seat }))).forEach((c, i) => {
      const p = anglers[i]![1];
      p.boat = c.boat;
      p.seat = c.seat;
    });
  }

  /** Kalastajat huoneessa (katkenneet mukaan lukien, katsojat pois). */
  private anglerCount(): number {
    let n = 0;
    this.state.players.forEach((p) => (n += p.spectator ? 0 : 1));
    return n;
  }

  private spectatorCount(): number {
    return this.state.players.size - this.anglerCount();
  }

  /** Syy, miksi kisaan ei pääse kesken kaiken; null = pääsee. */
  private lateJoinRefusal(options: Partial<JoinOptions>): string | null {
    const id = playerIdOf(options);
    const returning = this.isReturning(id);
    const rule = isLateJoin(this.state.settings.lateJoin) ? this.state.settings.lateJoin : 'open';
    if (rule === 'closed') return JoinRefusal.closed;
    if (returning) return null;
    if (rule === 'return') return JoinRefusal.returnOnly;
    // Lähteneiden paikat pidetään vapaana paluuta varten.
    if (this.anglerCount() + this.seats.size >= this.state.settings.maxPlayers)
      return JoinRefusal.full;
    return null;
  }

  override onJoin(client: Client, options: Partial<JoinOptions> = {}, auth?: unknown) {
    const id = playerIdOf(options);
    const racing = this.state.phase !== 'lobby';
    if (id) this.playerIds.set(client.sessionId, id);
    this.protocols.set(client.sessionId, clientProtocol(options));
    // Päättyneeseen kisaan tullut katsoo tuloksia ja pääsee mukaan uuteen
    // kisaan; muuten hän näkyisi tuloksissa ilman rengasta (#279).
    const afterEnd = this.state.phase === 'finished' && !this.isReturning(id);
    if ((auth as { spectator?: boolean } | undefined)?.spectator || afterEnd) {
      // Katsoja ei saa rengasta eikä vie lähteneen paikkaa.
      const p = new PlayerState();
      p.name = this.uniqueName(sanitizeName(options.name));
      p.spectator = true;
      this.state.players.set(client.sessionId, p);
      // Kesken kisan tullut on uudessa kisassa kalastaja; aulassa voi itse vaihtaa.
      if (racing) this.lateSpectators.add(client.sessionId);
      if (!this.state.hostId) this.state.hostId = client.sessionId;
      client.send(ServerMsg.chatHistory, this.chatLog);
      return;
    }
    // Sama selain uudesta välilehdestä: katkennut yhteys luovuttaa paikkansa,
    // myös aulassa, ettei sinne jää haamua ja kaksoisnimeä (#309).
    const dropped = id ? this.droppedSession(id) : undefined;
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
    else if (!racing) this.packCrews();
    client.send(ServerMsg.chatHistory, this.chatLog);
  }

  /** Kisassa ollut palaa: paikka odottaa tai yhteys on vielä katkenneena. */
  private isReturning(playerId: string): boolean {
    return (
      playerId !== '' && (this.seats.has(playerId) || this.droppedSession(playerId) !== undefined)
    );
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
      const sim: Sim = { ...seat.sim, inputs: new InputQueue() };
      if (sim.boat) this.reboard(sim, seat);
      this.sims.set(id, sim);
      p.boat = sim.boat ?? 0;
      p.seat = sim.seat ?? 0;
      writeTube(p, sim.tube, 0);
    }
  }

  /**
   * Venekisaan palaaja istuu entiseen veneeseensä, jos siinä on tilaa
   * (mieluiten omalle paikalleen). Tyhjän veneen hän soutaa itse, ja
   * täydestä veneestä jäänyt saa oman veneen siihen, missä hän lähti.
   */
  private reboard(sim: Sim, seat: Seat) {
    const crew = [...this.sims.values()].filter((s) => s.boat === seat.boat);
    const boat = rowerOf(crew, seat.boat);
    if (!boat) {
      sim.seat = BoatSeat.rower;
      return;
    }
    const taken = new Set(crew.map((s) => s.seat ?? 0));
    const free = [seat.seat, BoatSeat.stern, BoatSeat.bow].find(
      (k) => k !== BoatSeat.rower && !taken.has(k),
    );
    if (free === undefined) {
      sim.boat = this.newBoatNumber();
      sim.seat = BoatSeat.rower;
      return;
    }
    sim.seat = free;
    sim.tube = followBoat(sim.tube, boat.tube, free);
  }

  /** Kesken kisan tulleen oma vene: seuraava vapaa numero. */
  private newBoatNumber(): number {
    let max = 0;
    for (const s of this.sims.values()) max = Math.max(max, s.boat ?? 0);
    for (const s of this.seats.values()) max = Math.max(max, s.boat);
    return max + 1;
  }

  /** Uusi pelaaja kesken kisan: rannan tuntumaan muiden aloitusalueelle. */
  private spawnLate(id: string, p: PlayerState) {
    const origin = this.spawnOrigin ?? findLaunchPoint(water, LUNKINJARVI.bounds, Math.random);
    const others = [...this.sims.values()].map((s) => s.tube.pos);
    const free = (q: Vec2) => others.every((o) => distance(o, q) >= SPAWN_SPACING);
    let pos = findStartNear(water, origin, SPAWN_RADIUS / 2, Math.random);
    for (let k = 0; k < 400 && !free(pos); k++)
      pos = findStartNear(water, origin, SPAWN_RADIUS / 2, Math.random);
    this.placeTube(id, p, pos, this.craft === 'boat' ? this.newBoatNumber() : 0);
  }

  /**
   * Rengas paikalleen selkä rantaan päin, katse järvelle. Venekisassa (`boat`
   * 1…) vene keula järvelle, jotta soutaja pääsee suoraan ulos; soutaja katsoo
   * perään eli rantaan.
   */
  private placeTube(id: string, p: PlayerState, pos: Vec2, boat = 0) {
    const shore = water.closestShorePoint(pos)?.point ?? pos;
    const out = Math.atan2(pos.y - shore.y, pos.x - shore.x);
    const tube = createTube(pos, boat ? out + Math.PI : out);
    this.sims.set(id, {
      tube,
      inputs: new InputQueue(),
      splashed: false,
      lastCatchAt: -Infinity,
      ...(boat && { boat, seat: BoatSeat.rower }),
    });
    p.boat = boat;
    p.seat = BoatSeat.rower;
    writeTube(p, tube, 0);
  }

  /** Kalastaja veneen kyytiin paikalleen, katse järvelle. */
  private seatPassenger(id: string, p: PlayerState, boat: Sim, seat: number) {
    const tube = createTube(seatPos(boat.tube, seat), boat.tube.heading + Math.PI);
    this.sims.set(id, {
      tube,
      inputs: new InputQueue(),
      splashed: false,
      lastCatchAt: -Infinity,
      boat: boat.boat,
      seat,
    });
    p.boat = boat.boat!;
    p.seat = seat;
    writeTube(p, tube, 0);
  }

  /** Yhteys katkesi ilman lähtöä: paikka pidetään hetken. */
  override onDrop(client: Client) {
    const p = this.state.players.get(client.sessionId);
    if (p) p.connected = false;
    // Aulassa ja tulossivulla muut eivät voi odottaa isännän paluuta (#275).
    if (client.sessionId === this.state.hostId && this.state.phase !== 'playing') this.passHost();
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
    this.lateSpectators.delete(id);
    // Katsojalla ei ole paikkaa, jota pitää vapaana.
    if (playerId && this.state.phase !== 'lobby' && !p.spectator)
      this.seats.set(playerId, {
        sessionId: id,
        name: p.name,
        outUntil: p.outUntil,
        capsizedUntil: p.capsizedUntil,
        sim: this.sims.get(id) ?? null,
        boat: p.boat,
        seat: p.seat,
      });
    this.playerIds.delete(id);
    this.protocols.delete(id);
    this.state.players.delete(id);
    // Lähtevän soutajan vene jää kyytiläisille: seuraava tarttuu airoihin.
    const sim = this.sims.get(id);
    if (sim?.boat && !isPassenger(sim)) this.passOars(id, sim);
    // Lähtijän rengas ei saa jäädä näkymättömäksi esteeksi.
    this.sims.delete(id);
    this.reeling.delete(id);
    this.tangleFree.delete(id);
    this.chatLimits.delete(id);
    this.emoteLimits.delete(id);
    if (this.state.hostId === id) this.passHost(true);
    if (this.state.phase === 'lobby') this.packCrews();
  }

  /** Soutajan paikalle veneen seuraava kalastaja; vene jatkaa samasta tilasta. */
  private passOars(id: string, rower: Sim) {
    const next = [...this.sims.entries()]
      .filter(([other, s]) => other !== id && s.boat === rower.boat)
      .sort(([, a], [, b]) => (a.seat ?? 0) - (b.seat ?? 0))[0];
    if (!next) return;
    const [nextId, sim] = next;
    sim.tube = { ...rower.tube, stamina: sim.tube.stamina };
    sim.seat = BoatSeat.rower;
    const p = this.state.players.get(nextId);
    if (p) {
      p.seat = BoatSeat.rower;
      writeTube(p, sim.tube, sim.inputs.lastSeq);
    }
  }

  /**
   * Isännyys seuraavaksi liittyneelle yhteydessä olevalle, mieluiten
   * kalastajalle. Jos kukaan muu ei ole yhteydessä, isäntä pysyy (tai
   * lähtiessä siirtyy kenelle tahansa jäljellä olevalle).
   */
  private passHost(leaving = false) {
    const others = [...this.state.players.entries()].filter(([id]) => id !== this.state.hostId);
    const next =
      others.find(([, p]) => p.connected && !p.spectator) ??
      others.find(([, p]) => p.connected) ??
      (leaving ? others[0] : undefined);
    if (next) this.state.hostId = next[0];
    else if (leaving) this.state.hostId = '';
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
    // Venekisassa aloituspaikka veneittäin: soutaja paikalleen, kyytiläiset hänen veneeseensä.
    const boats = this.craft === 'boat';
    if (boats) this.packCrews();
    const crews = new Map<number, [string, PlayerState][]>();
    this.state.players.forEach((p, id) => {
      if (p.spectator || !boats || p.seat === BoatSeat.rower) return;
      crews.set(p.boat, [...(crews.get(p.boat) ?? []), [id, p]]);
    });
    this.state.players.forEach((p, id) => {
      if (p.spectator || (boats && p.seat !== BoatSeat.rower)) return;
      let pos = taken.length === 0 && chosen ? { ...chosen } : launch();
      if (taken.length > 0) {
        const fits = (q: Vec2) =>
          distance(q, taken[0]!) < SPAWN_RADIUS &&
          taken.every((t) => distance(t, q) >= SPAWN_SPACING);
        for (let k = 0; k < 400 && !fits(pos); k++) pos = launch();
      }
      taken.push(pos);
      this.placeTube(id, p, pos, boats ? p.boat : 0);
      const rower = this.sims.get(id)!;
      for (const [mate, q] of crews.get(p.boat) ?? []) this.seatPassenger(mate, q, rower, q.seat);
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
      if (st.clock >= end) {
        st.phase = 'finished';
        // Kisan aikana katkennut isäntä ei saa estää uutta kisaa.
        if (!st.players.get(st.hostId)?.connected) this.passHost();
      }
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
      return spoutWind(base, this.spouts, st.clock, sim.tube.pos);
    };
    for (const i of stepSims(sims, water, st.phase === 'countdown', base && wind, this.craft)) {
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

  /**
   * Tallentaa punnitun saaliin ennätyksiin saantipaikan, varusteiden ja
   * olosuhteiden kera ja kertoo kaikille, jos se pääsi listalle.
   */
  private recordCatch(player: string, c: CatchState, at: Vec2): void {
    const store = recordStore();
    if (!store) return;
    const st = this.state;
    const species = c.species as SpeciesId;
    const p = st.players.get(player);
    const weather = this.weather ? weatherAt(this.weather, c.time) : null;
    const now = new Date().toISOString();
    const place = store.add({
      species,
      weight: c.weight,
      angler: c.angler,
      difficulty: st.settings.difficulty as Difficulty,
      date: now.slice(0, 10),
      at: now,
      x: Math.round(at.x * 10) / 10,
      y: Math.round(at.y * 10) / 10,
      raceTime: Math.round(c.time),
      timeOfDay: st.settings.timeOfDay as TimeOfDay,
      ...(weather && { sky: weather.sky, wind: Math.round(weather.windSpeed * 10) / 10 }),
      ...(p && {
        ...recordTackle(playerTackle(p)),
        appearance: {
          tube: p.tubeColor,
          fins: p.finColor,
          shirt: p.shirtColor,
          line: p.lineColor,
        },
      }),
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

  /**
   * Trombi nappaa liian lähelle tulleen ja lennättää sen muualle järvelle:
   * rengas siirretään heti perille, ja asiakkaat näyttävät lennon. Lennon
   * ja kumossa olon ajan rengas ei liiku eikä kalastaa voi.
   */
  private catchInSpouts() {
    const st = this.state;
    const victims: string[] = [];
    const flights: SpoutMessage['flights'] = [];
    const spots = activeSpouts(this.spouts, st.clock);
    // Venekisassa trombi vie koko veneen kyytiläisineen.
    for (const [id, sim] of this.sims) {
      const p = st.players.get(id);
      if (!p || isPassenger(sim) || !spoutAffects(p.capsizedUntil, st.clock)) continue;
      const fling = spoutCapture(this.spouts, st.clock, sim.tube.pos);
      if (!fling) continue;
      const from = { ...sim.tube.pos };
      const to = spoutLanding(from, fling, water, Math.random, spots);
      const crew = this.crewOf(id, sim);
      const start = new Map(crew.map(([mate, s]) => [mate, { ...s.tube.pos }]));
      sim.tube = to
        ? { ...sim.tube, pos: to, vel: { x: 0, y: 0 }, angVel: 0 }
        : { ...sim.tube, vel: fling };
      for (const [mate, s] of crew) {
        const q = st.players.get(mate);
        if (!q) continue;
        if (s !== sim) s.tube = followBoat(s.tube, sim.tube, s.seat!);
        const a = start.get(mate)!;
        if (to)
          flights.push({ id: mate, fromX: a.x, fromY: a.y, toX: s.tube.pos.x, toY: s.tube.pos.y });
        victims.push(mate);
        writeTube(q, s.tube, s.inputs.lastSeq);
        q.capsizedUntil = st.clock + (to ? SPOUT.flight : 0) + BIG_WAVE.recover;
        this.punish(
          mate,
          isPenalty(st.settings.capsizePenalty) ? st.settings.capsizePenalty : 'none',
        );
      }
    }
    if (victims.length > 0) {
      const msg: SpoutMessage = { victims, flights };
      this.broadcast(ServerMsg.spout, msg);
    }
  }

  /** Aluksen väki: renkaalla vain kalastaja itse, veneellä koko miehistö (soutaja ensin). */
  private crewOf(id: string, sim: Sim): [string, Sim][] {
    if (!sim.boat) return [[id, sim]];
    return [...this.sims.entries()]
      .filter(([, s]) => s.boat === sim.boat)
      .sort(([, a], [, b]) => (a.seat ?? 0) - (b.seat ?? 0));
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
    sim.fishing = false;
    sim.splashed = false;
    if (outcome.loseCatch)
      for (let i = st.catches.length - 1; i >= 0; i--)
        if (st.catches[i]!.player === id) st.catches.splice(i, 1);
  }

  /**
   * Isot aallot: kaatavat renkaan, jos aalto on tarpeeksi korkea renkaan
   * kohdalla ja tulee sivulta tai takaa (ks. capsizes). Vene kaatuu vain
   * korkeammasta aallosta kyljen puolelta, ja silloin koko miehistö kastuu
   * (boatCapsizes).
   */
  private breakBigWaves(windSpeed: number, windDir: number) {
    const st = this.state;
    while (this.nextWave < this.bigWaves.length && this.bigWaves[this.nextWave]!.t <= st.clock) {
      // Jokainen aalto tulee omasta suunnastaan tuulen ympäriltä.
      const waveDir = bigWaveDir(this.bigWaves[this.nextWave++]!, windDir);
      const victims: string[] = [];
      for (const [id, sim] of this.sims) {
        const p = st.players.get(id);
        if (!p || isPassenger(sim) || this.capsized(id)) continue;
        const h = bigWaveHeight(rings, sim.tube.pos, windSpeed, waveDir);
        const over = sim.boat ? boatCapsizes : capsizes;
        if (!over(sim.tube.heading, waveDir, h)) continue;
        for (const [mate] of this.crewOf(id, sim)) {
          const q = st.players.get(mate);
          if (!q) continue;
          victims.push(mate);
          q.capsizedUntil = st.clock + BIG_WAVE.recover;
          this.punish(
            mate,
            isPenalty(st.settings.capsizePenalty) ? st.settings.capsizePenalty : 'none',
          );
        }
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

/** Asiakkaan protokollaversio liittymisen valinnoista; vanha asiakas ei kerro. */
const clientProtocol = (options: Partial<JoinOptions>) =>
  typeof options.protocol === 'number' && Number.isFinite(options.protocol) ? options.protocol : 0;

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
