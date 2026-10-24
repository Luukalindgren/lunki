import { TUBE_RADIUS, type TubeState } from './tube';

/** Renkaiden välinen kimmoisuus: 0 = tarttuvat, 1 = täysin kimmoisa. */
export const TUBE_RESTITUTION = 0.6;

/**
 * Kahden renkaan törmäys (ympyrä–ympyrä, yhtä painavat). Työntää renkaat
 * erilleen ja vaihtaa nopeuden normaalikomponentin kimmoisuuden mukaan.
 * Palauttaa uudet tilat tai null, jos renkaat eivät kosketa.
 */
export function collideTubePair(a: TubeState, b: TubeState): [TubeState, TubeState] | null {
  let dx = b.pos.x - a.pos.x;
  let dy = b.pos.y - a.pos.y;
  const min = TUBE_RADIUS * 2;
  const d2 = dx * dx + dy * dy;
  if (d2 >= min * min) return null;
  let d = Math.sqrt(d2);
  if (d < 1e-6) {
    // Täsmälleen päällekkäin: erotetaan kiinteään suuntaan, jotta tulos on sama kaikkialla.
    dx = 1;
    dy = 0;
    d = 1;
  }
  const nx = dx / d;
  const ny = dy / d;
  const push = (min - Math.min(d, min)) / 2;

  // Lähestymisnopeus normaalin suunnassa.
  const vn = (b.vel.x - a.vel.x) * nx + (b.vel.y - a.vel.y) * ny;
  const j = vn < 0 ? (-(1 + TUBE_RESTITUTION) * vn) / 2 : 0;

  return [
    {
      ...a,
      pos: { x: a.pos.x - nx * push, y: a.pos.y - ny * push },
      vel: { x: a.vel.x - j * nx, y: a.vel.y - j * ny },
    },
    {
      ...b,
      pos: { x: b.pos.x + nx * push, y: b.pos.y + ny * push },
      vel: { x: b.vel.x + j * nx, y: b.vel.y + j * ny },
    },
  ];
}

/**
 * Ratkaisee kaikki parit kiinteässä järjestyksessä (sama tulos palvelimella
 * ja testeissä). Muokkaa taulukkoa paikallaan; palauttaa törmänneiden indeksit.
 */
export function collideTubes(tubes: TubeState[]): Set<number> {
  const hit = new Set<number>();
  for (let i = 0; i < tubes.length; i++)
    for (let k = i + 1; k < tubes.length; k++) {
      const r = collideTubePair(tubes[i]!, tubes[k]!);
      if (!r) continue;
      tubes[i] = r[0];
      tubes[k] = r[1];
      hit.add(i).add(k);
    }
  return hit;
}
