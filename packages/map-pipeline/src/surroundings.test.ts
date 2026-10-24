import { describe, expect, it } from 'vitest';
import { classify } from './osm';
import { clipLine, clipRing, pointInRing, toSurroundings, type Dem } from './surroundings';
import { toLakeMap } from './lakeMap';
import type { OsmLake, OsmSurroundings } from './osm';

const rect = { minX: 0, minY: 0, maxX: 10, maxY: 10 };

describe('ympäristön muunnos', () => {
  it('luokittelee OSM-tagit', () => {
    expect(classify({ landuse: 'forest' })).toBe('forest');
    expect(classify({ natural: 'wetland', wetland: 'reedbed' })).toBe('reeds');
    expect(classify({ landuse: 'farmland' })).toBe('field');
    expect(classify({ building: 'house' })).toBe('building');
    expect(classify({ highway: 'track' })).toBe('track');
    expect(classify({ highway: 'residential' })).toBe('road');
    expect(classify({ man_made: 'pier' })).toBe('pier');
    expect(classify({ amenity: 'bench' })).toBeNull();
  });

  it('leikkaa alueen ja viivan rajaukseen', () => {
    const clipped = clipRing(
      [
        { x: -5, y: 5 },
        { x: 5, y: -5 },
        { x: 15, y: 5 },
        { x: 5, y: 15 },
      ],
      rect,
    );
    expect(clipped.every((p) => p.x >= 0 && p.x <= 10 && p.y >= 0 && p.y <= 10)).toBe(true);
    expect(clipped.length).toBeGreaterThanOrEqual(8);
    const runs = clipLine(
      [
        { x: -5, y: 5 },
        { x: 5, y: 5 },
        { x: 20, y: 5 },
        { x: 20, y: 8 },
        { x: 5, y: 8 },
      ],
      rect,
    );
    expect(runs).toHaveLength(2);
    expect(runs[0]![0]).toEqual({ x: 0, y: 5 });
  });

  it('tuottaa alueet, viivat ja maaston järven pinnan suhteen', () => {
    // Pieni järvi päiväntasaajan sijaan Lunkinjärven kohdalla, jotta projektio on sama.
    const ring: [number, number][] = [
      [23.82, 60.93],
      [23.83, 60.93],
      [23.83, 60.935],
      [23.82, 60.935],
      [23.82, 60.93],
    ];
    const lake: OsmLake = {
      source: 'testi',
      lakeId: 'way/1',
      name: 'Testi',
      outer: [ring],
      islands: [],
    };
    const map = toLakeMap(lake);
    const osm: OsmSurroundings = {
      source: 'OSM',
      box: { west: 23.8, south: 60.92, east: 23.85, north: 60.94 },
      features: [
        {
          id: 'way/2',
          kind: 'forest',
          outer: [
            [
              [23.831, 60.93],
              [23.835, 60.93],
              [23.835, 60.934],
              [23.831, 60.934],
              [23.831, 60.93],
            ],
          ],
          inner: [],
        },
        {
          id: 'way/3',
          kind: 'road',
          line: [
            [23.81, 60.929],
            [23.84, 60.929],
          ],
        },
      ],
    };
    // DEM: järvi 130 m, maa nousee itään.
    const cols = 60;
    const rows = 40;
    const dem: Dem = {
      source: 'DEM',
      west: 23.8,
      north: 60.94,
      dLon: 1 / 1800,
      dLat: -1 / 3600,
      cols,
      rows,
      heights: Array.from({ length: cols * rows }, (_, k) => {
        const lon = 23.8 + (k % cols) / 1800;
        const inLake = lon >= 23.819 && lon <= 23.831;
        return inLake ? 1300 : 1300 + Math.round(Math.abs(lon - 23.825) * 4000);
      }),
    };
    const s = toSurroundings(map, osm, dem);
    expect(s.attribution).toEqual(['OSM', 'DEM']);
    expect(s.areas).toHaveLength(1);
    expect(s.areas[0]!.kind).toBe('forest');
    expect(s.lines[0]!.kind).toBe('road');
    expect(s.terrain!.waterLevel).toBeCloseTo(130, 1);
    // Järven keskellä korkeus ~0, idässä maa nousee.
    const t = s.terrain!;
    const h = (x: number, y: number) =>
      t.heights[Math.round((y - t.minY) / t.cell) * t.cols + Math.round((x - t.minX) / t.cell)]!;
    expect(Math.abs(h(0, 0))).toBeLessThan(0.5);
    expect(h(map.bounds.maxX + 400, 0)).toBeGreaterThan(2);
    expect(pointInRing({ x: 0, y: 0 }, map.shore)).toBe(true);
  });
});
