import { wrapAngle } from '../physics/tube';
import type { Vec2 } from '../vec2';

/** Heiton ja vieheen lennon vakiot. */
export const CAST = {
  /** Vieheen lähtönopeus täydellä voimalla (m/s). */
  maxSpeed: 30,
  /** Pienin voima, jolla heitto lähtee. */
  minPower: 0.08,
  /** Heittokulma vaakatasosta. */
  launchAngle: (32 * Math.PI) / 180,
  /** Vavan kärjen korkeus vedenpinnasta istuttaessa renkaassa. */
  tipHeight: 2.4,
  /** Vavan kärki on näin kaukana kalastajasta katsesuuntaan. */
  rodReach: 1.6,
  /** Ilmanvastus (ilman ja siiman yhteisvaikutus), a = -k·|v|·v. */
  airDrag: 0.012,
  gravity: 9.81,
  /** Kuinka laajalle katsesuunnasta voi heittää (rad, kumpaankin suuntaan). */
  maxSideAngle: (110 * Math.PI) / 180,
  /**
   * Tuulen vaikutus lentoon: ilmanvastus lasketaan suhteessa ilmaan, joka
   * liikkuu tällä osuudella tuulen nopeudesta (viehe on painava, siima kevyt).
   */
  windEffect: 0.6,
  /** Voimamittarin täyttymisaika (s); täyden jälkeen mittari laskee takaisin. */
  chargeTime: 1.1,
} as const;

/** Lennossa oleva viehe: sijainti vaakatasossa ja korkeus vedenpinnasta. */
export interface LureFlight {
  pos: Vec2;
  height: number;
  vel: Vec2;
  vz: number;
  /** Lennetty matka (= ulos lähtenyt siima). */
  travelled: number;
}

/** Vavan kärjen sijainti. */
export function rodTip(tubePos: Vec2, heading: number): Vec2 {
  return {
    x: tubePos.x + Math.cos(heading) * CAST.rodReach,
    y: tubePos.y + Math.sin(heading) * CAST.rodReach,
  };
}

/** Rajaa heittosuunnan kalastajan ulottuville (ei suoraan selän taakse). */
export function clampCastAngle(aimAngle: number, heading: number): number {
  const rel = wrapAngle(aimAngle - heading);
  return heading + Math.max(-CAST.maxSideAngle, Math.min(CAST.maxSideAngle, rel));
}

/**
 * Voimamittari: nousee 0 → 1 `chargeTime` sekunnissa ja laskee sitten
 * takaisin, joten heiton ajoitus ratkaisee pituuden.
 */
export function chargePower(heldSeconds: number): number {
  const t = (heldSeconds / CAST.chargeTime) % 2;
  return t <= 1 ? t : 2 - t;
}

/** `factor` = varusteiden heittokerroin (vieheen paino, siiman paksuus). */
export function launchLure(from: Vec2, angle: number, power: number, factor = 1): LureFlight {
  const speed = Math.max(CAST.minPower, Math.min(1, power)) * CAST.maxSpeed * factor;
  const h = Math.cos(CAST.launchAngle) * speed;
  return {
    pos: { ...from },
    height: CAST.tipHeight,
    vel: { x: Math.cos(angle) * h, y: Math.sin(angle) * h },
    vz: Math.sin(CAST.launchAngle) * speed,
    travelled: 0,
  };
}

/**
 * Etenee lennossa yhden askeleen. Palauttaa true, kun viehe osuu veteen.
 * Sivutuuli kaartaa heittoa, myötätuuli pidentää ja vastatuuli lyhentää sitä.
 */
export function stepFlight(f: LureFlight, dt: number, wind?: Vec2): boolean {
  const wx = wind ? wind.x * CAST.windEffect : 0;
  const wy = wind ? wind.y * CAST.windEffect : 0;
  const rx = f.vel.x - wx;
  const ry = f.vel.y - wy;
  const speed = Math.hypot(rx, ry, f.vz);
  const k = CAST.airDrag * speed;
  f.vel.x -= rx * k * dt;
  f.vel.y -= ry * k * dt;
  f.vz -= (f.vz * k + CAST.gravity) * dt;
  const dx = f.vel.x * dt;
  const dy = f.vel.y * dt;
  const dz = f.vz * dt;
  let landed = false;
  if (f.height + dz <= 0) {
    // Osuma: leikataan askel täsmälleen pintaan.
    const t = f.height / -dz;
    f.pos.x += dx * t;
    f.pos.y += dy * t;
    f.travelled += Math.hypot(dx, dy) * t;
    f.height = 0;
    landed = true;
  } else {
    f.pos.x += dx;
    f.pos.y += dy;
    f.travelled += Math.hypot(dx, dy);
    f.height += dz;
  }
  return landed;
}

/** Ennustaa osumakohdan (heittoviivaa varten). */
export function predictLanding(
  from: Vec2,
  angle: number,
  power: number,
  factor = 1,
  dt = 1 / 60,
  wind?: Vec2,
): Vec2 {
  const f = launchLure(from, angle, power, factor);
  for (let i = 0; i < 60 * 10 && !stepFlight(f, dt, wind); i++);
  return f.pos;
}
