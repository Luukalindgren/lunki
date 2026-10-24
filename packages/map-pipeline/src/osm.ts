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
    let guard = open.length + 1;
    while (key(ring[0]!) !== key(ring[ring.length - 1]!) && guard-- > 0) {
      const end = key(ring[ring.length - 1]!);
      const i = open.findIndex((p) => key(p[0]!) === end || key(p[p.length - 1]!) === end);
      if (i < 0) break;
      const next = open.splice(i, 1)[0]!;
      const oriented = key(next[0]!) === end ? next : [...next].reverse();
      ring = [...ring, ...oriented.slice(1)];
      guard = open.length + 1;
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
