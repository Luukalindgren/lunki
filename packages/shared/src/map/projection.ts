/**
 * ETRS-TM35FIN (EPSG:3067) -projektio GRS80-ellipsoidilla, Krügerin sarjat
 * (JHS 154). Pelin metrikoordinaatit lasketaan tästä, joten 1 yksikkö = 1 m.
 */
const A = 6378137;
const F = 1 / 298.257222101;
const K0 = 0.9996;
const LON0 = (27 * Math.PI) / 180;
const FALSE_EASTING = 500000;

const N = F / (2 - F);
const A1 = (A / (1 + N)) * (1 + (N * N) / 4 + N ** 4 / 64);
const E = Math.sqrt(F * (2 - F));
const H = [
  N / 2 - (2 / 3) * N ** 2 + (5 / 16) * N ** 3 + (41 / 180) * N ** 4,
  (13 / 48) * N ** 2 - (3 / 5) * N ** 3 + (557 / 1440) * N ** 4,
  (61 / 240) * N ** 3 - (103 / 140) * N ** 4,
  (49561 / 161280) * N ** 4,
] as const;

export interface Tm35 {
  /** Itäkoordinaatti (m). */
  e: number;
  /** Pohjoiskoordinaatti (m). */
  n: number;
}

/** WGS84/ETRS89-pituus- ja leveysaste (asteina) → ETRS-TM35FIN. */
export function toTm35fin(lon: number, lat: number): Tm35 {
  const phi = (lat * Math.PI) / 180;
  const lambda = (lon * Math.PI) / 180;
  const q = Math.asinh(Math.tan(phi)) - E * Math.atanh(E * Math.sin(phi));
  const beta = Math.atan(Math.sinh(q));
  const eta0 = Math.atanh(Math.cos(beta) * Math.sin(lambda - LON0));
  const xi0 = Math.asin(Math.sin(beta) * Math.cosh(eta0));
  let xi = xi0;
  let eta = eta0;
  for (let i = 0; i < H.length; i++) {
    const k = 2 * (i + 1);
    xi += H[i]! * Math.sin(k * xi0) * Math.cosh(k * eta0);
    eta += H[i]! * Math.cos(k * xi0) * Math.sinh(k * eta0);
  }
  return { e: A1 * eta * K0 + FALSE_EASTING, n: A1 * xi * K0 };
}
