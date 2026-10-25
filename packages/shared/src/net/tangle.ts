import type { Vec2 } from '../vec2';

export const TANGLE = {
  /** Yhteinen selvitysaika (s): kumpikin kelaava pelaaja edistää selvitystä. */
  untangleSeconds: 6,
} as const;

/**
 * Kahden janan leikkauspiste tai null. Päätepisteiden kosketus ei riitä:
 * siimat ovat ristissä vasta, kun janat leikkaavat toisensa sisäpisteissä.
 */
export function segmentsCross(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): Vec2 | null {
  const rx = a2.x - a1.x;
  const ry = a2.y - a1.y;
  const sx = b2.x - b1.x;
  const sy = b2.y - b1.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-9) return null;
  const qx = b1.x - a1.x;
  const qy = b1.y - a1.y;
  const t = (qx * sy - qy * sx) / den;
  const u = (qx * ry - qy * rx) / den;
  const eps = 1e-6;
  if (t <= eps || t >= 1 - eps || u <= eps || u >= 1 - eps) return null;
  return { x: a1.x + rx * t, y: a1.y + ry * t };
}

/** Siima vedessä: vavan kärjestä vieheeseen. */
export interface LineInWater {
  id: string;
  tip: Vec2;
  lure: Vec2;
  /** Pelaaja kelaa juuri nyt. */
  reeling: boolean;
}

/**
 * Sotkeutuvat siimaparit: siimat ovat ristissä ja jompikumpi kelaa.
 * Kukin siima sotkeutuu korkeintaan yhteen toiseen kerrallaan.
 */
export function findTangles(lines: readonly LineInWater[]): { a: string; b: string; at: Vec2 }[] {
  const out: { a: string; b: string; at: Vec2 }[] = [];
  const used = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const a = lines[i]!;
      const b = lines[j]!;
      if (used.has(a.id) || used.has(b.id) || !(a.reeling || b.reeling)) continue;
      const at = segmentsCross(a.tip, a.lure, b.tip, b.lure);
      if (!at) continue;
      out.push({ a: a.id, b: b.id, at });
      used.add(a.id);
      used.add(b.id);
    }
  }
  return out;
}
