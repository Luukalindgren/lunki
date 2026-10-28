import { CRAFTS, craftCircles, type CraftSpec } from './boat';
import type { TubeState } from './tube';

/** Renkaiden välinen kimmoisuus: 0 = tarttuvat, 1 = täysin kimmoisa. */
export const TUBE_RESTITUTION = 0.6;

/**
 * Kahden aluksen törmäys. Alukset ovat ympyröitä (rengas yksi, vene kolme
 * rungon pituudelta), ja syvimmin päällekkäin oleva pari ratkaisee: alukset
 * työnnetään erilleen ja nopeuden normaalikomponentti vaihtuu kimmoisuuden
 * mukaan painojen suhteessa (kevyt rengas kimpoaa raskaasta veneestä).
 * Palauttaa uudet tilat tai null, jos alukset eivät kosketa.
 */
export function collideTubePair(
  a: TubeState,
  b: TubeState,
  ca: CraftSpec = CRAFTS.tube,
  cb: CraftSpec = ca,
): [TubeState, TubeState] | null {
  let best: { dx: number; dy: number; d2: number; min: number } | null = null;
  for (const p of craftCircles(a, ca))
    for (const q of craftCircles(b, cb)) {
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const min = p.r + q.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min) continue;
      if (!best || min - Math.sqrt(d2) > best.min - Math.sqrt(best.d2)) best = { dx, dy, d2, min };
    }
  if (!best) return null;
  let { dx, dy } = best;
  let d = Math.sqrt(best.d2);
  if (d < 1e-6) {
    // Täsmälleen päällekkäin: erotetaan kiinteään suuntaan, jotta tulos on sama kaikkialla.
    dx = 1;
    dy = 0;
    d = 1;
  }
  const nx = dx / d;
  const ny = dy / d;
  const depth = best.min - Math.min(d, best.min);
  // Kevyempi siirtyy enemmän.
  const wa = cb.mass / (ca.mass + cb.mass);
  const wb = 1 - wa;

  // Lähestymisnopeus normaalin suunnassa.
  const vn = (b.vel.x - a.vel.x) * nx + (b.vel.y - a.vel.y) * ny;
  const j = vn < 0 ? (-(1 + TUBE_RESTITUTION) * vn) / (1 / ca.mass + 1 / cb.mass) : 0;
  const ja = j / ca.mass;
  const jb = j / cb.mass;

  return [
    {
      ...a,
      pos: { x: a.pos.x - nx * depth * wa, y: a.pos.y - ny * depth * wa },
      vel: { x: a.vel.x - ja * nx, y: a.vel.y - ja * ny },
    },
    {
      ...b,
      pos: { x: b.pos.x + nx * depth * wb, y: b.pos.y + ny * depth * wb },
      vel: { x: b.vel.x + jb * nx, y: b.vel.y + jb * ny },
    },
  ];
}

/**
 * Ratkaisee kaikki parit kiinteässä järjestyksessä (sama tulos palvelimella
 * ja testeissä). Muokkaa taulukkoa paikallaan; palauttaa törmänneiden
 * indeksit. `crafts[i]` = aluksen laji (oletus rengas).
 */
export function collideTubes(tubes: TubeState[], crafts: readonly CraftSpec[] = []): Set<number> {
  const hit = new Set<number>();
  for (let i = 0; i < tubes.length; i++)
    for (let k = i + 1; k < tubes.length; k++) {
      const r = collideTubePair(
        tubes[i]!,
        tubes[k]!,
        crafts[i] ?? CRAFTS.tube,
        crafts[k] ?? CRAFTS.tube,
      );
      if (!r) continue;
      tubes[i] = r[0];
      tubes[k] = r[1];
      hit.add(i).add(k);
    }
  return hit;
}
