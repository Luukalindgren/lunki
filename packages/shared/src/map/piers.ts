import type { Vec2 } from '../vec2';
import { signedArea } from './geometry';
import { pointInRing } from './surroundings';
import type { LakeMap, LakeSurroundings } from './types';

export interface Footprint {
  center: Vec2;
  /** Pitkän sivun suunta (rad, peli-koordinaateissa). */
  angle: number;
  length: number;
  width: number;
  area: number;
}

export interface Pier {
  /** Kannen alku maalla ja kärki järvellä. */
  from: Vec2;
  to: Vec2;
  /**
   * Törmäysalueen alku: ensimmäinen kohta, jossa koko laiturin leveys on
   * vedessä. Rannan ja tämän välinen rako on kapeampi kuin rengas.
   */
  base: Vec2;
}

/** Laiturin kannen leveys (m). */
export const PIER_WIDTH = 1.6;
/** Kannen yläpinta vedenpinnasta (m): maalla seisova kävelee sen päällä. */
export const PIER_DECK = 0.525;

/** Laiturin pituus (m) ja suurin rakennuksen etäisyys rannasta (m). */
const PIER_LENGTH = { min: 7, max: 13 };
const PIER_REACH = 45;
const PIER_SPACING = 50;

/**
 * Laiturit: OSM:ssä niitä ei tältä järveltä ole, joten rannan mökeille
 * päätellään laituri lähimpään rantaan. Kahden laiturin väli on vähintään
 * PIER_SPACING, ja laiturin pitää olla koko matkaltaan vedessä.
 */
export function planPiers(map: LakeMap, s: LakeSurroundings): Pier[] {
  const piers: Pier[] = [];
  const isWater = (p: Vec2) =>
    pointInRing(p, map.shore) && !map.islands.some((isl) => pointInRing(p, isl));
  for (const a of s.areas) {
    if (a.kind !== 'building') continue;
    const f = footprint(a.rings[0]!);
    if (f.area > 200) continue;
    const q = closestOnRing(f.center, map.shore);
    const dist = Math.hypot(q.x - f.center.x, q.y - f.center.y);
    if (dist > PIER_REACH || dist < 1) continue;
    if (piers.some((p) => Math.hypot(p.from.x - q.x, p.from.y - q.y) < PIER_SPACING)) continue;
    const dir = { x: (q.x - f.center.x) / dist, y: (q.y - f.center.y) / dist };
    // Pituus vaihtelee rakennuksen paikan mukaan, mutta on aina sama.
    const len =
      PIER_LENGTH.min +
      ((Math.abs(f.center.x * 7 + f.center.y * 13) % 100) / 100) *
        (PIER_LENGTH.max - PIER_LENGTH.min);
    const at = (d: number) => ({ x: q.x + dir.x * d, y: q.y + dir.y * d });
    const side = { x: (-dir.y * PIER_WIDTH) / 2, y: (dir.x * PIER_WIDTH) / 2 };
    const wide = (d: number) => {
      const c = at(d);
      return (
        isWater({ x: c.x + side.x, y: c.y + side.y }) &&
        isWater({ x: c.x - side.x, y: c.y - side.y })
      );
    };
    let start = 0.1;
    while (start < 1.5 && !wide(start)) start += 0.1;
    let ok = start < 1.5;
    for (let d = start; d <= len && ok; d += 0.5) ok = wide(d);
    if (ok && wide(len)) piers.push({ from: at(-1.5), to: at(len), base: at(start) });
  }
  return piers;
}

/** Laiturin törmäysalue suorakaiteena (vedessä oleva osa kannesta). */
export function pierRing(p: Pier): Vec2[] {
  return deckRect(p.base, p.to);
}

/**
 * Koko kansi maalta kärkeen (#457): sillä voi kävellä, myös rannan ja
 * törmäysalueen välisen kapean raon yli.
 */
export function pierDeckRing(p: Pier): Vec2[] {
  return deckRect(p.from, p.to);
}

function deckRect(a: Vec2, b: Vec2): Vec2[] {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  const sx = (-uy * PIER_WIDTH) / 2;
  const sy = (ux * PIER_WIDTH) / 2;
  return [
    { x: a.x + sx, y: a.y + sy },
    { x: b.x + sx, y: b.y + sy },
    { x: b.x - sx, y: b.y - sy },
    { x: a.x - sx, y: a.y - sy },
  ];
}

/** Pohjapiirroksen suorakaide: pisimmän sivun suunta ja laajuus sen mukaan. */
export function footprint(ring: readonly Vec2[]): Footprint {
  let angle = 0;
  let longest = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len > longest) {
      longest = len;
      angle = Math.atan2(b.y - a.y, b.x - a.x);
    }
  }
  const u = { x: Math.cos(angle), y: Math.sin(angle) };
  const v = { x: -u.y, y: u.x };
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (const p of ring) {
    const pu = p.x * u.x + p.y * u.y;
    const pv = p.x * v.x + p.y * v.y;
    minU = Math.min(minU, pu);
    maxU = Math.max(maxU, pu);
    minV = Math.min(minV, pv);
    maxV = Math.max(maxV, pv);
  }
  const cu = (minU + maxU) / 2;
  const cv = (minV + maxV) / 2;
  let length = maxU - minU;
  let width = maxV - minV;
  if (width > length) {
    [length, width] = [width, length];
    angle += Math.PI / 2;
  }
  return {
    center: { x: u.x * cu + v.x * cv, y: u.y * cu + v.y * cv },
    angle,
    length: Math.max(2, length),
    width: Math.max(2, width),
    area: Math.abs(signedArea(ring as Vec2[])),
  };
}

function closestOnRing(p: Vec2, ring: readonly Vec2[]): Vec2 {
  let best = ring[0]!;
  let bestD = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.max(
      0,
      Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)),
    );
    const q = { x: a.x + dx * t, y: a.y + dy * t };
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < bestD) {
      bestD = d;
      best = q;
    }
  }
  return best;
}
