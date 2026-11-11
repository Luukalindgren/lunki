import { Room, ServerError, type Client } from '@colyseus/core';
import {
  SHORE_PROTOCOL,
  BAIL_PROTOCOL,
  WHITEFISH_PROTOCOL,
  beachedBoat,
  createBailer,
  fullInflateRow,
  isAshore,
  launchToNet,
  shoreToNet,
  COUNTDOWN_SECONDS,
  ClientMsg,
  LATENCY_STEP_MS,
  MAX_LATENCY_MS,
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
  rodInHand,
  TANGLE,
  findTangles,
  rodTip,
  bigWaveDir,
  bigWaveHeight,
  capsizes,
  boatCapsizes,
  BOAT_PROTOCOL,
  BoatSeat,
  SEAT_SWAP,
  seatPos,
  seatedTube,
  BOAT_TUBE,
  wrapAngle,
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
  capsizeTimeOut,
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
  seasonOf,
  type TimeOfDay,
  type RecordMessage,
  type SpeciesId,
  type InputMessage,
  type JoinOptions,
  type RoomError,
  type StartOptions,
  type BigWave,
  type BigWaveMessage,
  type SpoutMessage,
  type UntangledMessage,
  CHAT_HISTORY,
  ChatLimiter,
  EMOTE_RATE,
  isEmoteId,
  type EmoteMessage,
  type RaceStats,
  type RaceStatsMessage,
  parseRaceStats,
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
  AnchorPhase,
  withoutAnchor,
  BotAngler,
  botId,
  botIndex,
  botName,
  botSkillFor,
  botTackle,
  isBotId,
  isBotLevel,
  randomAppearance,
  fishConditions,
  daylight,
  clockAt,
  isTimeOfDay,
  PROTOCOL_VERSION,
  RaceStatsCounter,
  type BotStep,
  type FishTag,
  type FishConditions,
  type TubeInput,
  type WeatherNow,
} from '@lunki/shared';
import { recordStore } from '../records';
import { releaseCode, reserveCode } from './codes';
import { moveToBoat, packCrews, seatChange } from './crews';
import { FROZEN, followBoat, isPassenger, rowerOf, stepSims, type Sim } from './simulation';
import { CatchState, DepartedState, LunkiState, PlayerState } from './state';

/** Pelaajan varusteet tilasta (ennätyksiin). */
const playerTackle = (p: PlayerState): Tackle =>
  parseTackle({
    rod: p.rod,
    lure: p.lure,
    jigWeight: p.jigWeight,
    crankDepth: p.crankDepth,
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
  /** Vene ja paikka lähtiessä (palaaja yrittää samaan veneeseen). */
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
const lakeBottom = () =>
  (bottom ??= new LakeBottom(
    water,
    LUNKINJARVI.bounds,
    LUNKINJARVI_BOTTOM,
    LUNKINJARVI.reeds,
    LUNKINJARVI.piers,
  ));
const fishWorld = () => {
  const b = lakeBottom();
  return {
    isWater: (p: Vec2) => water.isWater(p),
    depthAt: (p: Vec2) => b.depthAt(p),
    structures: b.structures,
  };
};

/** Botti huoneessa (#624): aivot, syötteiden numerointi ja kisan tilastot. */
interface RoomBot {
  angler: BotAngler;
  seq: number;
  /** Viimeisin renkaan syöte: pidetään, kunnes botti päättää uuden. */
  input: TubeInput;
  stats: RaceStatsCounter;
}

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
  /** Kisan lopussa saadut pelaajien tilastot (#367). */
  private readonly raceStats = new Map<string, RaceStats>();
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
  /** Selaimen pysyvä tunniste pelaajittain (sessionId); ei jaeta muille. */
  private readonly playerIds = new Map<string, string>();
  /** Kesken kisan lähteneiden paikat (playerId); tyhjenee uuden kisan alkaessa. */
  private readonly seats = new Map<string, Seat>();
  /** Paikanvaihtopyyntöjen loppuhetki kisassa (kisa-aika, s), #357. */
  private readonly seatAskUntil = new Map<string, number>();
  /** Kesken kisan katsojiksi tulleet: uudessa kisassa he ovat kalastajia. */
  private readonly lateSpectators = new Set<string>();
  /**
   * Täyteen aulaan liittyneet ovat tilan `waiting`-kartassa: katsojina,
   * kunnes kalastajapaikka vapautuu (isäntä nostaa pelaajamäärää tai
   * kalastaja lähtee). Liittymisjärjestyksessä (#501, #568).
   */
  /** Kisan aikana vapaa ei enää vaihdeta: istunnot, joiden vapa on lukittu. */
  private readonly rodFixed = new Set<string>();
  /** Kisan botit (sessionId `bot:N`); aulassa botit ovat vain pelaajalistassa. */
  private readonly bots = new Map<string, RoomBot>();
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
      // Maalta ei kalasteta (#457): maalla olevan viehe on aina sisällä.
      if (
        !isAshore(sim.tube) &&
        Array.isArray(l) &&
        l.every((v) => typeof v === 'number' && Number.isFinite(v))
      ) {
        // Vieheen sijainti on vain näytettävä; rajataan järkevälle alueelle.
        const lure = { x: l[0]!, y: l[1]! };
        const ok = distance(lure, sim.tube.pos) < 200;
        const stage = ok ? Math.max(0, Math.min(3, Math.round(l[2]!))) : 0;
        // Kala tarttui: paikka talteen saaliin tarkistusta varten.
        if (stage === LureStage.hooked && p.lureStage !== LureStage.hooked) sim.hookAt = lure;
        p.lureStage = stage;
        // Veneessä soutaja ei voi soutaa heiton aikana eikä kelatessa (#263).
        sim.rodInHand = rodInHand(stage, l[3] === 1);
        this.reeling.set(client.sessionId, l[3] === 1);
        if (ok) {
          p.lureX = lure.x;
          p.lureY = lure.y;
        }
      } else {
        p.lureStage = 0;
        sim.rodInHand = false;
      }
      // Maihin saa nousta renkaalla, kun viehe on sisällä ja asiakas osaa rantautumisen (#457).
      sim.canLand =
        !sim.boat &&
        p.lureStage === LureStage.none &&
        (this.state.protocols.get(client.sessionId) ?? 0) >= SHORE_PROTOCOL;
      // Soutaja kääntyy tuhdolla kalastaessaan; vain näytettävä ja siiman lähtökohta.
      const look = Number(msg?.look);
      sim.look = sim.boat && !isPassenger(sim) && Number.isFinite(look) ? wrapAngle(look) : 0;
      p.look = sim.look;
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

    // Asiakas kertoo vain, mikä kala nousi; laji ja paino tulevat kalakannasta.
    this.onMessage(ClientMsg.catch, (client, msg: Partial<Catch>) => {
      if (!this.landCatch(client.sessionId, isFishTag(msg?.fish) ? msg.fish : null))
        client.send(ServerMsg.catchRejected);
    });

    this.onMessage(ClientMsg.cutLine, (client) => {
      const p = this.state.players.get(client.sessionId);
      if (p?.tangledWith) this.untangle(client.sessionId, p.tangledWith, 'cut', client.sessionId);
    });

    this.onMessage(ClientMsg.landCut, (client) => this.landCut(client.sessionId));

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
      p.jigWeight = t.jigWeight;
      p.crankDepth = t.crankDepth;
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
      this.bots.clear();
      this.raceStats.clear();
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
        p.seatAsk = 0;
      });
      this.seats.clear();
      this.state.departed.clear();
      this.seatAskUntil.clear();
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
      this.fillSeats();
      this.syncBots();
      // Kisan aikana lähteneiden ja palanneiden jäljiltä veneiden numerot taas järjestykseen.
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

    // Kisan huvitilastot (#367): jokainen kertoo omansa kerran kisan lopussa,
    // ja kaikki saavat tähänastisen joukon tulossivulle. Tulokseen ne eivät vaikuta.
    this.onMessage(ClientMsg.stats, (client, msg: unknown) => {
      if (this.state.phase !== 'finished' || !this.state.players.has(client.sessionId)) return;
      if (this.raceStats.has(client.sessionId)) {
        client.send(ServerMsg.stats, Object.fromEntries(this.raceStats));
        return;
      }
      this.raceStats.set(
        client.sessionId,
        parseRaceStats(msg, (s) => Object.hasOwn(SPECIES, s)),
      );
      const all: RaceStatsMessage = Object.fromEntries(this.raceStats);
      this.broadcast(ServerMsg.stats, all);
    });

    // Uudemman asiakkaan tuntematon viesti ohitetaan: muuten Colyseus
    // katkaisisi yhteyden (tuotantotilassa käsittelijätön viesti = potku).
    this.onMessage('*', () => undefined);

    // Yhteyden laatu aulaan (#575): asiakas mittaa viiveen Colyseuksen pingillä
    // parin sekunnin välein ja kertoo sen. Kartta päivittyy vain muuttuneilta.
    this.onMessage(ClientMsg.latency, (client, ms: unknown) => {
      if (typeof ms !== 'number' || !Number.isFinite(ms)) return;
      if (!this.state.players.has(client.sessionId)) return;
      const v = Math.min(MAX_LATENCY_MS, Math.max(0, Math.round(ms)));
      // Pieni heilunta ei lähde kaikille: tila muuttuu vain selvästä erosta.
      const old = this.state.pings.get(client.sessionId);
      if (old === undefined || Math.abs(v - old) >= Math.max(LATENCY_STEP_MS, old * 0.25))
        this.state.pings.set(client.sessionId, v);
    });

    this.onMessage(ClientMsg.ready, (client, ready: unknown) => {
      const p = this.state.players.get(client.sessionId);
      if (p && this.state.phase === 'lobby') p.ready = ready === true;
    });

    this.onMessage(ClientMsg.settings, (client, patch: unknown) => {
      if (client.sessionId !== this.state.hostId || this.state.phase !== 'lobby') return;
      const valid = validateSettingsPatch(patch, this.anglerCount(), (p) => isValidStart(water, p));
      const s = this.state.settings;
      let changed = false;
      // Vanhan asiakkaan takia pois jätetty valinta: isäntä kuulee syyn (#552).
      let blockedBy = 0;
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
        } else if (key === 'inflate' && value === true && this.hasOutdatedClient(BAIL_PROTOCOL)) {
          // Vanha asiakas ei osaa täyttökisaa (#458).
          blockedBy = Math.max(blockedBy, BAIL_PROTOCOL);
          continue;
        } else if (key === 'species') {
          // Vanha asiakas ei tunne siikaa (#535): se arpoisi eri kalakannan.
          const list = (value as string[]).filter(
            (id) => id !== 'whitefish' || !this.hasOutdatedClient(WHITEFISH_PROTOCOL),
          );
          if (list.length < (value as string[]).length)
            blockedBy = Math.max(blockedBy, WHITEFISH_PROTOCOL);
          if (list.length === 0) continue;
          if (list.join() !== [...s.species].join()) {
            s.species.splice(0, s.species.length, ...list);
            changed = true;
          }
        } else if ((s as unknown as Record<string, unknown>)[key] !== value) {
          (s as unknown as Record<string, unknown>)[key] = value;
          // Pelaajaraja ei muuta kisan sääntöjä: sen nosto ei vie muiden valmiutta.
          if (key !== 'maxPlayers') changed = true;
        }
      }
      if (valid.maxPlayers !== undefined) {
        this.maxClients = valid.maxPlayers + SPECTATOR_SLOTS;
        void this.setMatchmaking({ maxClients: this.maxClients });
        this.fillSeats();
      }
      // Muuttuneet säännöt: muiden pitää kuitata valmius uudelleen.
      if (changed) this.state.players.forEach((p) => (p.ready = false));
      // Botit pelaajamäärän ja valinnan mukaan; ne ovat aina valmiina.
      this.syncBots();
      if (blockedBy > 0)
        client.send(ServerMsg.error, {
          code: 'outdated-peer',
          names: [...this.state.players.entries()]
            .filter(([id]) => (this.state.protocols.get(id) ?? 0) < blockedBy)
            .map(([, p]) => p.name),
        } satisfies RoomError);
    });

    // Aulassa kulkupeli (#263): toisen veneeseen, omaan uuteen veneeseen tai renkaalle.
    this.onMessage(ClientMsg.boat, (client, boat: unknown) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || p.spectator || this.state.phase !== 'lobby') return;
      // Vanha asiakas ei osaa venettä: ennen päivitystä kaikki ovat renkailla.
      if (boat !== BOAT_TUBE && this.hasOutdatedClient()) return;
      const anglers = [...this.state.players.entries()].filter(([, q]) => !q.spectator);
      const moved = moveToBoat(
        anglers.map(([id, q]) => ({ id, boat: q.boat, seat: q.seat })),
        client.sessionId,
        typeof boat === 'number' ? boat : NaN,
      );
      if (!moved) return;
      moved.forEach((c, i) => {
        const q = anglers[i]![1];
        // Joukkue muuttui: siirtyjän ja veneiden miehistön pitää kuitata valmius uudelleen.
        if (q.boat !== c.boat || c.id === client.sessionId) q.ready = false;
        if (q.boat !== c.boat || q.seat !== c.seat) q.seatAsk = 0;
        q.boat = c.boat;
        q.seat = c.seat;
      });
    });

    // Paikanvaihto veneessä (#357): aulassa ja kisan aikana.
    this.onMessage(ClientMsg.seat, (client, seat: unknown) =>
      this.changeSeat(client.sessionId, seat),
    );

    this.onMessage(ClientMsg.spectate, (client, on: unknown) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || this.state.phase !== 'lobby') return;
      // Kalastajaksi vain, jos kalastajapaikkoja on vapaana.
      if (on !== true && p.spectator && this.anglerCount() >= this.state.settings.maxPlayers)
        return;
      p.spectator = on === true;
      p.ready = false;
      this.lateSpectators.delete(client.sessionId);
      // Oma valinta: ei enää odota paikkaa. Katsojaksi siirtynyt vapautti paikan.
      this.state.waiting.delete(client.sessionId);
      this.fillSeats();
      this.syncBots();
      this.packCrews();
    });

    this.onMessage(ClientMsg.name, (client, name: unknown) => {
      const p = this.state.players.get(client.sessionId);
      if (p) p.name = sanitizeName(name);
    });

    this.onMessage(ClientMsg.start, (client, options: unknown) => {
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
      // Isäntä voi aloittaa ilman muiden valmiutta; hekin kalastavat mukana (#539).
      const force =
        typeof options === 'object' && options !== null && (options as StartOptions).force === true;
      // Katkennutta ei odoteta: palatessaan hän jatkaa kisassa (#275).
      const notReady = anglers
        .filter(([id, p]) => !p.ready && p.connected && id !== this.state.hostId)
        .map(([, p]) => p);
      if (notReady.length > 0 && !force) {
        client.send(ServerMsg.error, {
          code: 'not-ready',
          names: notReady.map((p) => p.name),
        } satisfies RoomError);
        return;
      }
      this.state.seed = (Math.random() * 2 ** 32) >>> 0;
      this.spawnPlayers(this.state.seed);
      // Sama kalakanta kuin pelaajilla (Game: Rng(seed) ja huoneen lajisto).
      this.stock = createFishPopulation(
        fishWorld(),
        LUNKINJARVI.bounds,
        new Rng(this.state.seed),
        FISH_COUNT,
        [...this.state.settings.species] as SpeciesId[],
        seasonOf(this.state.settings),
      );
      this.fishGens.clear();
      this.createBots();
      const level = this.state.settings.weather;
      this.weather = planWeather(
        this.state.seed,
        isWeatherLevel(level) ? level : 'realistic',
        this.durationOverride ?? this.state.settings.durationMinutes * 60,
        seasonOf(this.state.settings),
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
    const outdated =
      (this.hasBoats() && clientProtocol(options) < BOAT_PROTOCOL) ||
      (this.state.settings.inflate && clientProtocol(options) < BAIL_PROTOCOL) ||
      (this.state.settings.species.includes('whitefish') &&
        clientProtocol(options) < WHITEFISH_PROTOCOL);
    // Vanha asiakas ei osaa piirtää venettä eikä istua kyydissä.
    if (outdated) throw new ServerError(4403, JoinRefusal.outdated);
    // Iso näyttö (#564) katsoo aina, eikä vie kalastajan paikkaa.
    if (options.watch === true) {
      if (this.spectatorCount() < SPECTATOR_SLOTS) return { spectator: true, watch: true };
      throw new ServerError(4403, JoinRefusal.full);
    }
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

  /** Joku huoneessa on valinnut veneen (#263). */
  private hasBoats(): boolean {
    for (const p of this.state.players.values()) if (p.boat > 0) return true;
    return false;
  }

  /** Joku huoneessa käyttää asiakasta, joka ei osaa venettä (tai täyttökisaa, `need`). */
  private hasOutdatedClient(need: number = BOAT_PROTOCOL): boolean {
    for (const id of this.state.players.keys())
      if ((this.state.protocols.get(id) ?? 0) < need) return true;
    return false;
  }

  /**
   * Aulan veneet järjestykseen (ks. packCrews): lähteneen paikka täyttyy ja
   * numerot pysyvät peräkkäisinä. Katsojilla ei ole kulkupeliä.
   */
  private packCrews() {
    const anglers: [string, PlayerState][] = [];
    this.state.players.forEach((p, id) => {
      if (!p.spectator) anglers.push([id, p]);
      else p.boat = p.seat = 0;
    });
    packCrews(anglers.map(([id, p]) => ({ id, boat: p.boat, seat: p.seat }))).forEach((c, i) => {
      const p = anglers[i]![1];
      if (p.boat !== c.boat || p.seat !== c.seat) p.seatAsk = 0;
      p.boat = c.boat;
      p.seat = c.seat;
    });
  }

  /** Pelaajan voimassa oleva paikanvaihtopyyntö (paikka) tai null. */
  private seatAskOf(id: string): number | null {
    const ask = this.state.players.get(id)?.seatAsk ?? 0;
    return ask > 0 ? ask - 1 : null;
  }

  /**
   * Paikanvaihto veneessä (#357), ks. seatChange. Kisassa vene on lähes
   * paikallaan, eikä vaihtajilla ole viehettä vedessä, jäähyä tai kaatumista;
   * asiakas kertoo pelaajalle saman. Aulassa vain vaihdetaan paikkoja.
   */
  private changeSeat(id: string, seat: unknown) {
    const st = this.state;
    const p = st.players.get(id);
    const lobby = st.phase === 'lobby';
    if (!p || p.spectator || !p.boat || (!lobby && st.phase !== 'playing')) return;
    if (seat === -1) {
      p.seatAsk = 0;
      return;
    }
    if (typeof seat !== 'number' || (!lobby && !this.canChangeSeat(id))) return;
    const crew = [...st.players.entries()]
      .filter(([, q]) => !q.spectator)
      .map(([pid, q]) => ({ id: pid, boat: q.boat, seat: q.seat }));
    const change = seatChange(crew, id, seat, (pid) => this.seatAskOf(pid), lobby);
    if (!change) return;
    if (change.kind === 'ask') {
      p.seatAsk = change.seat + 1;
      this.seatAskUntil.set(id, st.clock + SEAT_SWAP.askSeconds);
      return;
    }
    if (change.kind === 'move') this.moveSeat(id, change.seat);
    else if (lobby) {
      const q = st.players.get(change.with)!;
      [p.seat, q.seat] = [q.seat, p.seat];
    } else if (this.canChangeSeat(change.with)) this.swapSeats(id, change.with);
    else return;
    // Paikat muuttuivat: veneen pyynnöt raukeavat.
    this.clearSeatAsks(p.boat);
  }

  /** Kisassa paikkaa voi vaihtaa: vene lähes paikallaan, viehe kelalla, ei jäähyä. */
  private canChangeSeat(id: string): boolean {
    const p = this.state.players.get(id);
    const sim = this.sims.get(id);
    if (!p || !sim?.boat || p.lureStage !== LureStage.none || this.timedOut(id)) return false;
    const boat = rowerOf(this.sims.values(), sim.boat);
    const v = boat?.tube.vel ?? { x: 0, y: 0 };
    return Math.hypot(v.x, v.y) <= SEAT_SWAP.maxSpeed;
  }

  /** Kyytiläinen vapaalle paikalle veneessä. */
  private moveSeat(id: string, seat: number) {
    const sim = this.sims.get(id);
    const p = this.state.players.get(id);
    const boat = sim?.boat ? rowerOf(this.sims.values(), sim.boat) : null;
    if (!sim || !p || !boat) return;
    sim.seat = p.seat = seat;
    sim.tube = seatedTube(boat.tube, seat, sim.tube.stamina);
    writeTube(p, sim.tube, sim.inputs.lastSeq);
  }

  /**
   * Kaksi vaihtaa paikkaa. Soutajaksi tuleva jatkaa veneen tilasta
   * (vauhti, suunta, ankkuri) kuten passOars; kunto on kummallakin oma.
   */
  private swapSeats(a: string, b: string) {
    const sa = this.sims.get(a);
    const sb = this.sims.get(b);
    const boat = sa?.boat ? rowerOf(this.sims.values(), sa.boat) : null;
    if (!sa || !sb || !boat) return;
    const hull = boat.tube;
    const seats: [string, Sim, number][] = [
      [a, sa, sb.seat ?? 0],
      [b, sb, sa.seat ?? 0],
    ];
    for (const [id, sim, seat] of seats) {
      sim.tube =
        seat === BoatSeat.rower
          ? { ...hull, stamina: sim.tube.stamina }
          : seatedTube(hull, seat, sim.tube.stamina);
      sim.seat = seat;
      sim.look = 0;
      sim.rodInHand = false;
      const p = this.state.players.get(id);
      if (!p) continue;
      p.seat = seat;
      p.look = 0;
      writeTube(p, sim.tube, sim.inputs.lastSeq);
    }
  }

  /** Veneen paikanvaihtopyynnöt pois (paikat muuttuivat). */
  private clearSeatAsks(boat: number) {
    this.state.players.forEach((p, id) => {
      if (p.boat !== boat) return;
      p.seatAsk = 0;
      this.seatAskUntil.delete(id);
    });
  }

  /**
   * Kalastajat huoneessa (katkenneet mukaan lukien, katsojat ja botit pois):
   * botti luovuttaa paikkansa pelaajalle, joten se ei vie kalastajapaikkaa.
   */
  private anglerCount(): number {
    let n = 0;
    this.state.players.forEach((p, id) => (n += p.spectator || isBotId(id) ? 0 : 1));
    return n;
  }

  private spectatorCount(): number {
    let n = 0;
    this.state.players.forEach((p) => (n += p.spectator ? 1 : 0));
    return n;
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
    this.state.protocols.set(client.sessionId, clientProtocol(options));
    // Päättyneeseen kisaan tullut katsoo tuloksia ja pääsee mukaan uuteen
    // kisaan; muuten hän näkyisi tuloksissa ilman rengasta (#279).
    const afterEnd = this.state.phase === 'finished' && !this.isReturning(id);
    if ((auth as { spectator?: boolean } | undefined)?.spectator || afterEnd) {
      // Katsoja ei saa rengasta eikä vie lähteneen paikkaa.
      const p = new PlayerState();
      p.name = this.uniqueName(sanitizeName(options.name));
      p.spectator = true;
      this.state.players.set(client.sessionId, p);
      // Iso näyttö (#564) katsoo myös seuraavat kisat. Muu kesken kisan tullut
      // on uudessa kisassa kalastaja; aulassa voi itse vaihtaa.
      const watch = (auth as { watch?: boolean } | undefined)?.watch === true;
      if (racing && !watch) this.lateSpectators.add(client.sessionId);
      // Täyteen aulaan tullut pääsee kalastamaan, kun paikka vapautuu (#501).
      else if (!watch) this.state.waiting.set(client.sessionId, true);
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
    // Botti luovuttaa paikkansa pelaajalle, myös kesken kisan (#624).
    this.yieldBotSeat();
    if (seat) this.resumeSeat(client.sessionId, p, seat);
    else if (this.state.phase === 'countdown' || this.state.phase === 'playing')
      this.spawnLate(client.sessionId, p);
    else if (!racing) {
      this.syncBots();
      this.packCrews();
    }
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
    this.state.departed.delete(seat.sessionId);
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
   * Veneeseen palaaja istuu entiseen veneeseensä, jos siinä on tilaa
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
    // Kesken kisan tullut ei valinnut kulkupeliä aulassa: kelluntarengas.
    this.placeTube(id, p, pos);
  }

  /**
   * Rengas paikalleen selkä rantaan päin, katse järvelle. Veneellä (`boat`
   * 1…) keula järvelle, jotta soutaja pääsee suoraan ulos; soutaja katsoo
   * perään eli rantaan.
   */
  private placeTube(id: string, p: PlayerState, pos: Vec2, boat = 0, ready?: TubeState) {
    const shore = water.closestShorePoint(pos)?.point ?? pos;
    const out = Math.atan2(pos.y - shore.y, pos.x - shore.x);
    // Täyttökisassa (#458) valmis paikka rannalla tyhjän renkaan kanssa.
    const tube = ready ?? createTube(pos, boat ? out + Math.PI : out);
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

  /** Kalastaja veneen kyytiin paikalleen, katse ulos veneestä (perästä tai keulasta). */
  private seatPassenger(id: string, p: PlayerState, boat: Sim, seat: number, bail = false) {
    const out = seat === BoatSeat.stern ? 0 : Math.PI;
    const tube = {
      ...createTube(seatPos(boat.tube, seat), boat.tube.heading + out),
      // Täyttökisan vene rannalla (#458): kyytiläinenkin äyskäröi.
      ...(bail && { bailer: createBailer(seat) }),
    };
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
    this.state.waiting.delete(id);
    // Katsojalla ei ole paikkaa, jota pitää vapaana.
    if (this.state.phase !== 'lobby' && !p.spectator) {
      // Tulostauluun jää rivi, vaikka saalista ei olisi (LAN-testi #503).
      const gone = new DepartedState();
      gone.name = p.name;
      gone.boat = p.boat;
      gone.early = this.state.phase !== 'finished';
      this.state.departed.set(id, gone);
    }
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
    this.state.protocols.delete(id);
    this.state.pings.delete(id);
    this.state.players.delete(id);
    // Lähtevän soutajan vene jää kyytiläisille: seuraava tarttuu airoihin.
    const sim = this.sims.get(id);
    if (sim?.boat && !isPassenger(sim)) this.passOars(id, sim);
    if (sim?.boat) this.clearSeatAsks(sim.boat);
    // Lähtijän rengas ei saa jäädä näkymättömäksi esteeksi.
    this.sims.delete(id);
    this.reeling.delete(id);
    this.tangleFree.delete(id);
    this.chatLimits.delete(id);
    this.emoteLimits.delete(id);
    if (this.state.hostId === id) this.passHost(true);
    if (this.state.phase === 'lobby') {
      this.fillSeats();
      this.syncBots();
      this.packCrews();
    }
  }

  /**
   * Aulassa vapautuneet kalastajapaikat täyteen huoneeseen liittyneille
   * katsojille liittymisjärjestyksessä. Muuten isännän nostama pelaajamäärä
   * ei auttaisi: täyteen aulaan liittynyt jäisi katsojaksi huomaamattaan.
   */
  private fillSeats() {
    if (this.state.phase !== 'lobby') return;
    for (const id of [...this.state.waiting.keys()]) {
      if (this.anglerCount() >= this.state.settings.maxPlayers) return;
      const p = this.state.players.get(id);
      this.state.waiting.delete(id);
      if (!p?.spectator) continue;
      p.spectator = false;
      p.ready = false;
    }
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
    // Botti ei voi olla isäntä.
    const others = [...this.state.players.entries()].filter(
      ([id]) => id !== this.state.hostId && !isBotId(id),
    );
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
    // Veneet aloittavat venekunnittain: soutaja paikalleen, kyytiläiset hänen veneeseensä.
    this.packCrews();
    // Aulan paikanvaihtopyynnöt eivät jatku kisaan.
    this.state.players.forEach((p) => (p.seatAsk = 0));
    this.seatAskUntil.clear();
    const aboard = (p: PlayerState) => p.boat > 0 && p.seat !== BoatSeat.rower;
    // Täyttökisa (#458): renkaat ja veneet riviin lähtörannalle.
    // Botit eivät pumppaa: ne aloittavat vesiltä.
    const crafts = [...this.state.players.entries()]
      .filter(([id, p]) => !p.spectator && !aboard(p) && !isBotId(id))
      .map(([, p]) => p);
    // Ensin isännän paikka tai arvottu ranta, sitten lähistöä, kunnes kaikki mahtuvat.
    let first = true;
    const rowNear = () => {
      const near = first ? (chosen ?? launch()) : launch();
      first = false;
      return near;
    };
    const row = set.inflate ? fullInflateRow(water, rowNear, crafts.length, seed) : [];
    const crews = new Map<number, [string, PlayerState][]>();
    this.state.players.forEach((p, id) => {
      if (!p.spectator && aboard(p)) crews.set(p.boat, [...(crews.get(p.boat) ?? []), [id, p]]);
    });
    this.state.players.forEach((p, id) => {
      if (p.spectator || aboard(p)) return;
      const bot = isBotId(id);
      // Joka toinen botti aloittaa muualta järveltä: isossa kisassa koko järvi on käytössä.
      const far = bot && botIndex(id) % 2 === 1;
      const slot = bot ? undefined : row.shift();
      if (slot && p.boat === 0) {
        taken.push(slot.pos);
        this.placeTube(id, p, slot.pos, 0, slot);
        return;
      }
      // Vene rannalle vettä täynnä: venekunta äyskäröi sen ja työntää vesille.
      const mates = crews.get(p.boat) ?? [];
      const beached = slot && beachedBoat(water, slot.pos, seed, 1 + mates.length);
      if (beached) {
        taken.push(beached.pos);
        this.placeTube(id, p, beached.pos, p.boat, beached);
        const rower = this.sims.get(id)!;
        for (const [mate, q] of mates) this.seatPassenger(mate, q, rower, q.seat, true);
        return;
      }
      const spot = () =>
        far
          ? findLaunchPoint(water, LUNKINJARVI.bounds, () => rng.next())
          : bot && taken.length > 0
            ? findStartNear(water, taken[0]!, SPAWN_RADIUS, () => rng.next())
            : launch();
      let pos = taken.length === 0 && chosen ? { ...chosen } : spot();
      if (taken.length > 0) {
        const fits = (q: Vec2) =>
          (far || distance(q, taken[0]!) < SPAWN_RADIUS) &&
          taken.every((t) => distance(t, q) >= SPAWN_SPACING);
        for (let k = 0; k < 400 && !fits(pos); k++) pos = spot();
      }
      taken.push(pos);
      this.placeTube(id, p, pos, p.boat);
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
        // Bottien tilastot tulossivun palkintoihin (pelaajat lähettävät omansa).
        for (const [id, b] of this.bots) this.raceStats.set(id, b.stats.stats);
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
    const depthAt = st.phase === 'playing' ? fishWorld().depthAt : undefined;
    if (st.phase === 'playing') this.stepBots(weather, base);
    for (const i of stepSims(sims, water, st.phase === 'countdown', base && wind, depthAt)) {
      const p = this.state.players.get(ids[i]!);
      if (p) writeTube(p, sims[i]!.tube, sims[i]!.inputs.lastSeq);
    }
    if (st.phase === 'playing') {
      this.catchInSpouts();
      this.updateTangles();
      for (const [id, until] of this.seatAskUntil)
        if (st.clock > until) {
          const p = st.players.get(id);
          if (p) p.seatAsk = 0;
          this.seatAskUntil.delete(id);
        }
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
          tip: rodTip(sim.tube.pos, sim.tube.heading + (sim.look ?? 0)),
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
    // Bottien saaliit eivät mene ennätyslistalle (#624).
    if (!store || isBotId(player)) return;
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
      season: seasonOf(st.settings),
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
      // Botti kelaa siimansa sisään kuten pelaajan asiakas viestin saatuaan.
      this.resetBot(id);
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
    // Trombi vie koko veneen kyytiläisineen.
    for (const [id, sim] of this.sims) {
      const p = st.players.get(id);
      if (!p || isPassenger(sim) || isAshore(sim.tube) || !spoutAffects(p.capsizedUntil, st.clock))
        continue;
      const fling = spoutCapture(this.spouts, st.clock, sim.tube.pos);
      if (!fling) continue;
      const from = { ...sim.tube.pos };
      const to = spoutLanding(from, fling, water, Math.random, spots);
      const crew = this.crewOf(id, sim);
      const start = new Map(crew.map(([mate, s]) => [mate, { ...s.tube.pos }]));
      // Trombi repäisee ankkurin irti (#355).
      const free = withoutAnchor(sim.tube);
      sim.tube = to
        ? { ...free, pos: to, vel: { x: 0, y: 0 }, angVel: 0 }
        : { ...free, vel: fling };
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
          capsizeTimeOut(seasonOf(st.settings)),
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
  private punish(id: string, penalty: Penalty, timeOut?: number) {
    const st = this.state;
    const p = st.players.get(id);
    const sim = this.sims.get(id);
    if (!p || !sim) return;
    const outcome = penaltyOutcome(penalty, st.clock, timeOut);
    p.outUntil = Math.max(p.outUntil, outcome.outUntil);
    p.lureStage = 0;
    sim.rodInHand = false;
    sim.splashed = false;
    this.resetBot(id);
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
        // Maalla oleva on turvassa aalloilta (#457).
        if (!p || isPassenger(sim) || isAshore(sim.tube) || this.capsized(id)) continue;
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
            capsizeTimeOut(seasonOf(st.settings)),
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
        // Maalla on turvassa salamalta (#457, Luuka): vapa on aina alhaalla.
        rodUp:
          !isAshore(sim.tube) && (st.players.get(id)?.lureStage ?? 0) !== 0 && !this.timedOut(id),
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

  /**
   * Saalis kisaan. Kalastaja (pelaajan asiakas tai botti) kertoo vain, mikä
   * kala nousi; laji ja paino tulevat kalakannasta. Sama kala (paikka ja
   * sukupolvi) voidaan nostaa vain kerran: ensimmäinen voittaa. Palauttaa
   * false, jos saalista ei hyväksytty.
   */
  private landCatch(id: string, tag: FishTag | null): boolean {
    const sim = this.sims.get(id);
    const now = this.state.clock;
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
      this.timedOut(id) ||
      this.state.players.get(id)?.tangledWith ||
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
    )
      return false;
    sim.splashed = false;
    sim.lastCatchAt = now;
    const c = new CatchState();
    c.player = id;
    c.angler = this.state.players.get(id)?.name ?? '';
    c.species = landed.species;
    c.name = landed.name;
    c.weight = landed.weight;
    c.time = now;
    c.fishSlot = tag!.slot;
    c.fishGen = tag!.gen;
    c.boat = sim.boat ?? 0;
    this.fishGens.set(tag!.slot, tag!.gen + 1);
    this.state.catches.push(c);
    this.recordCatch(id, c, hookAt);
    // Kala poistuu bottienkin kalakannoista, kuten pelaajien asiakkailta.
    for (const [other, b] of this.bots) if (other !== id) b.angler.removeCaught(tag!);
    return true;
  }

  /** Maalle juuttuneen vieheen siima katkaistiin: uuden solmiminen vie aikaa. */
  private landCut(id: string) {
    const p = this.state.players.get(id);
    const sim = this.sims.get(id);
    if (!p || !sim || this.state.phase !== 'playing') return;
    // Uuden vieheen solmiminen: kalastaa ei voi ennen sakon loppua.
    p.outUntil = Math.max(p.outUntil, this.state.clock + this.state.settings.landPenalty);
    p.lureStage = 0;
    sim.rodInHand = false;
    sim.splashed = false;
  }

  /** Kaikki kalastajat katsojia lukuun ottamatta, botit mukana. */
  private seatedCount(): number {
    let n = 0;
    this.state.players.forEach((p) => (n += p.spectator ? 0 : 1));
    return n;
  }

  /**
   * Aulan botit (#624): kun botit täyttävät tyhjät paikat, niitä on
   * pelaajamäärän ja kalastajien erotus. Liittyvä pelaaja vie botin paikan
   * ja lähtevän tilalle tulee botti. Botit ovat aina valmiina.
   */
  private syncBots() {
    const st = this.state;
    if (st.phase !== 'lobby') return;
    const want =
      st.settings.bots === 'fill' ? Math.max(0, st.settings.maxPlayers - this.anglerCount()) : 0;
    const ids = [...st.players.keys()].filter(isBotId).sort((a, b) => botIndex(a) - botIndex(b));
    while (ids.length > want) this.removeBot(ids.pop()!);
    for (let i = 0; ids.length < want; i++) {
      const id = botId(i);
      if (st.players.has(id)) continue;
      const p = new PlayerState();
      p.name = this.uniqueName(botName(i));
      const look = new Rng(0x62077 + i);
      const a = randomAppearance(() => look.next());
      p.tubeColor = a.tube;
      p.finColor = a.fins;
      p.shirtColor = a.shirt;
      p.lineColor = a.line;
      p.lure = botTackle(i).lure;
      st.players.set(id, p);
      st.protocols.set(id, PROTOCOL_VERSION);
      ids.push(id);
    }
    for (const id of ids) st.players.get(id)!.ready = true;
  }

  /** Botti pois huoneesta; kesken kisan sen rivi jää tuloksiin lähteneenä. */
  private removeBot(id: string) {
    const st = this.state;
    const p = st.players.get(id);
    if (!p) return;
    if (p.tangledWith) this.untangle(id, p.tangledWith, 'cut', id);
    if (st.phase !== 'lobby') {
      const gone = new DepartedState();
      gone.name = p.name;
      gone.early = st.phase !== 'finished';
      st.departed.set(id, gone);
    }
    st.players.delete(id);
    st.protocols.delete(id);
    this.sims.delete(id);
    this.bots.delete(id);
    this.reeling.delete(id);
    this.tangleFree.delete(id);
  }

  /** Pelaaja tuli täyteen huoneeseen: viimeisin botti luovuttaa paikkansa. */
  private yieldBotSeat() {
    if (this.seatedCount() <= this.state.settings.maxPlayers) return;
    const last = [...this.state.players.keys()]
      .filter(isBotId)
      .sort((a, b) => botIndex(b) - botIndex(a))[0];
    if (last) this.removeBot(last);
  }

  /** Kisan alku: jokaiselle botille aivot ja oma kopio kalakannasta. */
  private createBots() {
    this.bots.clear();
    const st = this.state;
    const level = isBotLevel(st.settings.botLevel) ? st.settings.botLevel : 'mixed';
    const difficulty = Object.hasOwn(DIFFICULTIES, st.settings.difficulty)
      ? (st.settings.difficulty as Difficulty)
      : 'normal';
    for (const id of st.players.keys()) {
      if (!isBotId(id) || !this.stock) continue;
      const index = botIndex(id);
      this.bots.set(id, {
        angler: new BotAngler({
          index,
          skill: botSkillFor(level, index),
          seed: st.seed,
          difficulty,
          water,
          bottom: lakeBottom(),
          pop: structuredClone(this.stock),
        }),
        seq: 0,
        input: FROZEN,
        stats: new RaceStatsCounter(),
      });
    }
  }

  /** Botin siima poikki (rangaistus tai sotkun selvitys). */
  private resetBot(id: string) {
    this.bots.get(id)?.angler.reset();
  }

  /**
   * Bottien askel (#624): botti päättää syötteensä joka toisella askeleella
   * (kalastus 30 Hz, botit vuorotellen), ja rengas saa syötteen jonoonsa kuten
   * pelaajan viestistä. Saalis, roiskahdus ja maalle heitto kulkevat samojen
   * tarkistusten läpi kuin pelaajalla.
   */
  private stepBots(weather: WeatherNow | null, wind?: Vec2) {
    if (this.bots.size === 0) return;
    const st = this.state;
    const tick = Math.round(st.clock / NET_DT);
    let cond: FishConditions | null = null;
    for (const [id, b] of this.bots) {
      const sim = this.sims.get(id);
      const p = st.players.get(id);
      if (!sim || !p) continue;
      if ((tick + b.angler.index) % 2 === 0) {
        if (!cond) {
          const season = seasonOf(st.settings);
          const time = isTimeOfDay(st.settings.timeOfDay) ? st.settings.timeOfDay : 'day';
          cond = fishConditions(weather, daylight(clockAt(time, st.clock, season), season), season);
        }
        const others: Vec2[] = [];
        for (const [other, s] of this.sims)
          if (other !== id && !isAshore(s.tube)) others.push(s.tube.pos);
        const out = b.angler.step(
          {
            tube: sim.tube,
            canFish: !this.timedOut(id),
            tangled: p.tangledWith !== '',
            thunder: weather?.sky === 'thunder',
            others,
            ...(wind && { wind }),
            cond,
          },
          NET_DT * 2,
        );
        b.input = out.input;
        this.applyBot(id, b, sim, p, out);
      }
      sim.inputs.push([{ seq: ++b.seq, ...(this.capsized(id) ? FROZEN : b.input) }]);
    }
  }

  /** Botin askeleen seuraukset huoneen tilaan (vrt. ClientMsg.input, splash ja catch). */
  private applyBot(id: string, b: RoomBot, sim: Sim, p: PlayerState, out: BotStep) {
    const a = b.angler;
    const ev = out.events;
    const stage = a.lureStage;
    if (stage === LureStage.hooked && p.lureStage !== LureStage.hooked) sim.hookAt = { ...a.lure };
    p.lureStage = stage;
    if (stage !== LureStage.none) {
      p.lureX = a.lure.x;
      p.lureY = a.lure.y;
    }
    sim.rodInHand = rodInHand(stage, a.reeling);
    this.reeling.set(id, a.reeling);
    if (ev.splash) sim.splashed = true;
    const f = a.fishing;
    const hooked = f.hookedId !== null ? a.pop.fish.find((x) => x.id === f.hookedId) : null;
    b.stats.fishing(ev, sim.tube.pos, a.lure, hooked ?? null);
    b.stats.move(sim.tube.pos, this.state.clock);
    if (ev.lineCut) this.landCut(id);
    if (ev.caught?.fish) this.landCatch(id, ev.caught.fish);
    if (out.emote) {
      const msg: EmoteMessage = { from: id, emote: out.emote };
      this.broadcast(ServerMsg.emote, msg);
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

/**
 * Asiakkaan protokollaversio liittymisen valinnoista; vanha asiakas ei kerro.
 * Tilassa uint8: outo luku rajataan väliin 0–255.
 */
const clientProtocol = (options: Partial<JoinOptions>) =>
  typeof options.protocol === 'number' && Number.isFinite(options.protocol)
    ? Math.min(255, Math.max(0, Math.floor(options.protocol)))
    : 0;

function writeTube(p: PlayerState, t: TubeState, ack: number) {
  p.x = t.pos.x;
  p.y = t.pos.y;
  p.vx = t.vel.x;
  p.vy = t.vel.y;
  p.heading = t.heading;
  p.angVel = t.angVel;
  p.kickPhase = t.kickPhase;
  p.stamina = t.stamina;
  const a = t.anchor;
  p.anchor = a ? (a.raising ? AnchorPhase.raising : AnchorPhase.lowered) : AnchorPhase.up;
  if (a) {
    p.anchorX = a.pos.x;
    p.anchorY = a.pos.y;
    p.anchorDepth = a.depth;
    p.anchorDrop = a.drop;
  }
  const shore = shoreToNet(t);
  p.shore = shore.shore;
  if (shore.shore) {
    p.shoreX = shore.shoreX;
    p.shoreY = shore.shoreY;
    p.shoreHeading = shore.shoreHeading;
    p.shoreBoard = shore.shoreBoard;
  }
  p.landing = shore.landing;
  p.inflate = shore.inflate;
  if (shore.inflate) {
    p.inflateMove = shore.inflateMove;
    p.fill0 = shore.fill0;
    p.fill1 = shore.fill1;
    p.fill2 = shore.fill2;
    p.pumpHandle = shore.pumpHandle;
    p.pumpArrow = shore.pumpArrow;
    p.inflateSeed = shore.inflateSeed;
  }
  const launch = launchToNet(t);
  const l = p.boatLaunch;
  l.launch = launch.launch;
  if (launch.launch) {
    l.water0 = launch.water0;
    l.water1 = launch.water1;
    l.waterFull = launch.waterFull;
    l.launchSeed = launch.launchSeed;
  }
  l.bail = launch.bail;
  if (launch.bail) {
    l.bailMove = launch.bailMove;
    l.bailHandle = launch.bailHandle;
    l.bailArrow = launch.bailArrow;
    l.bailStage = launch.bailStage;
  }
  p.ack = ack;
}
