import {
  LureStage,
  NET_DT,
  SnapshotBuffer,
  TubePredictor,
  encodeInputs,
  lerpAngle,
  type BigWaveMessage,
  type Catch,
  type LightningMessage,
  type UntangledMessage,
  type PlayerResult,
  type RoomPhase,
  type TubeInput,
  type TubeState,
  type Vec2,
  type WaterBody,
} from '@lunki/shared';
import type { NetSession, PlayerSchema, StateSchema } from './session';

/** Muut pelaajat piirretään näin paljon menneisyydestä (s), jotta liike on pehmeää. */
const INTERPOLATION_DELAY = 0.12;

export interface RemotePlayer {
  id: string;
  name: string;
  pos: Vec2;
  heading: number;
  kickPhase: number;
  lure: Vec2 | null;
  lureStage: number;
}

interface RemoteSnap {
  pos: Vec2;
  heading: number;
  kickPhase: number;
  lure: Vec2;
  lureStage: number;
}

const lerpSnap = (a: RemoteSnap, b: RemoteSnap, t: number): RemoteSnap => ({
  pos: { x: a.pos.x + (b.pos.x - a.pos.x) * t, y: a.pos.y + (b.pos.y - a.pos.y) * t },
  heading: lerpAngle(a.heading, b.heading, t),
  kickPhase: b.kickPhase,
  lure: { x: a.lure.x + (b.lure.x - a.lure.x) * t, y: a.lure.y + (b.lure.y - a.lure.y) * t },
  lureStage: t < 0.5 ? a.lureStage : b.lureStage,
});

const toTube = (p: PlayerSchema): TubeState => ({
  pos: { x: p.x, y: p.y },
  vel: { x: p.vx, y: p.vy },
  heading: p.heading,
  angVel: p.angVel,
  kickPhase: p.kickPhase,
});

/**
 * Moninpelin maailma asiakkaalla: oman renkaan ennakointi ja muiden
 * pelaajien interpolointi palvelimen tiloista.
 */
export class NetWorld {
  readonly predictor: TubePredictor;
  private readonly remotes = new Map<string, { name: string; buf: SnapshotBuffer<RemoteSnap> }>();
  private lure: [number, number, number, number] = [0, 0, LureStage.none, 0];
  /** Muiden viimeisimmät palvelintilat (ennakoinnin törmäyksiin). */
  private latestOthers: TubeState[] = [];
  /**
   * Korjauksen pehmennys: kun palvelin siirtää omaa rengasta (esim.
   * törmäyksessä), piirretään vanhasta paikasta ja liu'utaan uuteen.
   */
  readonly renderOffset = { x: 0, y: 0 };
  /** Palvelin hylkäsi heiton. */
  onCastRejected: (() => void) | null = null;
  /** Toinen pelaaja poistui kisasta. */
  onPeerLeft: ((name: string) => void) | null = null;
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
  onSpout: ((msg: BigWaveMessage) => void) | null = null;
  /** Siimasotku selvisi. */
  onUntangled: ((msg: UntangledMessage) => void) | null = null;

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
    session.onSpout = (m) => this.onSpout?.(m);
    session.onUntangled = (m) => this.onUntangled?.(m);
  }

  cutLine(): void {
    this.session.sendCutLine();
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
    const out: Vec2[] = [];
    this.session.room.state.players.forEach((p, id) => {
      if (p.tangledWith && id < p.tangledWith) out.push({ x: p.tangleX, y: p.tangleY });
    });
    return out;
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

  /** Oma askel: ennakoidaan heti ja lähetetään syötteet erissä. */
  stepOwn(
    input: TubeInput,
    lure: Vec2 | null,
    lureStage: number,
    wind?: Vec2,
    reeling = false,
  ): TubeState {
    const decay = Math.exp(-NET_DT * 10);
    this.renderOffset.x *= decay;
    this.renderOffset.y *= decay;
    const tube = this.predictor.step(input, wind);
    this.lure = lure ? [lure.x, lure.y, lureStage, reeling ? 1 : 0] : [0, 0, LureStage.none, 0];
    const out = this.predictor.takeOutgoing();
    if (out) this.session.sendInput({ i: encodeInputs(out), l: this.lure });
    return tube;
  }

  private onState(s: StateSchema): void {
    const now = this.clock();
    const seen = new Set<string>();
    const others: TubeState[] = [];
    s.players.forEach((p, id) => {
      if (id === this.session.sessionId) {
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
      others.push(toTube(p));
      seen.add(id);
      let r = this.remotes.get(id);
      if (!r) {
        r = { name: p.name, buf: new SnapshotBuffer(lerpSnap) };
        this.peerConnected.set(id, p.connected);
        this.remotes.set(id, r);
      }
      r.name = p.connected ? p.name : `${p.name} (katkos)`;
      const was = this.peerConnected.get(id);
      if (was !== undefined && was !== p.connected) this.onPeerConnection?.(p.name, p.connected);
      this.peerConnected.set(id, p.connected);
      r.buf.push(now, {
        pos: { x: p.x, y: p.y },
        heading: p.heading,
        kickPhase: p.kickPhase,
        lure: { x: p.lureX, y: p.lureY },
        lureStage: p.lureStage,
      });
    });
    for (const [id, r] of this.remotes)
      if (!seen.has(id)) {
        this.remotes.delete(id);
        this.peerConnected.delete(id);
        this.onPeerLeft?.(r.name.replace(/ \(katkos\)$/, ''));
      }
    this.latestOthers = others;
  }

  /** Muiden pelaajien sijainnit piirtohetkellä. */
  others(): RemotePlayer[] {
    const t = this.clock() - INTERPOLATION_DELAY;
    const out: RemotePlayer[] = [];
    for (const [id, r] of this.remotes) {
      const s = r.buf.sample(t);
      if (!s) continue;
      out.push({
        id,
        name: r.name,
        pos: s.pos,
        heading: s.heading,
        kickPhase: s.kickPhase,
        lure: s.lureStage !== LureStage.none ? s.lure : null,
        lureStage: s.lureStage,
      });
    }
    return out;
  }

  dispose(): void {
    this.session.onState = null;
    this.session.onCastRejected = null;
    this.session.onCatchRejected = null;
    this.session.onLightning = null;
    this.session.onBigWave = null;
    this.session.onSpout = null;
    this.session.onUntangled = null;
  }
}
