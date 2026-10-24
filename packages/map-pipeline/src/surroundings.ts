import {
  signedArea,
  simplifyPath,
  simplifyRing,
  toTm35fin,
  type AreaKind,
  type LakeMap,
  type LakeSurroundings,
  type LineKind,
  type Vec2,
} from '@lunki/shared';
import { MARGIN_M } from './area';
import type { LonLatRing, OsmSurroundings } from './osm';

export interface Dem {
  source: string;
  west: number;
  north: number;
  dLon: number;
  dLat: number;
  cols: number;
  rows: number;
  /** Desimetreinä, riveittäin pohjoisesta etelään. */
  heights: number[];
}

/** Maaston ruudukon koko pelissä (m). */
export const TERRAIN_CELL = 20;
/** Alueiden ja viivojen yksinkertaistus (m) ja pienin otettava alue (m²). */
const AREA_TOLERANCE = 1.5;
const LINE_TOLERANCE = 1;
const MIN_AREA = 20;

interface Rect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

export function toSurroundings(
  map: LakeMap,
  osm: OsmSurroundings | null,
  dem: Dem | null,
): LakeSurroundings {
  const rect: Rect = {
    minX: map.bounds.minX - MARGIN_M,
    minY: map.bounds.minY - MARGIN_M,
    maxX: map.bounds.maxX + MARGIN_M,
    maxY: map.bounds.maxY + MARGIN_M,
  };
  const local = (ring: LonLatRing): Vec2[] =>
    ring.map(([lon, lat]) => {
      const p = toTm35fin(lon, lat);
      return { x: p.e - map.origin.e, y: p.n - map.origin.n };
    });
  const tidy = (pts: Vec2[]) => pts.map((p) => ({ x: round1(p.x), y: round1(p.y) }));

  const areas: LakeSurroundings['areas'] = [];
  const lines: LakeSurroundings['lines'] = [];
  for (const f of osm?.features ?? []) {
    const name = f.name ? { name: f.name } : {};
    if (f.line) {
      for (const run of clipLine(local(f.line), rect)) {
        const pts = simplifyPath(run, LINE_TOLERANCE);
        if (pts.length >= 2) lines.push({ kind: f.kind as LineKind, ...name, points: tidy(pts) });
      }
      continue;
    }
    const holes = (f.inner ?? []).map((r) => closeless(local(r)));
    for (const outerRaw of f.outer ?? []) {
      const outer = clipRing(closeless(local(outerRaw)), rect);
      if (outer.length < 3 || Math.abs(signedArea(outer)) < MIN_AREA) continue;
      const simple = simplifyRing(outer, AREA_TOLERANCE);
      if (simple.length < 3) continue;
      const mine = holes
        .filter((h) => h.length >= 3 && pointInRing(h[0]!, outer))
        .map((h) => simplifyRing(clipRing(h, rect), AREA_TOLERANCE))
        .filter((h) => h.length >= 3);
      areas.push({
        kind: f.kind as AreaKind,
        ...name,
        rings: [orient(simple, true), ...mine.map((h) => orient(h, false))].map(tidy),
      });
    }
  }
  // Isot alueet ensin, jotta pienet (rakennukset, pellot metsän keskellä) piirtyvät päälle.
  areas.sort((a, b) => Math.abs(signedArea(b.rings[0]!)) - Math.abs(signedArea(a.rings[0]!)));

  return {
    attribution: [osm?.source, dem?.source].filter((s): s is string => !!s),
    areas,
    lines,
    terrain: dem ? resampleDem(dem, map, rect) : null,
  };
}

/**
 * Korkeusmalli pelin ruudukkoon. Muutama kilometri on niin pieni alue, että
 * lon/lat → peli-koordinaatit on affiininen kuvaus; se käännetään ja
 * korkeus luetaan bilineaarisesti.
 */
function resampleDem(dem: Dem, map: LakeMap, rect: Rect): NonNullable<LakeSurroundings['terrain']> {
  const at = (lon: number, lat: number) => {
    const p = toTm35fin(lon, lat);
    return { x: p.e - map.origin.e, y: p.n - map.origin.n };
  };
  const lon0 = dem.west;
  const lat0 = dem.north;
  const o = at(lon0, lat0);
  const ex = at(lon0 + dem.dLon, lat0);
  const ey = at(lon0, lat0 + dem.dLat);
  // (x, y) = o + i·u + j·v, missä i = sarake ja j = rivi.
  const u = { x: ex.x - o.x, y: ex.y - o.y };
  const v = { x: ey.x - o.x, y: ey.y - o.y };
  const det = u.x * v.y - u.y * v.x;
  const sample = (p: Vec2) => {
    const dx = p.x - o.x;
    const dy = p.y - o.y;
    const i = (dx * v.y - dy * v.x) / det;
    const j = (u.x * dy - u.y * dx) / det;
    const i0 = Math.max(0, Math.min(dem.cols - 2, Math.floor(i)));
    const j0 = Math.max(0, Math.min(dem.rows - 2, Math.floor(j)));
    const ti = Math.max(0, Math.min(1, i - i0));
    const tj = Math.max(0, Math.min(1, j - j0));
    const h = (a: number, b: number) => dem.heights[b * dem.cols + a]! / 10;
    return (
      (h(i0, j0) * (1 - ti) + h(i0 + 1, j0) * ti) * (1 - tj) +
      (h(i0, j0 + 1) * (1 - ti) + h(i0 + 1, j0 + 1) * ti) * tj
    );
  };
  // Järven pinta: mediaani korkeuksista järven sisällä (DEM:ssä vesi on tasainen).
  const lake: number[] = [];
  for (let y = map.bounds.minY; y <= map.bounds.maxY; y += TERRAIN_CELL)
    for (let x = map.bounds.minX; x <= map.bounds.maxX; x += TERRAIN_CELL)
      if (pointInRing({ x, y }, map.shore)) lake.push(sample({ x, y }));
  lake.sort((a, b) => a - b);
  const waterLevel = round1(lake[Math.floor(lake.length / 2)] ?? 0);

  const cols = Math.ceil((rect.maxX - rect.minX) / TERRAIN_CELL) + 1;
  const rows = Math.ceil((rect.maxY - rect.minY) / TERRAIN_CELL) + 1;
  const heights: number[] = [];
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++)
      heights.push(
        round1(
          sample({ x: rect.minX + i * TERRAIN_CELL, y: rect.minY + j * TERRAIN_CELL }) - waterLevel,
        ),
      );
  return { minX: rect.minX, minY: rect.minY, cell: TERRAIN_CELL, cols, rows, waterLevel, heights };
}

function closeless(ring: Vec2[]): Vec2[] {
  const last = ring[ring.length - 1];
  return ring.length > 1 && last!.x === ring[0]!.x && last!.y === ring[0]!.y
    ? ring.slice(0, -1)
    : ring;
}

function orient(ring: Vec2[], ccw: boolean): Vec2[] {
  return signedArea(ring) > 0 === ccw ? ring : [...ring].reverse();
}

export function pointInRing(p: Vec2, ring: readonly Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      inside = !inside;
  }
  return inside;
}

/** Sutherland–Hodgman: monikulmio suorakaiteen sisään. */
export function clipRing(ring: Vec2[], r: Rect): Vec2[] {
  const edges: [(p: Vec2) => boolean, (a: Vec2, b: Vec2) => Vec2][] = [
    [(p) => p.x >= r.minX, (a, b) => lerpAt(a, b, (r.minX - a.x) / (b.x - a.x))],
    [(p) => p.x <= r.maxX, (a, b) => lerpAt(a, b, (r.maxX - a.x) / (b.x - a.x))],
    [(p) => p.y >= r.minY, (a, b) => lerpAt(a, b, (r.minY - a.y) / (b.y - a.y))],
    [(p) => p.y <= r.maxY, (a, b) => lerpAt(a, b, (r.maxY - a.y) / (b.y - a.y))],
  ];
  let out = ring;
  for (const [inside, cross] of edges) {
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const cur = input[i]!;
      const prev = input[(i + input.length - 1) % input.length]!;
      if (inside(cur)) {
        if (!inside(prev)) out.push(cross(prev, cur));
        out.push(cur);
      } else if (inside(prev)) out.push(cross(prev, cur));
    }
    if (out.length === 0) break;
  }
  return out;
}

/** Murtoviiva suorakaiteen sisään: palauttaa sisällä olevat pätkät. */
export function clipLine(points: Vec2[], r: Rect): Vec2[][] {
  const inside = (p: Vec2) => p.x >= r.minX && p.x <= r.maxX && p.y >= r.minY && p.y <= r.maxY;
  const runs: Vec2[][] = [];
  let run: Vec2[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    if (inside(p)) {
      if (run.length === 0 && i > 0) run.push(points[i - 1]!);
      run.push(p);
    } else if (run.length > 0) {
      run.push(p);
      runs.push(run);
      run = [];
    }
  }
  if (run.length > 1) runs.push(run);
  // Reunan yli menevät päät leikataan suorakaiteen reunalle.
  return runs.map((pts) => pts.map((p) => clampTo(p, r)));
}

const lerpAt = (a: Vec2, b: Vec2, t: number): Vec2 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

const clampTo = (p: Vec2, r: Rect): Vec2 => ({
  x: Math.max(r.minX, Math.min(r.maxX, p.x)),
  y: Math.max(r.minY, Math.min(r.maxY, p.y)),
});
