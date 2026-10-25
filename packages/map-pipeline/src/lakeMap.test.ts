import { describe, expect, it } from 'vitest';
import { signedArea, type Vec2 } from '@lunki/shared';
import { toLakeMap } from './lakeMap';
import { assembleRings, type LonLatRing } from './osm';

// Noin 1 km × 0,5 km suorakaide Tammelan seudulla ja pieni saari keskellä.
const outer: LonLatRing = [
  [23.75, 60.8],
  [23.7684, 60.8],
  [23.7684, 60.8045],
  [23.75, 60.8045],
  [23.75, 60.8],
];
const island: LonLatRing = [
  [23.759, 60.802],
  [23.7594, 60.802],
  [23.7594, 60.8022],
  [23.759, 60.8022],
  [23.759, 60.802],
];

describe('toLakeMap', () => {
  const map = toLakeMap({
    source: 'testi',
    lakeId: 'way/1',
    name: 'Testijärvi',
    outer: [outer],
    islands: [{ id: 'way/2', ring: island }],
  });

  it('keskittää origon ja käyttää metrejä', () => {
    // Reunojen pituudet; rajauslaatikko on hieman leveämpi, koska TM35FIN-
    // ruudukon pohjoinen poikkeaa Tammelassa n. 3° todellisesta pohjoisesta.
    const [a, b, c] = map.shore as [Vec2, Vec2, Vec2];
    const edges = [Math.hypot(b.x - a.x, b.y - a.y), Math.hypot(c.x - b.x, c.y - b.y)].sort(
      (x, y) => x - y,
    );
    expect(edges[0]).toBeGreaterThan(495);
    expect(edges[0]).toBeLessThan(505);
    expect(edges[1]).toBeGreaterThan(995);
    expect(edges[1]).toBeLessThan(1005);
    expect(Math.abs(map.bounds.minX + map.bounds.maxX)).toBeLessThan(2);
  });

  it('suuntaa rannan vastapäivään ja saaret myötäpäivään', () => {
    expect(signedArea(map.shore)).toBeGreaterThan(0);
    expect(map.islands).toHaveLength(1);
    expect(signedArea(map.islands[0]!)).toBeLessThan(0);
  });

  it('poistaa toistetun päätepisteen', () => {
    expect(map.shore).toHaveLength(4);
  });

  it('lisää ilmakuvista tulkitut saaret origon suhteen myötäpäivään', () => {
    const { e, n } = map.origin;
    const withAerial = toLakeMap(
      { source: 'testi', lakeId: 'way/1', name: 'Testijärvi', outer: [outer], islands: [] },
      {
        source: 'ilmakuva',
        islands: [
          {
            ring: [
              [e + 10, n + 10],
              [e + 20, n + 10],
              [e + 20, n + 20],
              [e + 10, n + 20],
            ],
          },
        ],
      },
    );
    expect(withAerial.islands).toHaveLength(1);
    const ring = withAerial.islands[0]!;
    expect(signedArea(ring)).toBeLessThan(0);
    expect(Math.min(...ring.map((p) => p.x))).toBe(10);
    expect(Math.max(...ring.map((p) => p.y))).toBe(20);
  });
});

describe('assembleRings', () => {
  it('yhdistää kaksi puolikasta renkaaksi', () => {
    const rings = assembleRings([
      [
        [0, 0],
        [1, 0],
        [1, 1],
      ],
      [
        [0, 0],
        [0, 1],
        [1, 1],
      ],
    ]);
    expect(rings).toHaveLength(1);
    expect(rings[0]).toHaveLength(5);
  });
});
