/** Overpass API:n `out geom` -vastauksen osat, joita tarvitaan. */
export interface OverpassLatLon {
  lat: number;
  lon: number;
}

export interface OverpassMember {
  type: 'node' | 'way' | 'relation';
  ref: number;
  role: string;
  geometry?: OverpassLatLon[];
}

export interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  tags?: Record<string, string>;
  geometry?: OverpassLatLon[];
  members?: OverpassMember[];
}

export interface OverpassResponse {
  elements: OverpassElement[];
}

/** Rengas pituus-leveysasteina: [lon, lat][] (GeoJSON-järjestys). */
export type LonLatRing = [number, number][];

export interface OsmLake {
  source: string;
  lakeId: string;
  name: string;
  /** Järven ulkoreunat (yleensä yksi). */
  outer: LonLatRing[];
  /** Saaret: multipolygonin sisäreunat ja erikseen kartoitetut saaret. */
  islands: { id: string; name?: string; ring: LonLatRing }[];
}

const toRing = (geom: OverpassLatLon[]): LonLatRing =>
  geom.map((p) => [round6(p.lon), round6(p.lat)]);

const round6 = (v: number) => Math.round(v * 1e6) / 1e6;

const key = (p: [number, number]) => `${p[0]},${p[1]}`;

/**
 * Yhdistää multipolygonin jäsenviivat suljetuiksi renkaiksi. OSM:ssä yksi
 * rengas voi koostua monesta wayst, joiden päät osuvat yhteen.
 */
export function assembleRings(parts: LonLatRing[]): LonLatRing[] {
  const open = parts.filter((p) => p.length >= 2).map((p) => [...p]);
  const rings: LonLatRing[] = [];
  while (open.length > 0) {
    let ring = open.shift()!;
    // Jokainen kierros kuluttaa yhden osan, joten silmukka päättyy aina.
    while (key(ring[0]!) !== key(ring[ring.length - 1]!)) {
      const end = key(ring[ring.length - 1]!);
      const i = open.findIndex((p) => key(p[0]!) === end || key(p[p.length - 1]!) === end);
      if (i < 0) break;
      const next = open.splice(i, 1)[0]!;
      const oriented = key(next[0]!) === end ? next : [...next].reverse();
      ring = [...ring, ...oriented.slice(1)];
    }
    if (key(ring[0]!) === key(ring[ring.length - 1]!) && ring.length >= 4) rings.push(ring);
  }
  return rings;
}

export function extractLake(res: OverpassResponse): OsmLake {
  const lakes = res.elements.filter((e) => e.tags?.natural === 'water');
  if (lakes.length === 0) throw new Error('Lunkinjärveä ei löytynyt vastauksesta');
  // Isoin = eniten pisteitä, jos samannimisiä on useampi.
  const size = (e: OverpassElement) =>
    e.geometry?.length ?? e.members?.reduce((n, m) => n + (m.geometry?.length ?? 0), 0) ?? 0;
  const lake = lakes.sort((a, b) => size(b) - size(a))[0]!;

  let outer: LonLatRing[] = [];
  const islands: OsmLake['islands'] = [];
  if (lake.type === 'way' && lake.geometry) {
    outer = [toRing(lake.geometry)];
  } else if (lake.members) {
    const ringsFor = (role: string) =>
      assembleRings(
        lake.members!.filter((m) => m.role === role && m.geometry).map((m) => toRing(m.geometry!)),
      );
    outer = ringsFor('outer');
    ringsFor('inner').forEach((ring, i) => islands.push({ id: `inner/${i}`, ring }));
  }

  for (const e of res.elements) {
    if (e === lake || !e.tags?.place) continue;
    const rings =
      e.type === 'way' && e.geometry
        ? [toRing(e.geometry)]
        : assembleRings(
            (e.members ?? [])
              .filter((m) => m.role === 'outer' && m.geometry)
              .map((m) => toRing(m.geometry!)),
          );
    for (const ring of rings) {
      // Ohitetaan saari, joka on jo multipolygonin sisäreunana.
      const dup = islands.some(
        (s) => s.ring.length === ring.length && key(s.ring[0]!) === key(ring[0]!),
      );
      if (!dup) {
        const name = e.tags.name;
        islands.push({ id: `${e.type}/${e.id}`, ...(name ? { name } : {}), ring });
      }
    }
  }

  return {
    source: '© OpenStreetMapin tekijät, ODbL 1.0',
    lakeId: `${lake.type}/${lake.id}`,
    name: lake.tags?.name ?? 'Lunkinjärvi',
    outer,
    islands,
  };
}

/** Ympäristön kohdetyypit pelissä. */
export type SurroundingKind =
  | 'forest'
  | 'field'
  | 'residential'
  | 'wetland'
  | 'reeds'
  | 'scrub'
  | 'beach'
  | 'bare'
  | 'water'
  | 'building'
  | 'road'
  | 'track'
  | 'path'
  | 'pier'
  | 'stream';

export interface OsmSurroundingFeature {
  id: string;
  kind: SurroundingKind;
  name?: string;
  /** Alueet: ulkoreunat ja reiät. Viivat: `line`. */
  outer?: LonLatRing[];
  inner?: LonLatRing[];
  line?: LonLatRing;
}

export interface OsmSurroundings {
  source: string;
  box: { west: number; south: number; east: number; north: number };
  features: OsmSurroundingFeature[];
}

const LINE_KINDS = new Set<SurroundingKind>(['road', 'track', 'path', 'stream']);

/** OSM-tagit → pelin kohdetyyppi (tai null, jos kohdetta ei käytetä). */
export function classify(tags: Record<string, string>): SurroundingKind | null {
  if (tags.building) return 'building';
  const hw = tags.highway;
  if (hw) {
    if (hw === 'track') return 'track';
    if (/^(path|footway|cycleway|bridleway|steps)$/.test(hw)) return 'path';
    if (
      /^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|living_street|road)(_link)?$/.test(
        hw,
      )
    )
      return 'road';
    return null;
  }
  if (/^(pier|breakwater|jetty)$/.test(tags.man_made ?? '')) return 'pier';
  if (tags.leisure === 'slipway') return 'pier';
  if (tags.waterway)
    return /^(stream|river|ditch|drain|canal)$/.test(tags.waterway) ? 'stream' : null;
  const lu = tags.landuse;
  const nat = tags.natural;
  if (lu === 'forest' || nat === 'wood') return 'forest';
  if (nat === 'wetland') return tags.wetland === 'reedbed' ? 'reeds' : 'wetland';
  if (
    /^(farmland|meadow|grass|orchard|allotments|plant_nursery|village_green)$/.test(lu ?? '') ||
    nat === 'grassland'
  )
    return 'field';
  if (
    /^(residential|farmyard|commercial|industrial|retail|cemetery|recreation_ground)$/.test(
      lu ?? '',
    )
  )
    return 'residential';
  if (nat === 'scrub' || nat === 'heath') return 'scrub';
  if (nat === 'beach' || nat === 'sand' || tags.leisure === 'swimming_area') return 'beach';
  if (nat === 'bare_rock' || lu === 'quarry') return 'bare';
  if (nat === 'water' || lu === 'reservoir' || lu === 'basin') return 'water';
  return null;
}

/**
 * Ympäristön kohteet Overpassin vastauksesta. Itse Lunkinjärvi jätetään pois,
 * ja kohteet, joilla ei ole pistettä rajauksen sisällä, karsitaan.
 */
export function extractSurroundings(
  res: OverpassResponse,
  box: OsmSurroundings['box'],
  lakeName = 'Lunkinjärvi',
): OsmSurroundings {
  const inside = (r: LonLatRing) =>
    r.some(
      ([lon, lat]) => lon >= box.west && lon <= box.east && lat >= box.south && lat <= box.north,
    );
  const features: OsmSurroundingFeature[] = [];
  for (const e of res.elements) {
    const tags = e.tags ?? {};
    const kind = classify(tags);
    if (!kind) continue;
    if (kind === 'water' && tags.name === lakeName) continue;
    const id = `${e.type}/${e.id}`;
    const name = tags.name;
    const base = { id, kind, ...(name ? { name } : {}) };
    if (e.type === 'way' && e.geometry) {
      const ring = toRing(e.geometry);
      if (!inside(ring)) continue;
      const closed = ring.length >= 4 && key(ring[0]!) === key(ring[ring.length - 1]!);
      if (LINE_KINDS.has(kind) || (kind === 'pier' && !closed))
        features.push({ ...base, line: ring });
      else if (closed) features.push({ ...base, outer: [ring], inner: [] });
    } else if (e.type === 'relation' && e.members) {
      const rings = (role: string) =>
        assembleRings(
          e.members!.filter((m) => m.role === role && m.geometry).map((m) => toRing(m.geometry!)),
        );
      const outer = rings('outer').filter(inside);
      if (outer.length > 0) features.push({ ...base, outer, inner: rings('inner') });
    }
  }
  return { source: '© OpenStreetMapin tekijät, ODbL 1.0', box, features };
}
