import {
  LureStage,
  SnapshotBuffer,
  TubePredictor,
  encodeInputs,
  lerpAngle,
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
  private lure: [number, number, number] = [0, 0, LureStage.none];
  private lastAck = -1;
  /** Palvelin hylkäsi heiton. */
  onCastRejected: (() => void) | null = null;

  constructor(
    private readonly session: NetSession,
    water: WaterBody,
    private readonly clock: () => number = () => performance.now() / 1000,
  ) {
    const me = session.room.state.players.get(session.sessionId);
    if (!me) throw new Error('Oma pelaaja puuttuu huoneesta');
    this.predictor = new TubePredictor(toTube(me), water);
    session.onState = (s) => this.onState(s);
    session.onCastRejected = () => this.onCastRejected?.();
  }

  sendSplash(p: Vec2): void {
    this.session.sendSplash({ x: p.x, y: p.y });
  }

  /** Oma askel: ennakoidaan heti ja lähetetään syötteet erissä. */
  stepOwn(input: TubeInput, lure: Vec2 | null, lureStage: number): TubeState {
    const tube = this.predictor.step(input);
    this.lure = lure ? [lure.x, lure.y, lureStage] : [0, 0, LureStage.none];
    const out = this.predictor.takeOutgoing();
    if (out) this.session.sendInput({ i: encodeInputs(out), l: this.lure });
    return tube;
  }

  private onState(s: StateSchema): void {
    const now = this.clock();
    const seen = new Set<string>();
    s.players.forEach((p, id) => {
      if (id === this.session.sessionId) {
        if (p.ack !== this.lastAck) {
          this.lastAck = p.ack;
          this.predictor.reconcile(toTube(p), p.ack);
        }
        return;
      }
      seen.add(id);
      let r = this.remotes.get(id);
      if (!r) {
        r = { name: p.name, buf: new SnapshotBuffer(lerpSnap) };
        this.remotes.set(id, r);
      }
      r.name = p.name;
      r.buf.push(now, {
        pos: { x: p.x, y: p.y },
        heading: p.heading,
        kickPhase: p.kickPhase,
        lure: { x: p.lureX, y: p.lureY },
        lureStage: p.lureStage,
      });
    });
    for (const id of this.remotes.keys()) if (!seen.has(id)) this.remotes.delete(id);
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
  }
}
