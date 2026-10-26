import { collideTubeWithShore, stepTube, type TubeInput, type TubeState } from '../physics/tube';
import { collideTubePair } from '../physics/tubeCollision';
import { REEDS } from '../map/reeds';
import type { WaterBody } from '../map/waterBody';
import type { Vec2 } from '../vec2';

/**
 * Renkaan liikkeen verkkosynkronointi. Palvelin on totuus: se ajaa jokaisen
 * pelaajan syötteet samalla jaetulla fysiikalla. Asiakas ennakoi oman
 * renkaansa heti ja korjaa, kun palvelimen tila saapuu.
 */

/** Kiinteä askel sekä asiakkaalla että palvelimella. */
export const NET_DT = 1 / 60;
/** Montako askelta syötteitä kerätään yhteen viestiin (60/3 = 20 viestiä/s). */
export const INPUT_BATCH = 3;
/** Palvelin pudottaa vanhimmat, jos jono kasvaa tätä pidemmäksi (n. 0,5 s). */
export const MAX_INPUT_QUEUE = 30;

export interface NetInput extends TubeInput {
  /** Juokseva numero, jolla palvelin kuittaa käsitellyt syötteet. */
  seq: number;
}

/** Pakkaa syötteen yhdeksi luvuksi: potku, käännös ja pikapotku. */
export function packInput(i: TubeInput): number {
  const kick = Math.max(-1, Math.min(1, Math.round(i.kick))) + 1;
  const turn = Math.max(-1, Math.min(1, Math.round(i.turn))) + 1;
  return kick | (turn << 2) | (i.sprint ? 16 : 0);
}

export function unpackInput(packed: number): TubeInput {
  const p = packed | 0;
  return {
    kick: Math.min(2, p & 3) - 1,
    turn: Math.min(2, (p >> 2) & 3) - 1,
    sprint: (p & 16) !== 0,
  };
}

/** Viestin muoto: [seq1, packed1, seq2, packed2, …]. */
export function encodeInputs(list: NetInput[]): number[] {
  const out: number[] = [];
  for (const i of list) out.push(i.seq, packInput(i));
  return out;
}

export function decodeInputs(data: unknown): NetInput[] {
  if (!Array.isArray(data)) return [];
  const out: NetInput[] = [];
  for (let k = 0; k + 1 < data.length && out.length < MAX_INPUT_QUEUE; k += 2) {
    const seq = data[k];
    const packed = data[k + 1];
    if (typeof seq !== 'number' || typeof packed !== 'number' || !Number.isFinite(seq)) continue;
    out.push({ seq, ...unpackInput(packed) });
  }
  return out;
}

/** Yksi askel: fysiikka, kaislikon vastus ja rantatörmäys. Sama asiakkaalla ja palvelimella. */
export function stepPlayerTube(
  tube: TubeState,
  input: TubeInput,
  water: WaterBody,
  dt = NET_DT,
  wind?: Vec2,
): TubeState {
  const drag = water.reedsAt(tube.pos) ? REEDS.drag : 1;
  return collideTubeWithShore(tube, stepTube(tube, input, dt, wind, drag), water);
}

/**
 * Palvelimen syötejono yhdelle pelaajalle. Jokainen palvelimen askel kuluttaa
 * korkeintaan yhden syötteen, joten asiakas ei voi nopeuttaa peliä
 * lähettämällä enemmän. Tyhjällä jonolla rengas odottaa: palvelimen tila
 * vastaa silloin aina tarkasti kuitattuja syötteitä, ja ennakointi osuu.
 */
export class InputQueue {
  private queue: NetInput[] = [];
  /** Viimeisin käsitelty seq (kuittaus asiakkaalle). */
  lastSeq = 0;

  push(inputs: NetInput[]): void {
    for (const i of inputs) {
      const newest = this.queue.length > 0 ? this.queue[this.queue.length - 1]!.seq : this.lastSeq;
      if (i.seq > newest) this.queue.push(i);
    }
    if (this.queue.length > MAX_INPUT_QUEUE)
      this.queue.splice(0, this.queue.length - MAX_INPUT_QUEUE);
  }

  next(): TubeInput | null {
    const i = this.queue.shift();
    if (!i) return null;
    this.lastSeq = i.seq;
    return i;
  }

  get length(): number {
    return this.queue.length;
  }

  /** Yhteys katkesi: jonossa olevat hylätään, kuittaus säilyy. */
  clear(): void {
    this.queue = [];
  }
}

export const cloneTube = (t: TubeState): TubeState => ({
  pos: { ...t.pos },
  vel: { ...t.vel },
  heading: t.heading,
  angVel: t.angVel,
  kickPhase: t.kickPhase,
  stamina: t.stamina,
});

/**
 * Törmäyttää renkaan muihin (joita ei liikuteta) ja pitää sen vedessä.
 * Palvelin liikuttaa molempia; ennakoinnissa muut ovat paikallaan, joten
 * törmäyksessä syntyy pieni korjaus, joka pehmennetään piirrossa.
 */
export function collideWithOthers(
  tube: TubeState,
  others: readonly TubeState[],
  water: WaterBody,
): TubeState {
  let t = tube;
  for (const o of others) {
    const r = collideTubePair(t, o);
    if (r) t = collideTubeWithShore(t, r[0], water);
  }
  return t;
}

/**
 * Asiakkaan ennakointi: oma rengas liikkuu heti syötteen mukaan. Kun palvelimen
 * tila ja kuittaus saapuvat, lähdetään palvelimen tilasta ja ajetaan
 * kuittaamattomat syötteet uudelleen.
 */
export class TubePredictor {
  tube: TubeState;
  /** Kuittaamattomat syötteet ja tuuli, jolla kukin ennakoitiin. */
  private pending: (NetInput & { wind?: Vec2 })[] = [];
  private outbox: NetInput[] = [];
  private seq = 0;
  /** Viimeisimmän korjauksen suuruus (m), seurantaa varten. */
  lastCorrection = 0;

  constructor(
    start: TubeState,
    private readonly water: WaterBody,
    /** Muiden pelaajien viimeisimmät palvelintilat törmäyksiä varten. */
    private readonly others: () => readonly TubeState[] = () => [],
    /** Uudelleenyhdistäessä numerointi jatkuu palvelimen kuittauksesta. */
    startSeq = 0,
  ) {
    this.tube = cloneTube(start);
    this.seq = startSeq;
  }

  private advance(t: TubeState, input: TubeInput, wind?: Vec2): TubeState {
    return collideWithOthers(
      stepPlayerTube(t, input, this.water, NET_DT, wind),
      this.others(),
      this.water,
    );
  }

  /**
   * Oma askel: ennakoi ja jonottaa syötteen lähetettäväksi. Tuuli lasketaan
   * palvelimella sen kellosta; ennakoinnin pieni ero korjautuu täsmäytyksessä.
   */
  step(input: TubeInput, wind?: Vec2): TubeState {
    const net: NetInput = { seq: ++this.seq, ...input };
    this.pending.push(wind ? { ...net, wind } : net);
    this.outbox.push(net);
    this.tube = this.advance(this.tube, net, wind);
    return this.tube;
  }

  /** Palauttaa lähetettävät syötteet, kun niitä on kertynyt erän verran. */
  takeOutgoing(force = false): NetInput[] | null {
    if (this.outbox.length < INPUT_BATCH && !(force && this.outbox.length > 0)) return null;
    const out = this.outbox;
    this.outbox = [];
    return out;
  }

  /** Palvelimen tila saapui: korjaa ja ennakoi uudelleen. */
  reconcile(server: TubeState, ackSeq: number): void {
    while (this.pending.length > 0 && this.pending[0]!.seq <= ackSeq) this.pending.shift();
    let t = cloneTube(server);
    for (const i of this.pending) t = this.advance(t, i, i.wind);
    this.lastCorrection = Math.hypot(t.pos.x - this.tube.pos.x, t.pos.y - this.tube.pos.y);
    this.tube = t;
  }

  get unacked(): number {
    return this.pending.length;
  }
}

export interface Snapshot<T> {
  time: number;
  value: T;
}

/**
 * Muiden pelaajien pehmeä liike: tilat puskuroidaan ja piirretään hieman
 * menneisyydestä kahden tilan välistä interpoloiden.
 */
export class SnapshotBuffer<T> {
  private snaps: Snapshot<T>[] = [];

  constructor(
    private readonly lerp: (a: T, b: T, t: number) => T,
    private readonly maxAge = 2,
  ) {}

  push(time: number, value: T): void {
    const last = this.snaps[this.snaps.length - 1];
    if (last && time <= last.time) return;
    this.snaps.push({ time, value });
    while (this.snaps.length > 2 && this.snaps[0]!.time < time - this.maxAge) this.snaps.shift();
  }

  sample(time: number): T | null {
    const s = this.snaps;
    if (s.length === 0) return null;
    if (time <= s[0]!.time) return s[0]!.value;
    for (let k = s.length - 1; k >= 0; k--) {
      const a = s[k]!;
      if (a.time <= time) {
        const b = s[k + 1];
        if (!b) return a.value;
        return this.lerp(a.value, b.value, (time - a.time) / (b.time - a.time));
      }
    }
    return s[s.length - 1]!.value;
  }
}

/**
 * Tilojen aikaleimat ilman verkon heittelyä. Saapumishetki vaihtelee paketti
 * paketilta, ja sillä leimattuna tasainen liike nykii (tila tulee "liian
 * aikaisin" tai "myöhään"). Kisan aikana palvelimen kello kertoo, mihin
 * hetkeen tila kuuluu: leimaksi tulee palvelimen aika plus arvio kellojen
 * erosta. Arvio seuraa nopeimmin perille tulleita, nousee hitaasti (palvelin
 * jätättää, kellot ajelehtivat) ja alkaa alusta isossa hypyssä (uusi kisa,
 * katkos). Ilman palvelimen aikaa (aula, lähtölaskenta) leimana on saapumishetki.
 */
export class SnapshotClock {
  private offset: number | null = null;

  constructor(
    /** Kuinka suuri osa erosta korjataan kerralla, kun arvio on liian pieni. */
    private readonly rise = 0.05,
    /** Tätä suurempi ero (s) aloittaa arvion alusta. */
    private readonly resetAfter = 0.5,
  ) {}

  stamp(arrival: number, serverTime: number | null): number {
    if (serverTime === null) {
      this.offset = null;
      return arrival;
    }
    const o = arrival - serverTime;
    if (this.offset === null || o < this.offset || o - this.offset > this.resetAfter)
      this.offset = o;
    else this.offset += (o - this.offset) * this.rise;
    return serverTime + this.offset;
  }
}
