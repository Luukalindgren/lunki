import type { OsmLake } from './osm';

/** Järven ympäriltä otettava vyöhyke (m), kuten issue #19 rajaa: 300–500 m rantavyöhyke. */
export const MARGIN_M = 600;

export interface LonLatBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

/** Järven rajauslaatikko laajennettuna rantavyöhykkeellä (asteina). */
export function surroundingBox(lake: OsmLake, margin = MARGIN_M): LonLatBox {
  const pts = lake.outer.flat();
  const lons = pts.map((p) => p[0]);
  const lats = pts.map((p) => p[1]);
  const lat0 = (Math.min(...lats) + Math.max(...lats)) / 2;
  const dLat = margin / 111_320;
  const dLon = margin / (111_320 * Math.cos((lat0 * Math.PI) / 180));
  const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
  return {
    west: r6(Math.min(...lons) - dLon),
    south: r6(Math.min(...lats) - dLat),
    east: r6(Math.max(...lons) + dLon),
    north: r6(Math.max(...lats) + dLat),
  };
}
