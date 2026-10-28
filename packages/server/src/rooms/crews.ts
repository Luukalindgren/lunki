import { BOAT_CREW } from '@lunki/shared';

/** Pelaajan paikka venekisassa (#263). */
export interface Crewmate {
  id: string;
  /** Vene 1…; 0 = ei vielä venettä. */
  boat: number;
  /** Paikka veneessä (BoatSeat); järjestää miehistön. */
  seat: number;
}

/**
 * Järjestää aulan veneet: veneettömälle oma uusi vene, veneet numeroidaan
 * 1… ja paikat täytetään soutajasta alkaen entisessä järjestyksessä.
 * Liian täyden veneen ylimääräiset saavat omat veneensä. Palauttaa uudet
 * paikat samassa järjestyksessä kuin `list`.
 */
export function packCrews(list: readonly Crewmate[]): Crewmate[] {
  const boats = new Map<number, Crewmate[]>();
  const loose: Crewmate[] = [];
  for (const c of list) {
    if (c.boat <= 0) {
      loose.push(c);
      continue;
    }
    const crew = boats.get(c.boat) ?? [];
    crew.push(c);
    boats.set(c.boat, crew);
  }
  const crews: Crewmate[][] = [];
  for (const [, crew] of [...boats].sort(([a], [b]) => a - b)) {
    crew.sort((a, b) => a.seat - b.seat);
    for (let k = 0; k < crew.length; k += BOAT_CREW) crews.push(crew.slice(k, k + BOAT_CREW));
  }
  for (const c of loose) crews.push([c]);
  const out = new Map<string, Crewmate>();
  crews.forEach((crew, b) =>
    crew.forEach((c, seat) => out.set(c.id, { id: c.id, boat: b + 1, seat })),
  );
  return list.map((c) => out.get(c.id)!);
}

/**
 * Pelaaja siirtyy veneeseen `boat` (viimeiseksi) tai omaan uuteen veneeseen
 * (0). Täyteen veneeseen ei mahdu; yksin veneessä oleva ei tarvitse uutta.
 * Palauttaa uudet paikat tai null, jos siirto ei käy.
 */
export function moveToBoat(list: readonly Crewmate[], id: string, boat: number): Crewmate[] | null {
  const me = list.find((c) => c.id === id);
  if (!me || !Number.isInteger(boat) || boat < 0 || boat === me.boat) return null;
  const crewOf = (b: number) => list.filter((c) => c.boat === b);
  if (boat === 0) {
    if (crewOf(me.boat).length <= 1) return null;
    boat = Math.max(...list.map((c) => c.boat)) + 1;
  } else if (crewOf(boat).length === 0 || crewOf(boat).length >= BOAT_CREW) return null;
  return packCrews(list.map((c) => (c.id === id ? { ...c, boat, seat: BOAT_CREW } : c)));
}
