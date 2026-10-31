import type { Vec2 } from '../vec2';
import type { AnchorState } from './anchor';
import type { ShoreState } from './shore';
import type { Bailer, BoatLaunch } from './launch';

/**
 * Kelluntarenkaan 2D-fysiikka vedenpinnalla. Jaettu asiakkaan ja palvelimen
 * kesken, joten kaiken pitää olla deterministista: sama tila + syöte + dt
 * → sama tulos.
 *
 * Kelluntarenkaalla potkitaan räpylöillä, jolloin kalastaja liikkuu selkä
 * edellä. `heading` on suunta, johon kalastaja katsoo (ja heittää).
 */
export interface TubeState {
  pos: Vec2;
  vel: Vec2;
  /** Katsesuunta radiaaneina, 0 = itään, π/2 = pohjoiseen. */
  heading: number;
  /** Kääntymisnopeus rad/s. */
  angVel: number;
  /** Potkurytmin vaihe 0–1. */
  kickPhase: number;
  /** Kalastajan kunto 0–1: potkiminen kuluttaa, lepo palauttaa (STAMINA). */
  stamina: number;
  /** Ankkuri vedessä (#355); puuttuu = ylhäällä. */
  anchor?: AnchorState;
  /** Selkä edellä rantaa vasten potkittu aika (s, #457); puuttuu = ei rannassa. */
  landing?: number;
  /** Kalastaja maalla (#457): `pos` on silloin kalastajan paikka. Puuttuu = vedessä. */
  shore?: ShoreState;
  /** Täyttökisan vene rannalla (#458), soutajan renkaassa: vesi, vaihe ja siemen. */
  launch?: BoatLaunch;
  /** Venekunnan jäsen äyskäröi rannalla olevaa venettä (#458). */
  bailer?: Bailer;
}

export interface TubeInput {
  /** 1 = potki taaksepäin (normaali liike), -1 = melo eteenpäin, 0 = lepää. */
  kick: number;
  /** 1 = käänny vastapäivään (vasemmalle), -1 = myötäpäivään. */
  turn: number;
  /** Nopeat potkut: enemmän työntöä. */
  sprint: boolean;
  /** Ankkuri alas tai ylös (#355): painallus, ei pidettävä. */
  anchor?: boolean;
  /** Pääkonteksti maalla (#457): renkaan otto, lasku tai kyytiin hyppy. Painallus. */
  main?: boolean;
}

export const TUBE_RADIUS = 0.8;

export const TUBE_PHYSICS = {
  /** Keskimääräinen työntökiihtyvyys taaksepäin potkiessa (m/s²). */
  kickAccel: 1.3,
  /** Pikapotkujen kerroin. */
  sprintFactor: 1.8,
  /** Eteenpäin meloessa työntö on heikompi. */
  forwardFactor: 0.45,
  /** Potkurytmi (potkua sekunnissa) normaalisti ja pikapotkuin. */
  kickRate: 1.1,
  sprintKickRate: 1.8,
  /** Kuinka paljon työntö sykkii potkujen tahdissa (0 = tasainen). */
  kickPulse: 0.7,
  /** Lineaarinen ja neliöllinen vedenvastus. */
  linearDrag: 0.35,
  quadraticDrag: 0.2,
  /** Kääntymisen kiihtyvyys ja vastus. */
  turnAccel: 5,
  turnDrag: 4.5,
  /**
   * Tuulen työntö kalastajaan ja renkaaseen, a = k·|w|·w (w = tuuli, m/s).
   * 10 m/s tuulessa rengas ajelehtii n. 0,3 m/s, myrskyssä 0,6 m/s.
   */
  windPush: 0.00123,
  /** Paljonko nopeudesta jää rantaan osuessa kimmotessa. */
  shoreBounce: 0.2,
} as const;

/** Aluksen liikkeen vakiot: kelluntarengas (TUBE_PHYSICS) tai vene (BOAT_PHYSICS). */
export type CraftPhysics = { readonly [K in keyof typeof TUBE_PHYSICS]: number };

/**
 * Kalastajan kunto. Tavallinen potkiminen kuluttaa hitaasti ja pikapotkut
 * nopeasti; levossa (ei potkuja) kunto palautuu. Väsyneenä potkut heikkenevät,
 * ja tyhjällä kunnolla pikapotkut eivät onnistu.
 */
export const STAMINA = {
  /** Kulutus sekunnissa: tavallisilla potkuilla täysi kunto riittää n. 4 min, pikapotkuilla n. 20 s. */
  kickDrain: 1 / 240,
  sprintDrain: 1 / 20,
  /** Palautuminen sekunnissa levossa: tyhjästä täyteen n. 15 s. */
  restRegen: 1 / 15,
  /** Tätä väsyneempänä potkujen teho laskee… */
  tired: 0.25,
  /** …tähän osuuteen, kun kunto on lopussa. */
  minThrust: 0.4,
} as const;

/** Potkujen tehon kerroin kunnon mukaan. */
export function staminaThrust(stamina: number): number {
  if (stamina >= STAMINA.tired) return 1;
  return STAMINA.minThrust + ((1 - STAMINA.minThrust) * Math.max(0, stamina)) / STAMINA.tired;
}

export const createTube = (pos: Vec2, heading = Math.PI / 2): TubeState => ({
  pos: { ...pos },
  vel: { x: 0, y: 0 },
  heading,
  angVel: 0,
  kickPhase: 0,
  stamina: 1,
});

const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));

/**
 * Etenee yhden kiinteän askeleen. Ei käsittele rantaa (ks. collideTubeWithShore).
 * `wind` = tuulen nopeusvektori (m/s); tuuli ajattaa rengasta. `dragFactor`
 * kertoo vedenvastuksen, esim. kaislikossa (REEDS.drag). `P` = aluksen
 * vakiot: veneellä (BOAT_PHYSICS) potku on airoveto.
 */
export function stepTube(
  s: TubeState,
  input: TubeInput,
  dt: number,
  wind?: Vec2,
  dragFactor = 1,
  P: CraftPhysics = TUBE_PHYSICS,
): TubeState {
  // Ankkurissa ei potkita eikä soudeta (köysi pitää), kääntyä voi.
  const kick = s.anchor ? 0 : clamp1(input.kick);
  const turn = clamp1(input.turn);

  // Uupunut ei jaksa pikapotkuja.
  const sprint = input.sprint && kick !== 0 && s.stamina > 0;
  const stamina =
    kick === 0
      ? Math.min(1, s.stamina + STAMINA.restRegen * dt)
      : Math.max(0, s.stamina - (sprint ? STAMINA.sprintDrain : STAMINA.kickDrain) * dt);

  // Potkurytmi: työntö sykkii, mutta keskiarvo pysyy samana.
  const rate = sprint ? P.sprintKickRate : P.kickRate;
  const kickPhase = kick !== 0 ? (s.kickPhase + rate * dt) % 1 : 0;
  const pulse = 1 + P.kickPulse * Math.sin(kickPhase * Math.PI * 2);
  let thrust =
    kick * P.kickAccel * pulse * (sprint ? P.sprintFactor : 1) * staminaThrust(s.stamina);
  if (kick < 0) thrust *= P.forwardFactor;

  // Selkä menosuuntaan: positiivinen potku vie vastakkaiseen suuntaan kuin katse.
  const dirX = -Math.cos(s.heading);
  const dirY = -Math.sin(s.heading);

  const speed = Math.hypot(s.vel.x, s.vel.y);
  const drag = (P.linearDrag + P.quadraticDrag * speed) * dragFactor;
  const windK = wind ? P.windPush * Math.hypot(wind.x, wind.y) : 0;
  const ax = dirX * thrust - s.vel.x * drag + (wind ? wind.x * windK : 0);
  const ay = dirY * thrust - s.vel.y * drag + (wind ? wind.y * windK : 0);

  // Semi-implisiittinen Euler: nopeus ensin, sitten sijainti.
  const vel = { x: s.vel.x + ax * dt, y: s.vel.y + ay * dt };
  const pos = { x: s.pos.x + vel.x * dt, y: s.pos.y + vel.y * dt };

  const angAcc = turn * P.turnAccel - s.angVel * P.turnDrag;
  const angVel = s.angVel + angAcc * dt;
  const heading = wrapAngle(s.heading + angVel * dt);

  return { pos, vel, heading, angVel, kickPhase, stamina, ...(s.anchor && { anchor: s.anchor }) };
}

/**
 * Rantakorjaus: siirtää renkaan veteen ja poistaa rantaan päin olevan nopeuden.
 * `radius` ja `bounce` aluksen mukaan (vene: BOAT_RADIUS).
 */
export function collideTubeWithShore(
  prev: TubeState,
  next: TubeState,
  water: {
    moveCircle(from: Vec2, to: Vec2, radius: number): { position: Vec2; normal: Vec2 } | null;
  },
  radius = TUBE_RADIUS,
  bounce: number = TUBE_PHYSICS.shoreBounce,
): TubeState {
  const hit = water.moveCircle(prev.pos, next.pos, radius);
  if (!hit) return next;
  const vn = next.vel.x * hit.normal.x + next.vel.y * hit.normal.y;
  const vel =
    vn < 0
      ? {
          x: next.vel.x - (1 + bounce) * vn * hit.normal.x,
          y: next.vel.y - (1 + bounce) * vn * hit.normal.y,
        }
      : next.vel;
  return { ...next, pos: hit.position, vel };
}

export function wrapAngle(a: number): number {
  const twoPi = Math.PI * 2;
  a %= twoPi;
  if (a > Math.PI) a -= twoPi;
  if (a <= -Math.PI) a += twoPi;
  return a;
}

/** Kulmien interpolointi lyhintä reittiä. */
export function lerpAngle(a: number, b: number, t: number): number {
  return a + wrapAngle(b - a) * t;
}
