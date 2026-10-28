import {
  BIG_WAVE,
  BoatSeat,
  CRAFTS,
  LureStage,
  NET_DT,
  passengerInput,
  rodInHand,
  rowerInput,
  seatPos,
  SnapshotBuffer,
  SnapshotClock,
  TubePredictor,
  encodeInputs,
  lerpAngle,
  SPOUT,
  type BigWaveMessage,
  type CraftBody,
  type SpoutFlight,
  type SpoutMessage,
  type Catch,
  type CatchRecord,
  type LightningMessage,
  type UntangledMessage,
  type RecordMessage,
  type FishTag,
  type PlayerResult,
  type RoomPhase,
  type TubeInput,
  type TubeState,
  type Tackle,
  type Appearance,
  type ChatMessage,
  type EmoteId,
  type EmoteMessage,
  type Vec2,
  type WaterBody,
} from '@lunki/shared';
import type { RaceCatchMark, RacePlayerSpot } from '../game/raceLog';
import { flightPose } from '../game/spoutView';
import { t } from '../i18n';
import {
  playerAppearance,
  playerTackle,
  type NetSession,
  type PlayerSchema,
  type StateSchema,
} from './session';

/** Muut pelaajat piirretään näin paljon menneisyydestä (s), jotta liike on pehmeää. */
const INTERPOLATION_DELAY = 0.12;
/** Yhteyden jumittaessa muiden liikettä jatketaan enintään näin kauan (s). */
const EXTRAPOLATE = 0.25;
/** Tätä pidemmälle (m) ei jatketa: tila oli siirto (esim. trombi), ei uintia. */
const EXTRAPOLATE_MAX = 1;

export interface RemotePlayer {
  id: string;
  name: string;
  pos: Vec2;
  heading: number;
  kickPhase: number;
  lure: Vec2 | null;
  lureStage: number;
  appearance: Appearance;
  /** Perhovälineet: lennossa oleva "viehe" on perhoheiton perho (#236). */
  fly?: boolean;
  /** Trombin lennättämänä korkeus ilmassa (m) ja kieppuminen (rad). */
  lift?: number;
  tumble?: number;
  /** Vene (#263): vene 1… ja paikka (BoatSeat); 0 = kelluntarengas. */
  boat: number;
  seat: number;
  /** Soutaja kääntyneenä tuhdolla (rad veneen suunnasta). */
  look: number;
  /** Kaatuneen aluksen kallistus (rad, π = kumollaan). */
  roll: number;
}

/** Vene piirtohetkellä: soutajan paikka, suunta ja airovetojen vaihe. */
export interface BoatPose {
  boat: number;
  pos: Vec2;
  heading: number;
  kickPhase: number;
  /** Soutajan renkaan väri: veneen ulkokuori ja reunalista. */
  color: number;
  lift?: number;
  tumble?: number;
  /** Kaatuessa kallistus (rad). */
  roll?: number;
}

/** Oma asento piirtohetkellä: oman veneen kyytiläiset istuvat siinä. */
export interface OwnPose {
  pos: Vec2;
  /** Veneellä veneen suunta (perään), ei soutajan katse. */
  heading: number;
  kickPhase: number;
  roll?: number;
}

interface RemoteSnap {
  pos: Vec2;
  heading: number;
  kickPhase: number;
  lure: Vec2;
  lureStage: number;
  look: number;
}

/**
 * Potkuvaihe kiertää 0–1 ja on 0, kun ei potkita. Väliin interpoloidaan
 * eteenpäin kiertäen, jotta räpylät liikkuvat sulavasti eivätkä tilojen
 * tahdissa (20 kertaa sekunnissa).
 */
export function lerpKickPhase(a: number, b: number, t: number): number {
  if (a === 0 || b === 0) return b;
  const d = b >= a ? b - a : b + 1 - a;
  return (a + d * t) % 1;
}

const lerpSnap = (a: RemoteSnap, b: RemoteSnap, t: number): RemoteSnap => ({
  pos: { x: a.pos.x + (b.pos.x - a.pos.x) * t, y: a.pos.y + (b.pos.y - a.pos.y) * t },
  heading: lerpAngle(a.heading, b.heading, t),
  kickPhase: lerpKickPhase(a.kickPhase, b.kickPhase, t),
  lure: { x: a.lure.x + (b.lure.x - a.lure.x) * t, y: a.lure.y + (b.lure.y - a.lure.y) * t },
  lureStage: t < 0.5 ? a.lureStage : b.lureStage,
  look: lerpAngle(a.look, b.look, t),
});

/**
 * Kaatuneen aluksen kallistus `t` sekuntia kaatumisen jälkeen: kumoon puolessa
 * sekunnissa, kumollaan jäähyn ajan ja viimeisen sekunnin aikana takaisin.
 */
export function capsizeRoll(t: number): number {
  if (t < 0 || t > BIG_WAVE.recover) return 0;
  const over = Math.min(1, t / 0.5);
  const back = Math.max(0, (t - (BIG_WAVE.recover - 1)) / 1);
  const k = Math.min(over, 1 - back);
  return Math.PI * k * k * (3 - 2 * k);
}

const toTube = (p: PlayerSchema): TubeState => ({
  pos: { x: p.x, y: p.y },
  vel: { x: p.vx, y: p.vy },
  heading: p.heading,
  angVel: p.angVel,
  kickPhase: p.kickPhase,
  stamina: p.stamina ?? 1,
});

/**
 * Moninpelin maailma asiakkaalla: oman renkaan ennakointi ja muiden
 * pelaajien interpolointi palvelimen tiloista.
 */
export class NetWorld {
  readonly predictor: TubePredictor;
  private readonly remotes = new Map<
    string,
    {
      /** Näytettävä nimi, katkoksen aikana merkinnän kanssa. */
      name: string;
      /** Pelaajan oma nimi ilman merkintöjä. */
      player: string;
      appearance: Appearance;
      fly: boolean;
      buf: SnapshotBuffer<RemoteSnap>;
      boat: number;
      seat: number;
      /** Viimeisin nopeus palvelimelta (kyytiläisen oma vauhti veneestä). */
      vel: Vec2;
      /** Kumossa tähän kisa-aikaan asti (s). */
      capsizedUntil: number;
    }
  >();
  /** Oma paikka veneessä; 0/0 = kelluntarengas. */
  private ownBoat = 0;
  private ownSeat: number = BoatSeat.rower;
  /** Muiden tilojen aikaleimat kisan kellosta, ettei verkon heittely nyi liikettä. */
  private readonly stamps = new SnapshotClock();
  private lure: [number, number, number, number] = [0, 0, LureStage.none, 0];
  /** Muiden viimeisimmät palvelintilat (ennakoinnin törmäyksiin). */
  private latestOthers: CraftBody[] = [];
  /**
   * Korjauksen pehmennys: kun palvelin siirtää omaa rengasta (esim.
   * törmäyksessä), piirretään vanhasta paikasta ja liu'utaan uuteen.
   */
  readonly renderOffset = { x: 0, y: 0 };
  /** Palvelin hylkäsi heiton. */
  onCastRejected: (() => void) | null = null;
  /** Toinen pelaaja poistui kisasta. */
  onPeerLeft: ((name: string) => void) | null = null;
  /** Uusi pelaaja (tai kisasta pudonnut) tuli mukaan kesken kisan. */
  onPeerJoined: ((name: string) => void) | null = null;
  /** Ensimmäinen tila käsitelty: siinä olleet eivät ole "tulleet mukaan". */
  private primed = false;
  /** Toisen pelaajan yhteys katkesi tai palasi. */
  onPeerConnection: ((name: string, connected: boolean) => void) | null = null;
  private readonly peerConnected = new Map<string, boolean>();
  /** Palvelin ei hyväksynyt saalista punnitukseen. */
  onCatchRejected: (() => void) | null = null;
  /** Salama iski jonnekin järvelle. */
  onLightning: ((msg: LightningMessage) => void) | null = null;
  /** Iso aalto osui. */
  onBigWave: ((msg: BigWaveMessage) => void) | null = null;
  /** Trombi nappasi renkaita. */
  onSpout: ((msg: SpoutMessage) => void) | null = null;
  /** Muiden lennot trombin mukana: lento ja sen alku (paikallinen kello, s). */
  private readonly flights = new Map<string, { flight: SpoutFlight; start: number }>();
  /** Siimasotku selvisi. */
  onUntangled: ((msg: UntangledMessage) => void) | null = null;
  onRecord: ((msg: RecordMessage) => void) | null = null;
  /** Kala nostettiin (yleensä toinen pelaaja): sama kala pois omasta kalakannasta. */
  onRemoteCatch: ((fish: FishTag, angler: string) => void) | null = null;
  private seenCatches = 0;
  /** Toisen pelaajan käsimerkki ja chat-viesti puhekuplaksi. */
  onEmote: ((msg: EmoteMessage) => void) | null = null;
  onChatBubble: ((msg: ChatMessage) => void) | null = null;
  /** Uusi punnittu saalis kisan aikana ja saajan paikka (tulossivun karttaan, tunnisteena nimi). */
  onCatchSeen: ((mark: RaceCatchMark) => void) | null = null;

  constructor(
    private readonly session: NetSession,
    water: WaterBody,
    private readonly clock: () => number = () => performance.now() / 1000,
  ) {
    const me = session.room.state.players.get(session.sessionId);
    if (!me) throw new Error('Oma pelaaja puuttuu huoneesta');
    // Uudelleenyhdistäessä syötteiden numerointi jatkuu palvelimen kuittauksesta.
    this.predictor = new TubePredictor(toTube(me), water, () => this.latestOthers, me.ack);
    session.onState = (s) => this.onState(s);
    session.onCastRejected = () => this.onCastRejected?.();
    session.onCatchRejected = () => this.onCatchRejected?.();
    session.onLightning = (m) => this.onLightning?.(m);
    session.onBigWave = (m) => this.onBigWave?.(m);
    session.onSpout = (m) => {
      for (const f of m.flights ?? [])
        this.flights.set(f.id, {
          flight: { from: { x: f.fromX, y: f.fromY }, to: { x: f.toX, y: f.toY } },
          start: this.clock(),
        });
      this.onSpout?.(m);
    };
    session.onUntangled = (m) => this.onUntangled?.(m);
    session.onRecord = (m) => this.onRecord?.(m);
    session.onEmote = (m) => this.onEmote?.(m);
    session.onChatBubble = (m) => this.onChatBubble?.(m);
  }

  sendEmote(emote: EmoteId): void {
    this.session.sendEmote(emote);
  }

  cutLine(): void {
    this.session.sendCutLine();
  }

  /** Siima katkaistiin maalle juuttuneen vieheen takia: palvelin kirjaa aikasakon. */
  landCut(): void {
    this.session.sendLandCut();
  }

  sendTackle(t: Tackle): void {
    this.session.sendTackle(t);
  }

  /** Oma siima sotkussa: kenen kanssa, missä ja selvitys 0–1. */
  get tangle(): { with: string; at: Vec2; progress: number } | null {
    const players = this.session.room.state.players;
    const me = players.get(this.session.sessionId);
    if (!me?.tangledWith) return null;
    return {
      with: players.get(me.tangledWith)?.name ?? '?',
      at: { x: me.tangleX, y: me.tangleY },
      progress: me.untangle,
    };
  }

  /** Kaikkien sotkujen kohdat piirtoa varten. */
  tangles(): Vec2[] {
    return this.tangleSpots().map((t) => t.pos);
  }

  /** Sotkut avaimineen (pelaajaparin sessionId:t). */
  tangleSpots(): { key: string; pos: Vec2 }[] {
    const out: { key: string; pos: Vec2 }[] = [];
    this.session.room.state.players.forEach((p, id) => {
      if (p.tangledWith && id < p.tangledWith)
        out.push({ key: `${id}|${p.tangledWith}`, pos: { x: p.tangleX, y: p.tangleY } });
    });
    return out;
  }

  /**
   * Kaikkien renkaiden paikat palvelimen tilasta (tulossivun reitteihin).
   * Tunnisteena nimi: se on huoneessa yksilöllinen ja säilyy kisaan palatessa,
   * vaikka sessionId vaihtuu.
   */
  racePlayers(): RacePlayerSpot[] {
    const out: RacePlayerSpot[] = [];
    this.session.room.state.players.forEach((p) => {
      if (!p.spectator) out.push({ id: p.name, name: p.name, pos: { x: p.x, y: p.y } });
    });
    return out;
  }

  /** Pelaajan renkaan paikka palvelimen tilasta; null, jos pelaaja ei ole huoneessa. */
  playerPos(id: string): Vec2 | null {
    const p = this.session.room.state.players.get(id);
    return p ? { x: p.x, y: p.y } : null;
  }

  /** Oma pelaaja katsoo kisaa: ei omaa rengasta eikä vapaa. */
  get spectating(): boolean {
    return this.session.spectating;
  }

  playerName(id: string): string {
    return this.session.room.state.players.get(id)?.name ?? '?';
  }

  sendSplash(p: Vec2): void {
    this.session.sendSplash({ x: p.x, y: p.y });
  }

  sendCatch(c: Catch): void {
    this.session.sendCatch(c);
  }

  get phase(): RoomPhase {
    return this.session.room.state.phase as RoomPhase;
  }

  /** Kisa-aika palvelimen kellosta (s). */
  get raceClock(): number {
    return this.session.room.state.clock;
  }

  get countdown(): number {
    return this.session.room.state.countdown;
  }

  get myId(): string {
    return this.session.sessionId;
  }

  /** Omat värit palvelimen tilasta, samat jotka muut näkevät. */
  get ownAppearance(): Appearance | null {
    const me = this.session.room.state.players.get(this.session.sessionId);
    return me ? playerAppearance(me) : null;
  }

  /** Aulassa valitut omat varusteet palvelimen tilasta. */
  get ownTackle(): Tackle | null {
    const me = this.session.room.state.players.get(this.session.sessionId);
    return me ? playerTackle(me) : null;
  }

  /** Oma nimi palvelimen tilasta (palvelin voi muuttaa sitä). */
  get ownName(): string | null {
    return this.session.room.state.players.get(this.session.sessionId)?.name ?? null;
  }

  /** Oma salaman jäähy: kalastaa ei voi ennen tätä kisa-aikaa (s). */
  get outUntil(): number {
    return this.session.room.state.players.get(this.session.sessionId)?.outUntil ?? 0;
  }

  /** Oma rengas kumossa tähän kisa-aikaan asti (s). */
  get capsizedUntil(): number {
    return this.session.room.state.players.get(this.session.sessionId)?.capsizedUntil ?? 0;
  }

  results(): PlayerResult[] {
    return this.session.results();
  }

  /** Kisan sijoitukset: venekunnat joukkueina. */
  standings(): PlayerResult[] {
    return this.session.standings();
  }

  /** Omat jo punnitut saaliit (kisaan palatessa). */
  ownCatches(): CatchRecord[] {
    return [...this.session.room.state.catches]
      .filter((c) => c.player === this.session.sessionId)
      .map((c) => ({
        species: c.species as CatchRecord['species'],
        name: c.name,
        weight: c.weight,
        time: c.time,
      }));
  }

  /** Veneessä kyydissä: vain soutaja liikuttaa venettä (#263). */
  get passenger(): boolean {
    return this.ownBoat > 0 && this.ownSeat !== BoatSeat.rower;
  }

  /** Oma vene (1…); 0 = kelluntarengas tai katsoja. */
  get boat(): number {
    return this.ownBoat;
  }

  /**
   * Syöte, joka veneessä oikeasti liikuttaa: kyytiläinen vain kääntyy, ja
   * soutaja ei soua heiton aikana eikä kelatessa. Palvelin tekee samoin.
   */
  effectiveInput(input: TubeInput, lureStage: number, reeling = false): TubeInput {
    if (!this.ownBoat) return input;
    return this.passenger
      ? passengerInput(input)
      : rowerInput(input, rodInHand(lureStage, reeling));
  }

  /**
   * Oma askel: ennakoidaan heti ja lähetetään syötteet erissä. `look` =
   * soutajan kääntyminen tuhdolla (rad veneen suunnasta), muille näytettäväksi.
   */
  stepOwn(
    input: TubeInput,
    lure: Vec2 | null,
    lureStage: number,
    wind?: Vec2,
    reeling = false,
    look = 0,
  ): TubeState {
    const decay = Math.exp(-NET_DT * 10);
    this.renderOffset.x *= decay;
    this.renderOffset.y *= decay;
    let tube = this.predictor.step(this.effectiveInput(input, lureStage, reeling), wind);
    // Kyydissä paikka tulee veneestä, sellaisena kuin se piirretään.
    const boat = this.passenger ? this.rowerOfOwnBoat() : null;
    if (boat) tube = { ...tube, pos: seatPos(boat.snap, this.ownSeat), vel: { ...boat.vel } };
    this.lure = lure ? [lure.x, lure.y, lureStage, reeling ? 1 : 0] : [0, 0, LureStage.none, 0];
    const out = this.predictor.takeOutgoing();
    if (out) this.session.sendInput({ i: encodeInputs(out), l: this.lure, ...(look && { look }) });
    return tube;
  }

  private onState(s: StateSchema): void {
    const stamp = this.stamps.stamp(this.clock(), s.phase === 'playing' ? s.clock : null);
    const seen = new Set<string>();
    const others: CraftBody[] = [];
    s.players.forEach((p, id) => {
      // Katsojalla ei ole rengasta järvellä.
      if (p.spectator) return;
      const rower = (p.boat ?? 0) === 0 || (p.seat ?? 0) === BoatSeat.rower;
      if (id === this.session.sessionId) {
        this.ownBoat = p.boat ?? 0;
        this.ownSeat = this.ownBoat ? (p.seat ?? 0) : BoatSeat.rower;
        this.predictor.craft = this.ownBoat && !this.passenger ? CRAFTS.boat : CRAFTS.tube;
        if (this.passenger) {
          // Kyydissä ennakoidaan vain kääntyminen; paikka tulee veneestä.
          this.predictor.reconcile(toTube(p), p.ack);
          this.renderOffset.x = this.renderOffset.y = 0;
          return;
        }
        const before = this.predictor.tube.pos;
        this.predictor.reconcile(toTube(p), p.ack);
        const after = this.predictor.tube.pos;
        this.renderOffset.x += before.x - after.x;
        this.renderOffset.y += before.y - after.y;
        // Iso hyppy (esim. palvelimen siirto): ei liu'uteta.
        if (Math.hypot(this.renderOffset.x, this.renderOffset.y) > 5)
          this.renderOffset.x = this.renderOffset.y = 0;
        return;
      }
      // Kyytiläiset ovat veneen sisällä: törmätään vain aluksiin.
      if (rower) others.push({ tube: toTube(p), craft: p.boat ? CRAFTS.boat : CRAFTS.tube });
      seen.add(id);
      let r = this.remotes.get(id);
      if (!r) {
        r = {
          name: p.name,
          player: p.name,
          appearance: playerAppearance(p),
          fly: p.method === 'fly',
          buf: new SnapshotBuffer(lerpSnap),
          boat: 0,
          seat: 0,
          vel: { x: 0, y: 0 },
          capsizedUntil: 0,
        };
        this.peerConnected.set(id, p.connected);
        this.remotes.set(id, r);
        if (this.primed) this.onPeerJoined?.(p.name);
      }
      r.player = p.name;
      r.name = p.connected ? p.name : t('game.peerOffline', { name: p.name });
      r.appearance = playerAppearance(p);
      r.fly = p.method === 'fly';
      r.boat = p.boat ?? 0;
      r.seat = r.boat ? (p.seat ?? 0) : BoatSeat.rower;
      r.vel = { x: p.vx, y: p.vy };
      r.capsizedUntil = p.capsizedUntil;
      const was = this.peerConnected.get(id);
      if (was !== undefined && was !== p.connected) this.onPeerConnection?.(p.name, p.connected);
      this.peerConnected.set(id, p.connected);
      r.buf.push(stamp, {
        pos: { x: p.x, y: p.y },
        heading: p.heading,
        kickPhase: p.kickPhase,
        lure: { x: p.lureX, y: p.lureY },
        lureStage: p.lureStage,
        look: p.look ?? 0,
      });
    });
    for (const [id, r] of this.remotes)
      if (!seen.has(id)) {
        this.remotes.delete(id);
        this.peerConnected.delete(id);
        this.onPeerLeft?.(r.player);
      }
    // Kyydissä ei törmätä mihinkään: vene on soutajan.
    this.latestOthers = this.passenger ? [] : others;
    const first = !this.primed;
    this.primed = true;
    const catches = [...s.catches];
    // Lista lyheni (esim. saalis menetettiin jäähyssä): kaikki käydään uudelleen läpi.
    const replay = catches.length < this.seenCatches;
    if (replay) this.seenCatches = 0;
    // Myös omat: sivun uudelleenlatauksen jälkeen kalakanta on luotu alusta, ja
    // jo nostetut kalat pitää poistaa. Kesken kisan nostettu oma kala on jo
    // korvattu seuraavalla sukupolvella, joten sen tunniste ei enää osu.
    for (const c of catches.slice(this.seenCatches)) {
      if (c.fishSlot >= 0) this.onRemoteCatch?.({ slot: c.fishSlot, gen: c.fishGen }, c.angler);
      // Ennen liittymistä nostettujen (ja uudelleen läpi käytävien) kalojen paikkaa ei tiedetä.
      const p = first || replay ? undefined : s.players.get(c.player);
      if (p)
        this.onCatchSeen?.({
          id: c.angler,
          pos: { x: p.x, y: p.y },
          species: c.species as RaceCatchMark['species'],
          name: c.name,
          weight: c.weight,
          time: c.time,
        });
    }
    this.seenCatches = catches.length;
  }

  /** Toisen pelaajan tila piirtohetkellä `t` (paikallinen kello miinus viive). */
  private sampleRemote(r: { buf: SnapshotBuffer<RemoteSnap> }, t: number): RemoteSnap | null {
    const held = r.buf.sample(t);
    if (!held) return null;
    const ahead = r.buf.sample(t, EXTRAPOLATE)!;
    return Math.hypot(ahead.pos.x - held.pos.x, ahead.pos.y - held.pos.y) <= EXTRAPOLATE_MAX
      ? ahead
      : held;
  }

  /** Oman veneen soutaja (toinen pelaaja) piirtohetkellä, kun itse on kyydissä. */
  private rowerOfOwnBoat(): { snap: RemoteSnap; vel: Vec2 } | null {
    const t = this.clock() - INTERPOLATION_DELAY;
    for (const r of this.remotes.values())
      if (r.boat === this.ownBoat && r.seat === BoatSeat.rower) {
        const snap = this.sampleRemote(r, t);
        return snap ? { snap, vel: r.vel } : null;
      }
    return null;
  }

  /** Toisen pelaajan kallistus kaatumisen jälkeen (rad). */
  private rollOf(r: { capsizedUntil: number }): number {
    return capsizeRoll(this.raceClock - (r.capsizedUntil - BIG_WAVE.recover));
  }

  /**
   * Veneet piirtohetkellä soutajien mukaan. Oma vene on omassa asennossa
   * (`own`), muut interpoloituina kuten muut pelaajat.
   */
  boats(own?: OwnPose): BoatPose[] {
    const out: BoatPose[] = [];
    const me = this.ownAppearance;
    if (this.ownBoat && !this.passenger) {
      const pose = own ?? this.predictor.tube;
      out.push({
        boat: this.ownBoat,
        pos: pose.pos,
        heading: pose.heading,
        kickPhase: pose.kickPhase,
        color: me?.tube ?? 0,
        roll: own?.roll,
      });
    }
    for (const o of this.others())
      if (o.boat && o.seat === BoatSeat.rower)
        out.push({
          boat: o.boat,
          pos: o.pos,
          heading: o.heading,
          kickPhase: o.kickPhase,
          color: o.appearance.tube,
          lift: o.lift,
          tumble: o.tumble,
          roll: o.roll,
        });
    return out;
  }

  /**
   * Muiden pelaajien sijainnit piirtohetkellä. Veneen kyytiläiset istuvat
   * veneessä sellaisena kuin se piirretään; omassa veneessä asento `own`.
   */
  others(own?: OwnPose): RemotePlayer[] {
    const t = this.clock() - INTERPOLATION_DELAY;
    const out: RemotePlayer[] = [];
    // Veneiden asento soutajasta: kyytiläiset piirretään sen mukaan, ettei vene "vuoda".
    const rowers = new Map<number, { pos: Vec2; heading: number }>();
    if (this.ownBoat && !this.passenger) rowers.set(this.ownBoat, own ?? this.predictor.tube);
    for (const r of this.remotes.values())
      if (r.boat && r.seat === BoatSeat.rower) {
        const snap = this.sampleRemote(r, t);
        if (snap) rowers.set(r.boat, snap);
      }
    for (const [id, r] of this.remotes) {
      const s = this.sampleRemote(r, t);
      if (!s) continue;
      const boat = r.boat && r.seat !== BoatSeat.rower ? rowers.get(r.boat) : undefined;
      const air = this.inFlight(id, t, s.pos);
      out.push({
        id,
        name: r.name,
        pos: air?.pos ?? (boat ? seatPos(boat, r.seat) : s.pos),
        lift: air?.height,
        tumble: air?.tumble,
        heading: s.heading + (air?.spin ?? 0),
        kickPhase: s.kickPhase,
        lure: s.lureStage !== LureStage.none ? s.lure : null,
        lureStage: s.lureStage,
        appearance: r.appearance,
        fly: r.fly,
        boat: r.boat,
        seat: r.seat,
        look: r.boat && r.seat === BoatSeat.rower ? s.look : 0,
        roll: this.rollOf(r),
      });
    }
    return out;
  }

  /**
   * Toisen pelaajan lento trombin mukana hetkellä t (piirron kello): palvelin
   * siirsi renkaan heti perille, joten kaari piirretään lähtöpaikasta sinne.
   */
  private inFlight(id: string, t: number, now: Vec2) {
    const f = this.flights.get(id);
    if (!f) return null;
    // Lento alkaa viestistä; palvelimen siirto näkyy vasta myöhemmin tiloissa,
    // joten loppua kohti kaari kääntyy kohti piirrettävää paikkaa.
    const k = (t + INTERPOLATION_DELAY - f.start) / SPOUT.flight;
    if (k >= 1) {
      this.flights.delete(id);
      return null;
    }
    if (k < 0) return null;
    return flightPose(f.flight, k, now);
  }

  dispose(): void {
    this.session.onState = null;
    this.session.onCastRejected = null;
    this.session.onCatchRejected = null;
    this.session.onLightning = null;
    this.session.onBigWave = null;
    this.session.onSpout = null;
    this.session.onUntangled = null;
    this.session.onRecord = null;
    this.session.onEmote = null;
    this.session.onChatBubble = null;
  }
}
