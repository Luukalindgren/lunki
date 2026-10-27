import {
  BoatSeat,
  CRAFTS,
  NET_DT,
  collideTubeWithShore,
  collideTubes,
  passengerInput,
  rowerInput,
  seatPos,
  stepPlayerTube,
  type Craft,
  type InputQueue,
  type TubeState,
  type Vec2,
  type WaterBody,
} from '@lunki/shared';

/** Palvelimen tila yhdelle pelaajalle. */
export interface Sim {
  tube: TubeState;
  inputs: InputQueue;
  /** Viehe on käynyt vedessä edellisen saaliin jälkeen. */
  splashed: boolean;
  /** Edellisen saaliin kisa-aika (s). */
  lastCatchAt: number;
  /** Vieheen paikka, kun kala viimeksi tarttui (saaliin tarkistukseen). */
  hookAt?: Vec2 | null;
  /** Venekisa (#263): vene 1… ja paikka (BoatSeat); puuttuu = oma rengas. */
  boat?: number;
  seat?: number;
  /** Viehe ilmassa tai vedessä: soutaja ei voi samalla soutaa. */
  fishing?: boolean;
}

export const FROZEN = { kick: 0, turn: 0, sprint: false };

/** Kulkeeko pelaaja omalla aluksellaan (rengas tai veneen soutaja) vai kyydissä. */
export const isPassenger = (sim: Sim) => !!sim.boat && (sim.seat ?? 0) !== BoatSeat.rower;

/** Veneen soutaja eli veneen tila; null, jos veneessä ei ole soutajaa. */
export function rowerOf(sims: Iterable<Sim>, boat: number): Sim | null {
  for (const s of sims) if (s.boat === boat && !isPassenger(s)) return s;
  return null;
}

/**
 * Yksi palvelimen askel: jokainen alus etenee yhdellä syötteellään
 * (tyhjällä jonolla odottaa; `frozen` = lähtölaskenta), sitten ratkaistaan
 * alusten väliset törmäykset. Venekisassa (#263) soutaja liikuttaa venettä,
 * ja kyydissä olevat vain kääntyvät paikoillaan ja seuraavat venettä.
 * Palauttaa muuttuneiden indeksit.
 */
export function stepSims(
  sims: Sim[],
  water: WaterBody,
  frozen = false,
  /** Tuuli; funktiona, kun se riippuu renkaasta (trombi). */
  wind?: Vec2 | ((sim: Sim, index: number) => Vec2),
  craft: Craft = 'tube',
): Set<number> {
  const spec = CRAFTS[craft];
  const moved = new Set<number>();
  sims.forEach((sim, i) => {
    const input = sim.inputs.next();
    if (!input) return;
    const passenger = isPassenger(sim);
    // Lähtölaskennan aikana syötteet kuitataan, mutta rengas ei liiku.
    sim.tube = frozen
      ? stepPlayerTube(sim.tube, FROZEN, water, NET_DT, undefined, spec)
      : stepPlayerTube(
          sim.tube,
          passenger ? passengerInput(input) : rowerInput(input, !!sim.boat && !!sim.fishing),
          water,
          NET_DT,
          typeof wind === 'function' ? wind(sim, i) : wind,
          passenger ? CRAFTS.tube : spec,
        );
    moved.add(i);
  });
  // Törmäävät vain alukset: kyydissä olevat ovat veneen sisällä.
  const crafts = sims.flatMap((s, i) => (isPassenger(s) ? [] : [i]));
  const before = crafts.map((i) => sims[i]!.tube);
  const after = [...before];
  for (const k of collideTubes(after, spec.radius)) {
    const i = crafts[k]!;
    sims[i]!.tube = collideTubeWithShore(
      before[k]!,
      after[k]!,
      water,
      spec.radius,
      spec.physics.shoreBounce,
    );
    moved.add(i);
  }
  sims.forEach((sim, i) => {
    if (!isPassenger(sim)) return;
    const boat = rowerOf(sims, sim.boat!);
    if (!boat) return;
    sim.tube = followBoat(sim.tube, boat.tube, sim.seat!);
    moved.add(i);
  });
  return moved;
}

/** Kyydissä oleva paikallaan veneessä: paikka ja nopeus veneestä, katse oma. */
export const followBoat = (t: TubeState, boat: TubeState, seat: number): TubeState => ({
  ...t,
  pos: seatPos(boat, seat),
  vel: { ...boat.vel },
});
