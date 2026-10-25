import { describe, expect, it } from 'vitest';
import { LUNKINJARVI } from '../map/lunkinjarvi';
import { pointInRing } from '../map/surroundings';
import { fetchDistance, waveHeight, wavePeriod, waveLength } from './waves';

const square = [
  { x: 0, y: 0 },
  { x: 1000, y: 0 },
  { x: 1000, y: 200 },
  { x: 0, y: 200 },
];

describe('aallot', () => {
  it('pyyhkäisymatka mitataan vastatuuleen rantaan asti', () => {
    // Tuuli puhaltaa itään: matka länsirantaan.
    expect(fetchDistance([square], { x: 700, y: 100 }, 0)).toBeCloseTo(700);
    // Pohjoiseen: matka etelärantaan.
    expect(fetchDistance([square], { x: 700, y: 50 }, Math.PI / 2)).toBeCloseTo(50);
  });

  it('aallonkorkeus kasvaa tuulen ja matkan mukana', () => {
    expect(waveHeight(10, 1000)).toBeCloseTo(0.16, 2);
    expect(waveHeight(16, 2000)).toBeGreaterThan(0.35);
    expect(waveHeight(16, 2000)).toBeLessThan(0.6);
    expect(waveHeight(0, 2000)).toBe(0);
    const t = wavePeriod(10, 1000);
    expect(t).toBeGreaterThan(1);
    expect(t).toBeLessThan(2.5);
    expect(waveLength(t)).toBeGreaterThan(1.5);
  });

  it('avovedellä aallot ovat isompia kuin suojaisessa lahdessa', () => {
    const rings = [LUNKINJARVI.shore, ...LUNKINJARVI.islands];
    const b = LUNKINJARVI.bounds;
    // Tuuli lännestä itään: itäpään avovesi vs. länsipään rannan tuntuma.
    const dir = 0;
    const samples: { p: { x: number; y: number }; h: number }[] = [];
    for (let x = b.minX; x <= b.maxX; x += 40)
      for (let y = b.minY; y <= b.maxY; y += 40) {
        const p = { x, y };
        if (!pointInRing(p, LUNKINJARVI.shore)) continue;
        samples.push({ p, h: waveHeight(12, fetchDistance(rings, p, dir)) });
      }
    samples.sort((a, c) => a.h - c.h);
    const calm = samples[Math.floor(samples.length * 0.1)]!.h;
    const rough = samples[Math.floor(samples.length * 0.9)]!.h;
    expect(rough).toBeGreaterThan(calm * 3);
    expect(rough).toBeGreaterThan(0.2);
  });
});
