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

/** Käynnissä oleva sotku: kaksi siimaa, sotkukohta ja selvityksen edistyminen 0–1. */
export interface TanglePair {
  a: string;
  b: string;
  at: Vec2;
  progress: number;
}

/** Selvinneen siiman saa heittää ja se voi sotkeutua uudelleen vasta tämän ajan kuluttua (s). */
const TANGLE_REST = 2;

/**
 * Sotkujen kirjanpito ilman palvelinta (yksinpelin botit): samat säännöt kuin
 * moninpelin huoneessa. Ristissä olevat siimat sotkeutuvat, kun jompikumpi
 * kelaa, ja sotku selviää, kun osapuolet kelaavat yhteensä
 * `TANGLE.untangleSeconds`, tai kun toinen katkaisee siimansa.
 */
export class TangleBook {
  private readonly pairs: TanglePair[] = [];
  private readonly freeAt = new Map<string, number>();

  /**
   * Askel. `lines` = kaikki vedessä olevat siimat (myös sotkussa olevat).
   * Palauttaa alkaneet, kelaamalla selvinneet ja siiman kadottua purkautuneet
   * sotkut (esimerkiksi rangaistus vei siiman).
   */
  step(
    lines: readonly LineInWater[],
    now: number,
    dt: number,
  ): { started: TanglePair[]; untangled: TanglePair[]; dropped: TanglePair[] } {
    const byId = new Map(lines.map((l) => [l.id, l]));
    const untangled: TanglePair[] = [];
    const dropped: TanglePair[] = [];
    for (const p of [...this.pairs]) {
      const a = byId.get(p.a);
      const b = byId.get(p.b);
      if (!a || !b) {
        this.release(p, now);
        dropped.push(p);
        continue;
      }
      const holders = Number(a.reeling) + Number(b.reeling);
      p.progress = Math.min(1, p.progress + (holders * dt) / TANGLE.untangleSeconds);
      if (p.progress >= 1) {
        this.release(p, now);
        untangled.push(p);
      }
    }
    const free = lines.filter((l) => !this.of(l.id) && now >= (this.freeAt.get(l.id) ?? 0));
    const started = findTangles(free).map((t) => ({ ...t, progress: 0 }));
    this.pairs.push(...started);
    return { started, untangled, dropped };
  }

  /** Sotku, jossa siima on mukana, tai null. */
  of(id: string): TanglePair | null {
    return this.pairs.find((p) => p.a === id || p.b === id) ?? null;
  }

  /** Siima katkaistiin: sotku purkautuu. Palauttaa puretun sotkun tai null. */
  cut(id: string, now: number): TanglePair | null {
    const p = this.of(id);
    if (p) this.release(p, now);
    return p;
  }

  /** Käynnissä olevat sotkut. */
  get active(): readonly TanglePair[] {
    return this.pairs;
  }

  private release(p: TanglePair, now: number): void {
    this.pairs.splice(this.pairs.indexOf(p), 1);
    this.freeAt.set(p.a, now + TANGLE_REST);
    this.freeAt.set(p.b, now + TANGLE_REST);
  }
}
