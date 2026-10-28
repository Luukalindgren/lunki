import type { Vec2 } from '../vec2';
import {
  TUBE_PHYSICS,
  TUBE_RADIUS,
  collideTubeWithShore,
  type CraftPhysics,
  type TubeInput,
  type TubeState,
} from './tube';

/**
 * Soutuvene (#263). Kulkupeli valitaan pelaajakohtaisesti: kelluntarengas tai
 * vene, johon muut voivat tulla kyytiin. Venekunta on yksi joukkue: soutaja
 * ja enintään kaksi kalastajaa perässä ja keulassa. Veneen tila on soutajan
 * `TubeState`: soutaja istuu keskellä selkä keulaan päin, joten `heading`
 * osoittaa perään, ja airoveto (positiivinen potku) vie venettä keula edellä
 * kuten rengasta selkä edellä. Soutaa ja kalastaa ei voi yhtä aikaa.
 */
export type Craft = 'tube' | 'boat';

export const CRAFT_IDS: readonly Craft[] = ['tube', 'boat'];

export const isCraft = (v: unknown): v is Craft => v === 'tube' || v === 'boat';

/** Rungon mitat piirtoa varten (m). */
export const BOAT_HULL = { length: 3.6, beam: 1.3 } as const;

/**
 * Törmäysympyrä aluksen pituusakselilla: keskipiste `at` metriä soutajasta
 * katsesuuntaan (veneellä perään päin) ja säde `r`.
 */
export interface HullCircle {
  readonly at: number;
  readonly r: number;
}

/**
 * Veneen runko kolmena ympyränä: perä, keskiosa ja kapea keula. Näin keula
 * ja perä eivät työnny rantaan, eikä veneen kylki törmää metrien päästä.
 */
export const BOAT_CIRCLES: readonly HullCircle[] = [
  { at: 1, r: 0.62 },
  { at: -0.15, r: 0.66 },
  { at: -1.3, r: 0.5 },
];

/** Veneen ulottuvuus soutajasta (m): aloituspaikkojen väli ja karkea rajaus. */
export const BOAT_RADIUS = 1.9;

/**
 * Airovedot: vene on raskas, joten se kiihtyy rengasta hitaammin (puoleen
 * vauhtiin n. 2,5 s, renkaalla 1 s), mutta kulkee kovempaa (2,8 m/s, kiivain
 * vedoin 3,6 m/s; renkaalla 1,8 ja 2,7 m/s) ja liukuu vetojen jälkeen
 * pitkään: täydestä vauhdista puoleen n. 4 s ja 8 m, pysähdyksiin n. 17 m
 * (renkaalla 1 s ja 1,5 m, pysähdyksiin 3 m). Käännökset ovat hitaampia, ja
 * tuuli ajattaa venettä hieman rengasta enemmän.
 */
export const BOAT_PHYSICS: CraftPhysics = {
  kickAccel: 0.6,
  sprintFactor: 1.5,
  forwardFactor: 0.6,
  /** Airovetoa sekunnissa. */
  kickRate: 0.55,
  sprintKickRate: 0.8,
  /** Työntö tulee vedoissa, välissä vene liukuu. */
  kickPulse: 0.5,
  linearDrag: 0.1,
  quadraticDrag: 0.04,
  turnAccel: 2.2,
  turnDrag: 3,
  windPush: 0.0005,
  shoreBounce: 0.1,
};

/** Aluksen runko, paino ja liike. */
export interface CraftSpec {
  /** Ulottuvuus kalastajasta (m). */
  radius: number;
  /** Törmäysympyrät rantaa ja muita aluksia vastaan. */
  circles: readonly HullCircle[];
  /** Suhteellinen paino törmäyksissä: kevyt rengas kimpoaa raskaasta veneestä. */
  mass: number;
  physics: CraftPhysics;
}

export const CRAFTS: Record<Craft, CraftSpec> = {
  tube: {
    radius: TUBE_RADIUS,
    circles: [{ at: 0, r: TUBE_RADIUS }],
    mass: 1,
    physics: TUBE_PHYSICS,
  },
  boat: { radius: BOAT_RADIUS, circles: BOAT_CIRCLES, mass: 2.5, physics: BOAT_PHYSICS },
};

/** Aluksen törmäysympyrät maailmassa. */
export function craftCircles(
  t: { pos: Vec2; heading: number },
  craft: CraftSpec,
): { x: number; y: number; r: number }[] {
  const cx = Math.cos(t.heading);
  const cy = Math.sin(t.heading);
  return craft.circles.map((c) => ({ x: t.pos.x + cx * c.at, y: t.pos.y + cy * c.at, r: c.r }));
}

type Shore = {
  moveCircle(from: Vec2, to: Vec2, radius: number): { position: Vec2; normal: Vec2 } | null;
};

/**
 * Rantakorjaus aluksen rungolle. Renkaalla yksi ympyrä (collideTubeWithShore).
 * Veneellä jokainen rungon ympyrä tarkistetaan erikseen: rantaan osunut pää
 * työntää koko venettä takaisin veteen, rantaan päin oleva vauhti kimpoaa ja
 * käännös, joka veisi päätä maihin, pysähtyy.
 */
export function collideCraftWithShore(
  prev: TubeState,
  next: TubeState,
  water: Shore,
  craft: CraftSpec = CRAFTS.tube,
): TubeState {
  const bounce = craft.physics.shoreBounce;
  if (craft.circles.length === 1 && craft.circles[0]!.at === 0)
    return collideTubeWithShore(prev, next, water, craft.circles[0]!.r, bounce);
  let t = next;
  // Toinen kierros: yhden pään korjaus voi painaa toisen pään rantaan.
  for (let pass = 0; pass < 2; pass++)
    for (const c of craft.circles) {
      const ox = Math.cos(t.heading) * c.at;
      const oy = Math.sin(t.heading) * c.at;
      const to = { x: t.pos.x + ox, y: t.pos.y + oy };
      const from = {
        x: prev.pos.x + Math.cos(prev.heading) * c.at,
        y: prev.pos.y + Math.sin(prev.heading) * c.at,
      };
      const hit = water.moveCircle(pass === 0 ? from : to, to, c.r);
      if (!hit) continue;
      const n = hit.normal;
      let vel = t.vel;
      let angVel = t.angVel;
      const vn = vel.x * n.x + vel.y * n.y;
      if (vn < 0) vel = { x: vel.x - (1 + bounce) * vn * n.x, y: vel.y - (1 + bounce) * vn * n.y };
      // Kääntyminen liikuttaa päätä nopeudella ω × r; maihin päin vievä käännös pysähtyy.
      if (-angVel * oy * n.x + angVel * ox * n.y < 0) angVel = -angVel * bounce;
      t = {
        ...t,
        pos: { x: t.pos.x + hit.position.x - to.x, y: t.pos.y + hit.position.y - to.y },
        vel,
        angVel,
      };
    }
  return t;
}

/** Paikat veneessä. Kelluntarenkaalla jokainen on oman aluksensa "soutaja". */
export const BoatSeat = { rower: 0, stern: 1, bow: 2 } as const;
export type BoatSeat = (typeof BoatSeat)[keyof typeof BoatSeat];

/** Veneeseen mahtuu soutaja ja kaksi kalastajaa. */
export const BOAT_CREW = 3;

/** Perän ja keulan kalastajan etäisyys soutajasta (m). */
export const SEAT_OFFSET = 1.2;

/** Isku aallosta: vene kaatuu vasta näin monta kertaa korkeammasta aallosta kuin rengas. */
export const BOAT_WAVE_FACTOR = 2;

/** Kalastajan paikka veneessä: perä on soutajan edessä, keula hänen selkänsä takana. */
export function seatPos(boat: { pos: Vec2; heading: number }, seat: number): Vec2 {
  const k = seat === BoatSeat.stern ? SEAT_OFFSET : seat === BoatSeat.bow ? -SEAT_OFFSET : 0;
  return { x: boat.pos.x + Math.cos(boat.heading) * k, y: boat.pos.y + Math.sin(boat.heading) * k };
}

/** Matkustaja ei soua: hän voi vain kääntyä paikallaan heittämään. */
export const passengerInput = (i: TubeInput): TubeInput => ({
  kick: 0,
  turn: i.turn,
  sprint: false,
});

/** Soutaja, jonka viehe on vedessä tai ilmassa, ei soua eikä käännä venettä. */
export const rowerInput = (i: TubeInput, fishing: boolean): TubeInput =>
  fishing ? { kick: 0, turn: 0, sprint: false } : i;

/**
 * Soutaja kääntyy tuhdolla kalastaessaan (rad/s). Kääntyminen on kulma
 * veneen suunnasta (`look`); soutamaan palatessa hän kääntyy takaisin airoihin.
 */
export const SWIVEL_RATE = 1.8;

/** Tuhdolla kääntymisen askel: `turn` kalastaessa, airoissa takaisin perään päin. */
export function stepSwivel(look: number, turn: number, rowing: boolean, dt: number): number {
  if (!rowing) return wrap(look + Math.max(-1, Math.min(1, turn)) * SWIVEL_RATE * dt);
  const back = SWIVEL_RATE * 2 * dt;
  return Math.abs(look) <= back ? 0 : look - Math.sign(look) * back;
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
