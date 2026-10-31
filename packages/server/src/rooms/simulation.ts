import {
  BoatSeat,
  CRAFTS,
  NET_DT,
  collideCraftWithShore,
  collideTubes,
  passengerInput,
  rowerInput,
  seatPos,
  stepPlayerTube,
  wrapAngle,
  type CraftSpec,
  type DepthAt,
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
  /** Vene (#263): vene 1… ja paikka (BoatSeat); puuttuu = kelluntarengas. */
  boat?: number;
  seat?: number;
  /** Viehe ilmassa tai soutaja kelaa: kädet vavassa, soutaa ei voi (#263). */
  rodInHand?: boolean;
  /** Soutaja kääntyneenä tuhdolla kalastaessaan (rad veneen suunnasta). */
  look?: number;
  /** Saa nousta maihin (#457): renkaalla, viehe sisällä, asiakas osaa rantautumisen. */
  canLand?: boolean;
}

export const FROZEN = { kick: 0, turn: 0, sprint: false, anchor: false };

/** Kulkeeko pelaaja omalla aluksellaan (rengas tai veneen soutaja) vai kyydissä. */
export const isPassenger = (sim: Sim) => !!sim.boat && (sim.seat ?? 0) !== BoatSeat.rower;

/** Veneen soutaja eli veneen tila; null, jos veneessä ei ole soutajaa. */
export function rowerOf(sims: Iterable<Sim>, boat: number): Sim | null {
  for (const s of sims) if (s.boat === boat && !isPassenger(s)) return s;
  return null;
}

/** Aluksen laji: veneen soutaja liikuttaa venettä, muut ovat renkaalla (tai kyydissä). */
export const craftOf = (sim: Sim): CraftSpec =>
  sim.boat && !isPassenger(sim) ? CRAFTS.boat : CRAFTS.tube;

/**
 * Yksi palvelimen askel: jokainen alus etenee yhdellä syötteellään
 * (tyhjällä jonolla odottaa; `frozen` = lähtölaskenta), sitten ratkaistaan
 * alusten väliset törmäykset. Veneessä (#263) soutaja liikuttaa venettä,
 * ja kyydissä olevat vain kääntyvät paikoillaan ja seuraavat venettä.
 * Renkaat ja veneet voivat olla samassa kisassa. Palauttaa muuttuneiden
 * indeksit.
 */
export function stepSims(
  sims: Sim[],
  water: WaterBody,
  frozen = false,
  /** Tuuli; funktiona, kun se riippuu renkaasta (trombi). */
  wind?: Vec2 | ((sim: Sim, index: number) => Vec2),
  /** Pohjan syvyys ankkurille (#355). */
  depthAt?: DepthAt,
): Set<number> {
  const moved = new Set<number>();
  // Veneiden suunta ennen askelta: kyytiläiset kääntyvät veneen mukana.
  const turnedFrom = new Map<number, number>();
  for (const s of sims) if (s.boat && !isPassenger(s)) turnedFrom.set(s.boat, s.tube.heading);
  sims.forEach((sim, i) => {
    const input = sim.inputs.next();
    if (!input) return;
    const passenger = isPassenger(sim);
    const spec = craftOf(sim);
    // Lähtölaskennan aikana syötteet kuitataan, mutta rengas ei liiku.
    sim.tube = frozen
      ? stepPlayerTube(sim.tube, FROZEN, water, NET_DT, undefined, spec)
      : stepPlayerTube(
          sim.tube,
          passenger ? passengerInput(input) : rowerInput(input, !!sim.boat && !!sim.rodInHand),
          water,
          NET_DT,
          typeof wind === 'function' ? wind(sim, i) : wind,
          spec,
          depthAt,
          !!sim.canLand && !passenger,
        );
    moved.add(i);
  });
  // Törmäävät vain alukset: kyydissä olevat ovat veneen sisällä ja maalla olevat maissa (#457).
  const crafts = sims.flatMap((s, i) => (isPassenger(s) || s.tube.shore ? [] : [i]));
  const specs = crafts.map((i) => craftOf(sims[i]!));
  const before = crafts.map((i) => sims[i]!.tube);
  const after = [...before];
  for (const k of collideTubes(after, specs)) {
    const i = crafts[k]!;
    sims[i]!.tube = collideCraftWithShore(before[k]!, after[k]!, water, specs[k]);
    moved.add(i);
  }
  sims.forEach((sim, i) => {
    if (!isPassenger(sim)) return;
    const boat = rowerOf(sims, sim.boat!);
    if (!boat) return;
    const turn = boat.tube.heading - (turnedFrom.get(sim.boat!) ?? boat.tube.heading);
    sim.tube = followBoat(sim.tube, boat.tube, sim.seat!, turn);
    moved.add(i);
  });
  return moved;
}

/**
 * Kyydissä oleva paikallaan veneessä: paikka ja nopeus veneestä, katse oma.
 * `turn` = veneen kääntymä askeleen aikana (rad): kyytiläinen kääntyy mukana.
 */
export const followBoat = (t: TubeState, boat: TubeState, seat: number, turn = 0): TubeState => ({
  ...t,
  pos: seatPos(boat, seat),
  vel: { ...boat.vel },
  heading: wrapAngle(t.heading + turn),
});
