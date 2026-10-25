import { signedArea, simplifyRing, toTm35fin, type LakeMap, type Vec2 } from '@lunki/shared';
import type { LonLatRing, OsmLake } from './osm';

/** Rantaviivan yksinkertaistustoleranssi metreinä. */
export const SIMPLIFY_TOLERANCE = 0.75;

/** Saaret, joiden ala on tätä pienempi (m²), jätetään pois. */
export const MIN_ISLAND_AREA = 4;

const round2 = (v: number) => Math.round(v * 100) / 100;

function ringToLocal(ring: LonLatRing, origin: { e: number; n: number }): Vec2[] {
  const pts = ring.map(([lon, lat]) => {
    const p = toTm35fin(lon, lat);
    return { x: p.e - origin.e, y: p.n - origin.n };
  });
  // OSM-renkaissa ensimmäinen piste toistuu lopussa.
  const last = pts[pts.length - 1]!;
  if (pts.length > 1 && last.x === pts[0]!.x && last.y === pts[0]!.y) pts.pop();
  return pts;
}

/**
 * Ilmakuvista tulkitut saaret (ETRS-TM35FIN), kun OSM:ssä niitä ei ole.
 * Ks. data/islands-aerial.json.
 */
export interface AerialIslands {
  source: string;
  islands: { ring: [number, number][] }[];
}

function orient(ring: Vec2[], ccw: boolean): Vec2[] {
  return signedArea(ring) > 0 === ccw ? ring : [...ring].reverse();
}

export function toLakeMap(osm: OsmLake, aerial?: AerialIslands | null): LakeMap {
  if (osm.outer.length === 0) throw new Error('Järvellä ei ole ulkoreunaa');
  // Origo: ulkoreunan rajauslaatikon keskipiste, pyöristettynä metriin.
  const tm = osm.outer.flat().map(([lon, lat]) => toTm35fin(lon, lat));
  const minE = Math.min(...tm.map((p) => p.e));
  const maxE = Math.max(...tm.map((p) => p.e));
  const minN = Math.min(...tm.map((p) => p.n));
  const maxN = Math.max(...tm.map((p) => p.n));
  const origin = { e: Math.round((minE + maxE) / 2), n: Math.round((minN + maxN) / 2) };

  // Peliin otetaan suurin ulkoreuna; muut (esim. erilliset lahdet) ovat harvinaisia.
  const outers = osm.outer.map((r) => ringToLocal(r, origin));
  const shoreRaw = outers.sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)))[0]!;
  const finish = (ring: Vec2[], ccw: boolean) =>
    orient(simplifyRing(ring, SIMPLIFY_TOLERANCE), ccw).map((p) => ({
      x: round2(p.x),
      y: round2(p.y),
    }));

  const shore = finish(shoreRaw, true);
  const islands = [
    ...osm.islands.map((s) => ringToLocal(s.ring, origin)),
    ...(aerial?.islands ?? []).map((s) =>
      s.ring.map(([e, n]) => ({ x: e - origin.e, y: n - origin.n })),
    ),
  ]
    .filter((r) => r.length >= 3 && Math.abs(signedArea(r)) >= MIN_ISLAND_AREA)
    .map((r) => finish(r, false));

  const xs = shore.map((p) => p.x);
  const ys = shore.map((p) => p.y);
  return {
    name: osm.name,
    attribution: osm.source,
    origin,
    shore,
    islands,
    bounds: {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys),
    },
  };
}
