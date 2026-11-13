import { describe, expect, it } from 'vitest';
import { outlinePixels, pixelBytes, smoothPixels } from './smoothPixels';

const image = (rows: string[]) => ({
  width: rows[0]!.length,
  height: rows.length,
  data: rows.flatMap((r) => [...r].map((c) => (c === '.' ? -1 : c === '#' ? 0x202020 : 0xf0f0f0))),
});
const count = (data: ArrayLike<number>, c: number) =>
  Array.from(data).filter((v) => v === c).length;

describe('smoothPixels', () => {
  it('kuva on neljä kertaa tarkempi eikä saa uusia värejä', () => {
    const px = image(['..#..', '.#o#.', '#ooo#', '.#o#.', '..#..']);
    const out = smoothPixels(px);
    expect(out.width).toBe(20);
    expect(out.height).toBe(20);
    expect(new Set(Array.from(out.data))).toEqual(new Set([-1, 0x202020, 0xf0f0f0]));
  });

  it('tasainen pinta pysyy tasaisena ja suora reuna suorana', () => {
    const out = smoothPixels(image(['##oo', '##oo', '##oo']));
    for (let y = 0; y < out.height; y++)
      for (let x = 0; x < out.width; x++)
        expect(out.data[y * out.width + x]).toBe(x < 8 ? 0x202020 : 0xf0f0f0);
  });

  it('yksittäinen pikseli (silmä) ja ohut viiva säilyvät', () => {
    const dot = smoothPixels(image(['ooo', 'o#o', 'ooo']));
    expect(count(dot.data, 0x202020)).toBeGreaterThan(8);
    const line = smoothPixels(image(['#....', '.#...', '..#..', '...#.', '....#']));
    // Vinoviiva on yhtenäinen: jokaisella rivillä on viivan väriä.
    for (let y = 0; y < line.height; y++)
      expect(
        count(Array.from(line.data).slice(y * line.width, (y + 1) * line.width), 0x202020),
      ).toBeGreaterThan(0);
  });

  it('porras pyöristyy: kulman pinta-ala pienenee', () => {
    const out = smoothPixels(image(['##..', '##..', '....', '....']));
    expect(count(out.data, 0x202020)).toBeLessThan(64);
    expect(count(out.data, 0x202020)).toBeGreaterThan(52);
  });

  it('läpinäkyvä reuna saa naapurin värin ilman peittoa', () => {
    const bytes = pixelBytes(image(['#.']));
    expect(Array.from(bytes)).toEqual([0x20, 0x20, 0x20, 255, 0x20, 0x20, 0x20, 0]);
  });
});

describe('outlinePixels', () => {
  const INK = 0x101010;
  const dot = (size: number) => {
    const data = new Array<number>(size * size).fill(-1);
    data[((size - 1) / 2) * size + (size - 1) / 2] = 0xf0f0f0;
    return data;
  };

  it('säde 1 ympäröi kuvan neljästä suunnasta eikä peitä kuvaa', () => {
    const data = dot(5);
    outlinePixels(data, 5, 5, INK);
    expect(count(data, INK)).toBe(4);
    expect(data[2 * 5 + 2]).toBe(0xf0f0f0);
    for (const [i, j] of [
      [2, 1],
      [1, 2],
      [3, 2],
      [2, 3],
    ])
      expect(data[j! * 5 + i!]).toBe(INK);
    // Kulmat jäävät auki, kuten pikselikuvissa.
    expect(data[1 * 5 + 1]).toBe(-1);
  });

  it('isompi säde tekee tarkkaan kuvaan pyöreän, paksumman viivan', () => {
    const data = dot(9);
    outlinePixels(data, 9, 9, INK, 2);
    // Kiekko säteellä 2 ilman keskipistettä: 13 - 1 pikseliä.
    expect(count(data, INK)).toBe(12);
    expect(data[4 * 9 + 6]).toBe(INK);
    expect(data[3 * 9 + 5]).toBe(INK);
    expect(data[2 * 9 + 6]).toBe(-1);
  });

  it('ääriviiva ei kasva itsestään: uusi viiva ei saa omaa viivaansa', () => {
    const data = dot(9);
    outlinePixels(data, 9, 9, INK);
    expect(count(data, INK)).toBe(4);
  });
});
