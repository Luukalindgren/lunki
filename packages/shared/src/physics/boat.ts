import type { Vec2 } from '../vec2';
import { TUBE_PHYSICS, TUBE_RADIUS, type CraftPhysics, type TubeInput } from './tube';

/**
 * Soutuvene venekisaan (#263). Vene on yksi joukkue: soutaja ja enintään kaksi
 * kalastajaa perässä ja keulassa. Veneen tila on soutajan `TubeState`:
 * soutaja istuu keskellä selkä keulaan päin, joten `heading` osoittaa perään,
 * ja airoveto (positiivinen potku) vie venettä keula edellä kuten rengasta
 * selkä edellä. Soutaa ja kalastaa ei voi yhtä aikaa.
 */
export type Craft = 'tube' | 'boat';

export const CRAFT_IDS: readonly Craft[] = ['tube', 'boat'];

export const isCraft = (v: unknown): v is Craft => v === 'tube' || v === 'boat';

/** Veneen törmäysympyrän säde (m): rungon keskiosa, päät jäävät hieman yli. */
export const BOAT_RADIUS = 1.4;

/** Rungon mitat piirtoa varten (m). */
export const BOAT_HULL = { length: 3.6, beam: 1.3 } as const;

/**
 * Airovedot: vene on raskaampi ja liukuu pidemmälle kuin rengas. Huippunopeus
 * on n. 1,3-kertainen (2,3 m/s, renkaalla 1,8 m/s), ja käännökset ovat hitaampia.
 */
export const BOAT_PHYSICS: CraftPhysics = {
  kickAccel: 1,
  sprintFactor: 1.5,
  forwardFactor: 0.6,
  /** Airovetoa sekunnissa. */
  kickRate: 0.55,
  sprintKickRate: 0.8,
  /** Työntö tulee vedoissa, välissä vene liukuu. */
  kickPulse: 0.95,
  linearDrag: 0.15,
  quadraticDrag: 0.12,
  turnAccel: 2.2,
  turnDrag: 3,
  windPush: 0.0009,
  shoreBounce: 0.1,
};

/** Aluksen törmäyssäde ja liike. */
export interface CraftSpec {
  radius: number;
  physics: CraftPhysics;
}

export const CRAFTS: Record<Craft, CraftSpec> = {
  tube: { radius: TUBE_RADIUS, physics: TUBE_PHYSICS },
  boat: { radius: BOAT_RADIUS, physics: BOAT_PHYSICS },
};

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
