import type { Vec2 } from '../vec2';
import { wrapAngle, type TubeState } from './tube';

/**
 * Ankkuri (#355). Kelluntarenkaalla ja veneen soutajalla on ankkuri, jonka
 * {anchor} laskee ja nostaa. Laskiessa ankkuri vajoaa aluksen alla, ja
 * pohjaan päästyään se pysyy paikallaan: alus pääsee liikkumaan vain köyden
 * mitan sisällä (köyttä 1,5 × syvyys), ja vene kääntyy keula ankkuria kohti
 * eli tuulta vasten. Nostaessa köysi lyhenee ja alus vetäytyy ankkurin luo.
 * Myrskyssä ankkuri laahaa pohjaa pitkin. Ankkurissa ei voi potkia eikä
 * soutaa, kääntyä voi.
 */
export interface AnchorState {
  /** Ankkurin paikka (m): laskiessa aluksen alla, pohjassa paikallaan. */
  pos: Vec2;
  /** Pohjan syvyys laskupaikassa (m). */
  depth: number;
  /** Ankkurin syvyys nyt (m): 0 = pinnassa, `depth` = pohjassa. */
  drop: number;
  /** Ankkuria nostetaan. */
  raising: boolean;
}

export const ANCHOR = {
  /** Vajoamisnopeus laskiessa (m/s). */
  sinkSpeed: 1.5,
  /** Köyden nosto (m/s): nosto kestää laskua kauemmin. */
  raiseSpeed: 0.6,
  /** Köyden pituus syvyyteen nähden. */
  scope: 1.5,
  /** Lyhin liikkumavara matalassa (m). */
  minReach: 2,
  /** Ohuin vesi, johon ankkuri lasketaan (m). */
  minDepth: 0.3,
  /** Kiristyneen köyden käännös keula ankkuria kohti (1/s²). */
  vane: 1.2,
  /** Tätä kovemmassa tuulessa (m/s, myrsky) ankkuri laahaa… */
  dragWind: 10.5,
  /** …näin nopeasti tuulen ylitystä kohden ((m/s)/(m/s)). */
  dragRate: 0.06,
} as const;

/** Ankkurin vaihe verkossa (PlayerState.anchor). */
export const AnchorPhase = { up: 0, lowered: 1, raising: 2 } as const;

/** Ankkurin tila verkon kentistä; vaihe `up` = ei ankkuria. */
export function anchorFromNet(p: {
  anchor?: number;
  anchorX?: number;
  anchorY?: number;
  anchorDepth?: number;
  anchorDrop?: number;
}): AnchorState | undefined {
  if (!p.anchor) return undefined;
  return {
    pos: { x: p.anchorX ?? 0, y: p.anchorY ?? 0 },
    depth: p.anchorDepth ?? 0,
    drop: p.anchorDrop ?? 0,
    raising: p.anchor === AnchorPhase.raising,
  };
}

/** Mistä kohtaa alusta köysi lähtee: `at` metriä katsesuuntaan (veneellä keula on miinuksella). */
export function anchorAttach(t: { pos: Vec2; heading: number }, at: number): Vec2 {
  return { x: t.pos.x + Math.cos(t.heading) * at, y: t.pos.y + Math.sin(t.heading) * at };
}

/** Liikkumavara pohjassa olevan ankkurin ympärillä vaakatasossa (m). */
export function anchorReach(a: AnchorState): number {
  const reach = a.depth * Math.sqrt(ANCHOR.scope * ANCHOR.scope - 1);
  return Math.max(ANCHOR.minReach, reach);
}

/** Köysi pitää: ankkuri on pohjassa tai sitä nostetaan (köysi lyhenee). */
export const anchorHolds = (a: AnchorState): boolean => a.raising || a.drop >= a.depth;

/** Ankkuri vedessä: ei potkuja eikä airovetoja. */
export const anchored = (t: TubeState): boolean => !!t.anchor;

/**
 * Ankkurin askel fysiikan jälkeen. `toggle` = pelaaja painoi {anchor}:
 * ylhäällä oleva lasketaan, vedessä oleva nostetaan (nostossa taas lasketaan).
 * `at` = köyden kiinnityskohta (anchorAttach), `depthAt` = pohjan syvyys.
 */
export function stepAnchor(
  next: TubeState,
  toggle: boolean,
  dt: number,
  at: number,
  depthAt: (p: Vec2) => number,
  wind?: Vec2,
): TubeState {
  let a = next.anchor;
  const attach = anchorAttach(next, at);
  if (toggle)
    a = a
      ? { ...a, raising: !a.raising }
      : {
          pos: attach,
          depth: Math.max(ANCHOR.minDepth, depthAt(attach)),
          drop: 0,
          raising: false,
        };
  if (!a) return next;
  if (a.raising) {
    const drop = a.drop - ANCHOR.raiseSpeed * dt;
    if (drop <= 0) return withoutAnchor(next);
    a = { ...a, drop };
  } else if (a.drop < a.depth) {
    // Vajoava ankkuri roikkuu aluksen alla.
    a = { ...a, pos: attach, drop: Math.min(a.depth, a.drop + ANCHOR.sinkSpeed * dt) };
  }
  if (!anchorHolds(a)) return { ...next, anchor: a };

  const reach = anchorReach(a) * (a.raising ? Math.min(1, a.drop / a.depth) : 1);
  let dx = attach.x - a.pos.x;
  let dy = attach.y - a.pos.y;
  let dist = Math.hypot(dx, dy);
  const nx = dist > 1e-9 ? dx / dist : 0;
  const ny = dist > 1e-9 ? dy / dist : 0;
  // Myrskyssä kireä köysi vetää ankkuria pohjaa pitkin.
  const windSpeed = wind ? Math.hypot(wind.x, wind.y) : 0;
  if (!a.raising && windSpeed > ANCHOR.dragWind && dist >= reach * 0.98) {
    const slide = ANCHOR.dragRate * (windSpeed - ANCHOR.dragWind) * dt;
    a = { ...a, pos: { x: a.pos.x + nx * slide, y: a.pos.y + ny * slide } };
    dx = attach.x - a.pos.x;
    dy = attach.y - a.pos.y;
    dist = Math.hypot(dx, dy);
  }
  let { pos, vel, angVel } = next;
  if (dist > reach) {
    // Köysi ei veny: alus takaisin köyden mittaan, ulospäin vievä vauhti pois.
    const excess = dist - reach;
    pos = { x: pos.x - nx * excess, y: pos.y - ny * excess };
    const out = vel.x * nx + vel.y * ny;
    if (out > 0) vel = { x: vel.x - nx * out, y: vel.y - ny * out };
  }
  // Keulasta kiinni oleva vene kääntyy kireällä köydellä keula ankkuria kohti.
  if (at !== 0 && dist > reach * 0.8) {
    const toAnchor = Math.atan2(a.pos.y - pos.y, a.pos.x - pos.x);
    const want = wrapAngle(toAnchor - Math.atan2(-Math.sin(next.heading), -Math.cos(next.heading)));
    angVel += ANCHOR.vane * want * dt;
  }
  return { ...next, pos, vel, angVel, anchor: a };
}

/** Alus ilman ankkuria (nostettu, tai trombi repäisi köyden irti). */
export function withoutAnchor(t: TubeState): TubeState {
  if (!t.anchor) return t;
  const { anchor: _, ...rest } = t;
  return rest;
}
