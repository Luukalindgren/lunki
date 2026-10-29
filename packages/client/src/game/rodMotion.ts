import * as THREE from 'three';
import {
  FLY_RODS,
  RODS,
  chargePower,
  isFly,
  type FishingEvents,
  type FishingState,
  type Tackle,
  type Vec2,
} from '@lunki/shared';
import { toWorld } from '../world/lakeMesh';

/**
 * Vavan liike: koko vavan nosto ja aihion taipuma. Nykäisy, vastaisku ja
 * heitto nostavat tai heilauttavat vapaa, väsytyksessä vapaa pidetään
 * pystympänä, ja siiman jännitys taivuttaa aihiota vedon suuntaan.
 * Sama asento piirretään kalastajan silmin (`PovRod`) ja hahmon vapaan
 * (`aimRod`), myös muille pelaajille.
 */
export interface RodPose {
  /** Nosto lepoasennosta (rad, + = ylös). */
  lift: number;
  /** Kuorman taipuma tyvestä kärkeen vedon suuntaan (rad). */
  bend: number;
  /** Hitauden taipuma pystytasossa (rad, + = kärki ylös): kärki laahaa liikkeen perässä. */
  flex: number;
  /** Mihin siima vetää: kohta järvellä ja syvyys pinnasta (m), null = ei vetoa. */
  pull: { x: number; y: number; depth: number } | null;
}

export const REST_POSE: RodPose = { lift: 0, bend: 0, flex: 0, pull: null };

export const ROD_MOTION = {
  /** Nostojousi: ω² ja vaimennus (ω ≈ 17 rad/s, lähes kriittinen). */
  stiffness: 300,
  damping: 26,
  /** Nykäisy (#363): nopea nosto ja lasku. */
  twitch: { lift: 0.45, time: 0.12 },
  /** Vastaisku kalan tarttuessa. */
  hookSet: { lift: 0.8, time: 0.2 },
  /** Perhon vastaisku vavan nostolla. */
  flyLift: { lift: 0.5, time: 0.15 },
  /** Heitto: latauksessa vapa taakse voiman mukaan, irrotuksessa eteen. */
  castBack: 0.9,
  castThrow: { lift: -0.4, time: 0.14 },
  /** Väsytyksessä vapa pystympänä. */
  fight: 0.35,
  /** Nostossa (#366) vapa ylhäällä: kala johdetaan käteen tai haaviin. */
  landing: 0.6,
  /** Pohjaan tai maalle juuttunutta viehettä vedetään vapa koholla. */
  pullStuck: 0.2,
  /** Kalan nosto kyytiin: heilautus ja nosto käsin vavan avulla. */
  landed: { swing: 1.1, hand: 0.6, net: 0.4 },
  /** Hitauden taipuma nostonopeudesta (rad / rad/s) ja sen raja. */
  flexPerSpeed: 0.06,
  maxFlex: 0.5,
  /** Suurin taipuma (rad): perhovapa on pehmeämpi. */
  maxBend: { spin: 1.5, fly: 1.8 },
  /** Jännitys (kg), jolla taipuma on noin 63 % suurimmasta: kevyt vapa taipuu herkemmin. */
  load: { light: 0.9, medium: 1.3, heavy: 2, fly6: 0.6, fly8: 0.9, fly10: 1.3 },
  /** Taipuman tasoitus (1/s): seuraa jännitystä nopeasti mutta ei hypi. */
  bendRate: 14,
  /** Luistava jarru väristää vapaa. */
  slipShake: 0.05,
  /** Tärpin nykäykset kärjessä (rad) ja niiden tahti (rad/s, |sin|). */
  strikeNod: 0.5,
  strikeRate: 10,
} as const;

/**
 * Tärpin nykäykset (s iskusta) siiman kireytenä 0–1: siima kiristyy hetkeksi
 * suoraksi ja löystyy taas, noin kolme kertaa sekunnissa.
 */
export function strikeTaut(age: number): number {
  return 0.15 + 0.85 * Math.abs(Math.sin(age * ROD_MOTION.strikeRate));
}

/** Siiman jännitystä (kg) vastaava taipuma (rad) näillä varusteilla. */
export function loadBend(tension: number, tackle: Tackle): number {
  const fly = isFly(tackle);
  const load = fly
    ? ROD_MOTION.load[FLY_RODS[tackle.flyRod].id]
    : ROD_MOTION.load[RODS[tackle.rod].id];
  const max = fly ? ROD_MOTION.maxBend.fly : ROD_MOTION.maxBend.spin;
  return max * (1 - Math.exp(-Math.max(0, tension) / load));
}

/**
 * Vavan nosto jousena: tavoite on asento (lepo, väsytys, heiton lataus) ja
 * sen päällä lyhyet sykäykset (nykäisy, vastaisku). Jousi antaa liikkeelle
 * nopean nousun ja pienen ylityksen; nopeudesta tulee kärjen laahaus.
 */
export class RodMotion {
  private lift = 0;
  private speed = 0;
  private bend = 0;
  private pulses: { lift: number; left: number }[] = [];
  private time = 0;

  /** Sykäys: nosto `lift` (rad) `time` sekunnin ajan. */
  pulse(lift: number, time: number): void {
    this.pulses.push({ lift, left: time });
  }

  /** Askel: `base` = tavoiteasento (rad), `bend` = kuorman taipuma (rad). */
  step(base: number, bend: number, dt: number, shake = 0): Omit<RodPose, 'pull'> {
    dt = Math.min(0.1, Math.max(0, dt));
    this.time += dt;
    let target = base;
    for (const p of this.pulses) target += p.lift;
    // Jousi pienin askelin, jotta se pysyy vakaana hitaallakin ruudunpäivityksellä.
    const n = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      const acc = ROD_MOTION.stiffness * (target - this.lift) - ROD_MOTION.damping * this.speed;
      this.speed += acc * h;
      this.lift += this.speed * h;
    }
    for (const p of this.pulses) p.left -= dt;
    this.pulses = this.pulses.filter((p) => p.left > 0);
    this.bend += (bend - this.bend) * Math.min(1, dt * ROD_MOTION.bendRate);
    const flex = Math.max(
      -ROD_MOTION.maxFlex,
      Math.min(ROD_MOTION.maxFlex, -this.speed * ROD_MOTION.flexPerSpeed),
    );
    return {
      lift: this.lift,
      bend: Math.max(0, this.bend + Math.sin(this.time * 55) * shake),
      flex,
    };
  }

  /** Vapa lepoon heti (esim. uusi kisa). */
  reset(): void {
    this.lift = this.speed = this.bend = 0;
    this.pulses = [];
  }
}

/**
 * Oman vavan liike kalastuksen tilasta. `onEvents` kirjaa fysiikan askelen
 * tapahtumat sykäyksiksi, `pose` laskee asennon piirtoa varten.
 */
export class OwnRodMotion {
  private readonly motion = new RodMotion();

  onEvents(events: FishingEvents, s: FishingState, rodLift = false): void {
    const m = ROD_MOTION;
    if (events.twitch) this.motion.pulse(m.twitch.lift, m.twitch.time);
    if (events.hooked) this.motion.pulse(m.hookSet.lift, m.hookSet.time);
    else if (rodLift && s.stage === 'water') this.motion.pulse(m.flyLift.lift, m.flyLift.time);
    if (events.cast !== undefined && !isFly(s.tackle))
      this.motion.pulse(m.castThrow.lift, m.castThrow.time);
    if (events.landed) this.motion.pulse(m.landed[events.landed.by], 0.35);
  }

  pose(s: FishingState, dt: number): RodPose {
    const m = ROD_MOTION;
    let base = 0;
    if (s.stage === 'charging') base = m.castBack * chargePower(s.charge);
    else if (s.stage === 'water') {
      if (s.landing) base = m.landing;
      else if (s.hookedId !== null) base = m.fight;
      else if ((s.snag !== null || s.onLand) && s.tension > 0) base = m.pullStuck;
    }
    const water = s.stage === 'water';
    // Tärpissä kala nykii viehettä: kärki nyökkää siiman nykäysten tahdissa.
    const strike = water && s.struckId !== null && s.hookedId === null;
    const nod = strike ? ROD_MOTION.strikeNod * strikeTaut(s.strikeAge) : 0;
    const bend = water ? loadBend(s.tension, s.tackle) + nod : 0;
    const shake = water && s.dragSlipping ? m.slipShake : 0;
    return {
      ...this.motion.step(base, bend, dt, shake),
      pull: water ? { x: s.lure.x, y: s.lure.y, depth: s.depth } : null,
    };
  }

  reset(): void {
    this.motion.reset();
  }
}

const UP = new THREE.Vector3(0, 1, 0);
/** Taipumaa laskettaessa aihio jaetaan näin moneen osaan. */
const STEPS = 24;
/** Kärkipainotteinen vapa: taipuma keskittyy kärkeen (taipuman kasvun eksponentti). */
const ACTION = 1.6;

/**
 * Vavan suunta, kun lepoasennon suuntaa `rest` nostetaan `lift` (rad) ja
 * käännetään `yaw` (rad, vastapäivään ylhäältä) maailman pystyakselin ympäri.
 */
export function liftRod(rest: THREE.Vector3, lift: number, yaw: number, out: THREE.Vector3) {
  const flat = Math.hypot(rest.x, rest.z);
  const angle = Math.max(-1.2, Math.min(1.5, Math.atan2(rest.y, flat) + lift));
  const heading = Math.atan2(-rest.z, rest.x) + yaw;
  return out.set(
    Math.cos(angle) * Math.cos(heading),
    Math.sin(angle),
    -Math.cos(angle) * Math.sin(heading),
  );
}

/** Vedon suunta maailmassa vavan kärjestä siiman ja kohteen `pull` suuntaan. */
export function pullDirection(
  tip: THREE.Vector3,
  pull: RodPose['pull'],
  out: THREE.Vector3,
): THREE.Vector3 | null {
  if (!pull) return null;
  const at = toWorld(pull, 0);
  // Siima laskee kärjestä veteen ja kalan syvyyteen.
  out.set(at.x - tip.x, -tip.y - Math.max(0, pull.depth), at.z - tip.z);
  return out.lengthSq() > 1e-6 ? out.normalize() : null;
}

/**
 * Taipuneen vavan keskiviiva. `butt` = aihion alku (etukahva), `dir` = sen
 * suunta, `length` = aihion pituus. Kuorma `bend` kääntää aihion kärkeä
 * vedon suuntaan `pull`, ja `flex` pystytasossa; kärki taipuu eniten.
 * Aihion pituus säilyy, joten taipunut kärki tulee lähemmäs. Kirjoittaa
 * pisteet `out` tasavälein (vähintään kaksi) ja palauttaa kärjen suunnan.
 */
export function bendRod(
  butt: THREE.Vector3,
  dir: THREE.Vector3,
  length: number,
  pull: THREE.Vector3 | null,
  bend: number,
  flex: number,
  out: THREE.Vector3[],
): THREE.Vector3 {
  // Taivutuksen akseli: vedon ja pystysuunnan kohtisuorat osat vavasta.
  const side = new THREE.Vector3();
  if (pull) {
    const n = pull.clone().addScaledVector(dir, -pull.dot(dir));
    if (n.lengthSq() > 1e-6) side.addScaledVector(n.normalize(), bend);
  }
  const up = UP.clone().addScaledVector(dir, -dir.y);
  if (up.lengthSq() > 1e-6) side.addScaledVector(up.normalize(), flex);
  const total = side.length();
  const n = total > 1e-6 ? side.divideScalar(total) : side;

  const t = new THREE.Vector3();
  const p = butt.clone();
  const tangent = (u: number) => {
    const a = total * u ** ACTION;
    return t.copy(dir).multiplyScalar(Math.cos(a)).addScaledVector(n, Math.sin(a));
  };
  const last = out.length - 1;
  out[0]!.copy(p);
  const h = 1 / STEPS;
  let next = 1;
  for (let i = 0; i < STEPS; i++) {
    // Keskipistesääntö: tangentti askeleen puolivälissä.
    p.addScaledVector(tangent((i + 0.5) * h), length * h);
    const u = (i + 1) * h;
    while (next <= last && next / last <= u + 1e-9) {
      // Väliin osuvat pisteet tangentin suuntaan askeleen alusta.
      const back = (u - next / last) * length;
      out[next]!.copy(p).addScaledVector(t, -back);
      next++;
    }
  }
  return tangent(1).clone();
}

/** Järven piste ja korkeus (siiman piirtoa varten) maailman pisteestä. */
export const lakePoint = (p: THREE.Vector3): { x: number; y: number; h: number } => ({
  x: p.x,
  y: -p.z,
  h: p.y,
});

/** Kulma (rad) suunnasta `heading` kohteeseen `to` pisteestä `from`, välillä −π…π. */
export function bearing(from: Vec2, to: Vec2, heading: number): number {
  const a = Math.atan2(to.y - from.y, to.x - from.x) - heading;
  return Math.atan2(Math.sin(a), Math.cos(a));
}
