import { Rng, type LakeMap, type Season, type Vec2, type WaterBody } from '@lunki/shared';
import type { BirdEvent, BirdPose } from './birdPose';

/**
 * Vesilinnut tunnelmaksi (#572): sorsat kaislikon reunassa, laulujoutsenet
 * selällä ja kuikka, joka sukeltaa ja nousee pintaan toisaalla. Linnut ovat
 * pelkkää näkymää: ne eivät vaikuta kaloihin, sääntöihin eivätkä törmää
 * mihinkään.
 *
 * Parvet ja niiden kotipaikat arvotaan kisan siemenestä, ja jokaisella
 * parvella on oma siemennetty arpansa. Moninpelissä kaikki näkevät samat
 * linnut samoilla paikoilla ilman palvelinta; ne väistävät kaikkia
 * kulkupelejä, joten ne myös pakenevat kaikilla samaan suuntaan. Vain oman
 * vieheen molskahdus säikäyttää linnut pelkästään omassa pelissä.
 *
 * Lajit ja kaudet suomalaisten lähteiden mukaan: sinisorsanaaras kulkee
 * poikueen kanssa alkukesällä, laulujoutsenet kerääntyvät syksyllä
 * parviksi ennen muuttoa, ja kuikka pesii kirkkailla järvillä ja sukeltaa
 * ihmisen huomattuaan pitkänkin matkan.
 */
export type WaterfowlKind = 'mallard' | 'swan' | 'loon';

export interface FlockPlan {
  kind: WaterfowlKind;
  /** Aikuiset; sorsissa ensimmäinen on naaras, toinen koiras. */
  adults: number;
  /** Poikaset (sorsa kesällä). */
  young?: number;
}

interface KindParams {
  /** Uintinopeus ja pakonopeus (m/s). */
  swim: number;
  flee: number;
  /** Kuinka kauas kotipaikasta parvi kiertelee (m). */
  roam: number;
  /** Kulkupeli tätä lähempänä: parvi ui poispäin (m). */
  shy: number;
  /** Kulkupeli tätä lähempänä: sorsat ja joutsenet lentävät, kuikka sukeltaa (m). */
  flush: number;
  /** Vieheen molskahdus tätä lähempänä säikäyttää kuten liian lähelle tullut kulkupeli. */
  splash: number;
  /** Kotipaikan etäisyys rannasta (m): sorsat rantavedessä, joutsen ja kuikka selällä. */
  shore: readonly [number, number];
}

/** Parvet vuodenajoittain (kisan kausi, `seasonOf`). */
const FLOCKS: Record<Season, readonly FlockPlan[]> = {
  // Toukokuun alussa sorsat ovat pareittain, joutsenpari ja kuikat reviirillään.
  spring: [
    { kind: 'mallard', adults: 2 },
    { kind: 'mallard', adults: 2 },
    { kind: 'mallard', adults: 2 },
    { kind: 'swan', adults: 2 },
    { kind: 'loon', adults: 1 },
    { kind: 'loon', adults: 1 },
  ],
  // Heinäkuun alussa sorsanaaras kulkee poikueen kanssa kaislikon reunassa.
  summer: [
    { kind: 'mallard', adults: 1, young: 7 },
    { kind: 'mallard', adults: 1, young: 5 },
    { kind: 'mallard', adults: 3 },
    { kind: 'swan', adults: 2 },
    { kind: 'loon', adults: 1 },
    { kind: 'loon', adults: 1 },
  ],
  // Lokakuussa sorsat ovat parvessa, laulujoutsenet kerääntyvät muuttoparveksi
  // ja kuikista useimmat ovat jo lähteneet.
  autumn: [
    { kind: 'mallard', adults: 6 },
    { kind: 'mallard', adults: 4 },
    { kind: 'swan', adults: 7 },
    { kind: 'loon', adults: 1 },
  ],
  winter: [],
};

export const WATERFOWL = {
  flocks: FLOCKS,
  kinds: {
    mallard: { swim: 0.35, flee: 1.1, roam: 45, shy: 18, flush: 8, splash: 15, shore: [3, 30] },
    swan: { swim: 0.3, flee: 0.9, roam: 140, shy: 28, flush: 10, splash: 8, shore: [60, 1e9] },
    loon: { swim: 0.35, flee: 0.8, roam: 180, shy: 40, flush: 20, splash: 20, shore: [70, 1e9] },
  } satisfies Record<WaterfowlKind, KindParams>,
  /** Lento: nopeus (m/s), korkeus (m) ja uuden laskeutumispaikan etäisyys (m). */
  fly: {
    speed: { mallard: 14, swan: 11 },
    height: { mallard: 12, swan: 5 },
    distance: [150, 400] as const,
  },
  /** Kuikan sukellus: väli (s), kesto (s) ja nopeus veden alla (m/s). */
  dive: { every: [30, 90] as const, time: [20, 50] as const, speed: 1.5 },
} as const;

interface Member {
  kind: BirdPose['kind'];
  /** Paikka parvessa: x eteen, y vasemmalle (m). */
  offset: Vec2;
  /** Oma vaihe: siipien lyönti ja pieni heilunta eivät ole tahdissa. */
  phase: number;
}

interface Flock {
  plan: FlockPlan;
  rng: Rng;
  home: Vec2;
  pos: Vec2;
  heading: number;
  mode: 'swim' | 'fly' | 'dive';
  target: Vec2;
  /** Lepoaika (s) ennen seuraavaa uintia. */
  rest: number;
  /** Pakoa jäljellä (s): pakoon uidessa nopeampi. */
  fleeing: number;
  height: number;
  flight: { from: Vec2; to: Vec2; t: number; time: number } | null;
  /** Kuikka: aika seuraavaan sukellukseen ja sukellusta jäljellä (s). */
  diveIn: number;
  diveLeft: number;
  members: Member[];
}

/** Kotipaikan ja liikkeen tarvitsema järvi. */
export interface BirdLake {
  water: WaterBody;
  map: LakeMap;
}

/** Paikka, josta linnut väistävät: kulkupelit ja oma viehe. */
export interface WaterfowlInput {
  crafts: readonly Vec2[];
  /** Oman vieheen molskahdus tällä askeleella. */
  splash: Vec2 | null;
}

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);
const angleTo = (a: Vec2, b: Vec2) => Math.atan2(b.y - a.y, b.x - a.x);

export class Waterfowl {
  private readonly flocks: Flock[] = [];
  private time = 0;

  constructor(
    seed: number,
    season: Season,
    private readonly lake: BirdLake,
  ) {
    const plans = WATERFOWL.flocks[season];
    plans.forEach((plan, i) => {
      // Oma arpa parvelle: yhden parven päätökset eivät muuta muita.
      const rng = new Rng((seed ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0);
      const home = this.findHome(plan.kind, rng, null);
      if (!home) return;
      this.flocks.push({
        plan,
        rng,
        home,
        pos: { ...home },
        heading: rng.range(0, Math.PI * 2),
        mode: 'swim',
        target: { ...home },
        rest: rng.range(0, 10),
        fleeing: 0,
        height: 0,
        flight: null,
        diveIn: rng.range(WATERFOWL.dive.every[0], WATERFOWL.dive.every[1]),
        diveLeft: 0,
        members: formation(plan, rng),
      });
    });
  }

  /** Parvien määrä (testejä varten). */
  get count(): number {
    return this.flocks.length;
  }

  /** Parvien keskipisteet ja tilat (testejä varten). */
  get state(): readonly { kind: WaterfowlKind; pos: Vec2; mode: Flock['mode'] }[] {
    return this.flocks.map((f) => ({ kind: f.plan.kind, pos: f.pos, mode: f.mode }));
  }

  update(dt: number, input: WaterfowlInput, events: BirdEvent[]): void {
    this.time += dt;
    for (const f of this.flocks) {
      if (f.mode === 'fly') this.stepFlight(f, dt, events);
      else if (f.mode === 'dive') this.stepDive(f, dt, input, events);
      else this.stepSwim(f, dt, input, events);
    }
  }

  /** Näkyvät linnut: pinnalla uivat ja lentävät, ei sukeltavia. */
  poses(out: BirdPose[]): void {
    for (const f of this.flocks) {
      if (f.mode === 'dive') continue;
      const c = Math.cos(f.heading);
      const s = Math.sin(f.heading);
      // Lennossa parvi harvenee.
      const spread = f.mode === 'fly' ? 1.8 : 1;
      for (const m of f.members) {
        const wobble = f.mode === 'fly' ? 0 : 0.15 * Math.sin(this.time * 0.7 + m.phase * 6);
        const ox = m.offset.x * spread + wobble;
        const oy = m.offset.y * spread;
        out.push({
          kind: m.kind,
          pos: { x: f.pos.x + c * ox - s * oy, y: f.pos.y + s * ox + c * oy },
          height: f.height,
          heading: f.heading,
          flying: f.mode === 'fly',
          flap: (this.time * (f.plan.kind === 'swan' ? 2.2 : 4.5) + m.phase) % 1,
        });
      }
    }
  }

  /** Lähimmän pinnalla olevan kuikan paikka: kuikan huuto kuuluu sen suunnasta. */
  nearestLoon(from: Vec2): Vec2 | null {
    let best: Vec2 | null = null;
    for (const f of this.flocks)
      if (f.plan.kind === 'loon' && (!best || dist(from, f.pos) < dist(from, best))) best = f.pos;
    return best;
  }

  private stepSwim(f: Flock, dt: number, input: WaterfowlInput, events: BirdEvent[]): void {
    const k = WATERFOWL.kinds[f.plan.kind];
    let threat: Vec2 | null = null;
    let near = Infinity;
    for (const p of input.crafts) {
      const d = dist(p, f.pos);
      if (d < near) {
        near = d;
        threat = p;
      }
    }
    const splashed = input.splash !== null && dist(input.splash, f.pos) < k.splash;
    if (near < k.flush || splashed) {
      const from = splashed ? input.splash! : threat!;
      if (this.flush(f, from, events)) return;
    }
    if (threat && near < k.shy) {
      // Ui poispäin kulkupelistä ja jatkaa vielä hetken.
      const away = angleTo(threat, f.pos);
      f.target = this.waterAhead(f.pos, away, k.shy) ?? f.target;
      f.fleeing = 6;
      f.rest = 0;
    }
    if (f.plan.kind === 'loon') {
      f.diveIn -= dt;
      // Kuikka sukeltaa kalaan omia aikojaan.
      if (f.diveIn <= 0) {
        this.startDive(f, f.rng.range(0, Math.PI * 2), events);
        return;
      }
    }
    f.fleeing = Math.max(0, f.fleeing - dt);
    if (f.rest > 0) {
      f.rest -= dt;
      return;
    }
    const d = dist(f.pos, f.target);
    if (d < 2) {
      f.rest = f.rng.range(5, 25);
      f.target = this.wanderTarget(f) ?? f.target;
      return;
    }
    const speed = f.fleeing > 0 ? k.flee : k.swim;
    this.turnAndMove(f, angleTo(f.pos, f.target), speed, dt, 1.5);
  }

  /**
   * Säikähdys: sorsat ja joutsenet nousevat lentoon, kuikka sukeltaa.
   * Poikueen kanssa sorsanaaras ei lennä vaan ui poikasineen pakoon.
   */
  private flush(f: Flock, from: Vec2, events: BirdEvent[]): boolean {
    const away = angleTo(from, f.pos);
    if (f.plan.kind === 'loon') {
      this.startDive(f, away, events);
      return true;
    }
    if (f.plan.young) {
      f.target = this.waterAhead(f.pos, away, 40) ?? f.target;
      f.fleeing = 12;
      f.rest = 0;
      return false;
    }
    const to = this.findHome(f.plan.kind, f.rng, f.pos);
    if (!to) return false;
    const range = dist(f.pos, to);
    f.home = to;
    f.target = { ...to };
    f.mode = 'fly';
    f.flight = {
      from: { ...f.pos },
      to,
      t: 0,
      time: range / WATERFOWL.fly.speed[f.plan.kind as 'mallard' | 'swan'],
    };
    f.heading = angleTo(f.pos, to);
    events.push({ kind: 'flush', pos: { ...f.pos }, bird: f.plan.kind });
    return true;
  }

  private stepFlight(f: Flock, dt: number, events: BirdEvent[]): void {
    const fl = f.flight!;
    fl.t = Math.min(1, fl.t + dt / fl.time);
    const t = fl.t;
    f.pos = {
      x: fl.from.x + (fl.to.x - fl.from.x) * t,
      y: fl.from.y + (fl.to.y - fl.from.y) * t,
    };
    // Nousu alussa ja liuku alas lopussa.
    const top = WATERFOWL.fly.height[f.plan.kind as 'mallard' | 'swan'];
    f.height = top * Math.min(1, t / 0.15, (1 - t) / 0.25);
    if (t >= 1) {
      f.mode = 'swim';
      f.flight = null;
      f.height = 0;
      f.rest = f.rng.range(5, 15);
      events.push({ kind: 'land', pos: { ...f.pos }, bird: f.plan.kind });
    }
  }

  private startDive(f: Flock, heading: number, events: BirdEvent[]): void {
    f.mode = 'dive';
    f.heading = heading;
    f.diveLeft = f.rng.range(WATERFOWL.dive.time[0], WATERFOWL.dive.time[1]);
    events.push({ kind: 'dive', pos: { ...f.pos }, bird: f.plan.kind });
  }

  private stepDive(f: Flock, dt: number, input: WaterfowlInput, events: BirdEvent[]): void {
    f.diveLeft -= dt;
    // Veden alla kuikka ui suoraan; rannan tullessa vastaan se kääntyy.
    this.turnAndMove(f, f.heading, WATERFOWL.dive.speed, dt, 0);
    if (f.diveLeft > 0) return;
    // Ei nouse aivan kulkupelin viereen: jatkaa vielä sukellusta.
    const k = WATERFOWL.kinds.loon;
    if (input.crafts.some((p) => dist(p, f.pos) < k.flush) && f.diveLeft > -20) return;
    f.mode = 'swim';
    f.diveIn = f.rng.range(WATERFOWL.dive.every[0], WATERFOWL.dive.every[1]);
    f.target = this.wanderTarget(f) ?? { ...f.pos };
    f.rest = f.rng.range(3, 10);
    events.push({ kind: 'surface', pos: { ...f.pos }, bird: f.plan.kind });
  }

  /** Kääntyy kohti suuntaa `want` (rad/s `turn`, 0 = heti) ja liikkuu, jos edessä on vettä. */
  private turnAndMove(f: Flock, want: number, speed: number, dt: number, turn: number): void {
    if (turn > 0) {
      let diff = want - f.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      f.heading += Math.max(-turn * dt, Math.min(turn * dt, diff));
    }
    const next = {
      x: f.pos.x + Math.cos(f.heading) * speed * dt,
      y: f.pos.y + Math.sin(f.heading) * speed * dt,
    };
    if (this.swimmable(next, f.plan.kind)) {
      f.pos = next;
      return;
    }
    // Ranta tai kaislikko vastassa: uusi suunta ja kohde.
    f.heading = angleTo(f.pos, f.home);
    if (f.mode === 'swim') f.target = this.wanderTarget(f) ?? { ...f.home };
  }

  /** Linnulle sopiva vesi: sorsa ui kaislikossakin, joutsen ja kuikka avovedessä. */
  private swimmable(p: Vec2, kind: WaterfowlKind): boolean {
    const w = this.lake.water;
    return w.isWater(p) && !w.onPier(p) && (kind === 'mallard' || !w.reedsAt(p));
  }

  /** Vettä suunnassa `angle` enintään `range` metrin päässä. */
  private waterAhead(from: Vec2, angle: number, range: number): Vec2 | null {
    for (let r = range; r > 4; r *= 0.6) {
      const p = { x: from.x + Math.cos(angle) * r, y: from.y + Math.sin(angle) * r };
      if (this.swimmable(p, 'swan')) return p;
    }
    return null;
  }

  /** Uusi uintikohde kotipaikan lähellä. */
  private wanderTarget(f: Flock): Vec2 | null {
    const k = WATERFOWL.kinds[f.plan.kind];
    for (let i = 0; i < 12; i++) {
      const a = f.rng.range(0, Math.PI * 2);
      const r = Math.sqrt(f.rng.next()) * k.roam;
      const p = { x: f.home.x + Math.cos(a) * r, y: f.home.y + Math.sin(a) * r };
      if (this.suits(p, f.plan.kind)) return p;
    }
    return null;
  }

  /** Sopiiko paikka lajin kotipaikaksi: vettä ja oikealla etäisyydellä rannasta. */
  private suits(p: Vec2, kind: WaterfowlKind): boolean {
    if (!this.swimmable(p, kind) || this.lake.water.reedsAt(p)) return false;
    const [min, max] = WATERFOWL.kinds[kind].shore;
    const w = this.lake.water;
    if (w.closestShorePoint(p, min) !== null) return false;
    return max >= 1e9 || w.closestShorePoint(p, max) !== null;
  }

  /**
   * Kotipaikka: sorsalle kaislikon reunasta, muille selältä. `from` annettuna
   * lentomatkan päästä (`fly.distance`).
   */
  private findHome(kind: WaterfowlKind, rng: Rng, from: Vec2 | null): Vec2 | null {
    const { bounds, reeds = [] } = this.lake.map;
    const [near, far] = WATERFOWL.fly.distance;
    for (let i = 0; i < 80; i++) {
      let p: Vec2;
      if (kind === 'mallard' && reeds.length > 0 && i < 60) {
        // Kaislikon reunalta hieman vedelle päin.
        const ring = reeds[Math.floor(rng.next() * reeds.length)]!.ring;
        const v = ring[Math.floor(rng.next() * ring.length)]!;
        const cx = ring.reduce((s, q) => s + q.x, 0) / ring.length;
        const cy = ring.reduce((s, q) => s + q.y, 0) / ring.length;
        const a = Math.atan2(v.y - cy, v.x - cx);
        const out = rng.range(4, 12);
        p = { x: v.x + Math.cos(a) * out, y: v.y + Math.sin(a) * out };
      } else if (from) {
        const a = rng.range(0, Math.PI * 2);
        const r = rng.range(near, far);
        p = { x: from.x + Math.cos(a) * r, y: from.y + Math.sin(a) * r };
      } else {
        p = { x: rng.range(bounds.minX, bounds.maxX), y: rng.range(bounds.minY, bounds.maxY) };
      }
      if (from) {
        const d = dist(from, p);
        if (d < near || d > far) continue;
      }
      if (this.suits(p, kind)) return p;
    }
    return null;
  }
}

/** Parven muoto: poikaset jonossa naaraan perässä, pari vierekkäin, parvi väljästi. */
function formation(plan: FlockPlan, rng: Rng): Member[] {
  const out: Member[] = [];
  const adult = (i: number): BirdPose['kind'] =>
    plan.kind === 'mallard' ? (i % 2 === 0 ? 'hen' : 'drake') : plan.kind;
  for (let i = 0; i < plan.adults; i++) {
    const spacing = plan.kind === 'swan' ? 2.4 : 1.1;
    const offset =
      i === 0
        ? { x: 0, y: 0 }
        : plan.adults === 2
          ? { x: -0.4 * spacing, y: spacing }
          : { x: rng.range(-2, 0.5) * spacing, y: rng.range(-1.5, 1.5) * spacing };
    out.push({ kind: adult(i), offset, phase: rng.next() });
  }
  for (let i = 0; i < (plan.young ?? 0); i++)
    out.push({
      kind: 'duckling',
      offset: { x: -0.9 - i * 0.45 + rng.range(-0.15, 0.15), y: rng.range(-0.5, 0.5) },
      phase: rng.next(),
    });
  return out;
}
