import { BOAT_CREW, BOAT_TUBE, BoatSeat } from '@lunki/shared';

/** Pelaajan kulkupeli aulassa (#263). */
export interface Crewmate {
  id: string;
  /** Vene 1…; 0 = kelluntarengas. */
  boat: number;
  /** Paikka veneessä (BoatSeat); järjestää miehistön. */
  seat: number;
}

/**
 * Järjestää aulan veneet: veneet numeroidaan 1… ja paikat täytetään
 * soutajasta alkaen entisessä järjestyksessä, joten lähteneen paikka
 * täyttyy. Liian täyden veneen ylimääräiset saavat omat veneensä.
 * Kelluntarenkaalla (vene 0) ei ole venettä eikä paikkaa. Palauttaa uudet
 * paikat samassa järjestyksessä kuin `list`.
 */
export function packCrews(list: readonly Crewmate[]): Crewmate[] {
  const boats = new Map<number, Crewmate[]>();
  for (const c of list) {
    if (c.boat <= 0) continue;
    const crew = boats.get(c.boat) ?? [];
    crew.push(c);
    boats.set(c.boat, crew);
  }
  const crews: Crewmate[][] = [];
  for (const [, crew] of [...boats].sort(([a], [b]) => a - b)) {
    crew.sort((a, b) => a.seat - b.seat);
    for (let k = 0; k < crew.length; k += BOAT_CREW) crews.push(crew.slice(k, k + BOAT_CREW));
  }
  const out = new Map<string, Crewmate>();
  crews.forEach((crew, b) =>
    crew.forEach((c, seat) => out.set(c.id, { id: c.id, boat: b + 1, seat })),
  );
  return list.map((c) => out.get(c.id) ?? { id: c.id, boat: 0, seat: 0 });
}

/**
 * Kulkupelin vaihto: veneeseen `boat` kyytiin (viimeiseksi), omaan uuteen
 * veneeseen (0) tai kelluntarenkaalle (BOAT_TUBE). Täyteen veneeseen ei
 * mahdu, ja yksin veneessä oleva ei tarvitse uutta. Palauttaa uudet paikat
 * tai null, jos vaihto ei käy.
 */
export function moveToBoat(list: readonly Crewmate[], id: string, boat: number): Crewmate[] | null {
  const me = list.find((c) => c.id === id);
  if (!me || !Number.isInteger(boat) || boat < BOAT_TUBE || (boat > 0 && boat === me.boat))
    return null;
  const crewOf = (b: number) => list.filter((c) => c.boat === b);
  if (boat === BOAT_TUBE) {
    if (me.boat === 0) return null;
    boat = 0;
  } else if (boat === 0) {
    if (me.boat > 0 && crewOf(me.boat).length <= 1) return null;
    boat = Math.max(0, ...list.map((c) => c.boat)) + 1;
  } else if (crewOf(boat).length === 0 || crewOf(boat).length >= BOAT_CREW) return null;
  return packCrews(list.map((c) => (c.id === id ? { ...c, boat, seat: BOAT_CREW } : c)));
}

/** Paikanvaihdon tulos (#357): siirto vapaalle paikalle, vaihto toisen kanssa tai pyyntö. */
export type SeatChange =
  { kind: 'move'; seat: number } | { kind: 'swap'; with: string } | { kind: 'ask'; seat: number };

/**
 * Pelaaja `id` haluaa veneessään paikalle `seat`. Vapaalle kyytiläisen
 * paikalle siirrytään kisassa suoraan (aulassa paikat täytetään järjestyksessä,
 * joten siellä vain vaihdetaan). Varatusta paikasta pyydetään vaihtoa, ja
 * vaihto tehdään, kun paikan haltija pyytää jo pyytäjän paikkaa. Soutaja ei
 * jätä airoja tyhjiksi, eikä tyhjälle soutajan paikalle siirrytä.
 * `asks` = pelaajan voimassa oleva pyyntö (paikka). Palauttaa null, jos
 * pyyntö ei kelpaa.
 */
export function seatChange(
  list: readonly Crewmate[],
  id: string,
  seat: number,
  asks: (id: string) => number | null,
  lobby: boolean,
): SeatChange | null {
  const me = list.find((c) => c.id === id);
  if (!me || me.boat <= 0 || !Number.isInteger(seat) || seat < 0 || seat >= BOAT_CREW) return null;
  if (seat === me.seat) return null;
  const holder = list.find((c) => c.id !== id && c.boat === me.boat && c.seat === seat);
  if (!holder) {
    if (lobby || me.seat === BoatSeat.rower || seat === BoatSeat.rower) return null;
    return { kind: 'move', seat };
  }
  return asks(holder.id) === me.seat ? { kind: 'swap', with: holder.id } : { kind: 'ask', seat };
}
