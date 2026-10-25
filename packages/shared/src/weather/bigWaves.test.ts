import { describe, expect, it } from 'vitest';
import { LUNKINJARVI } from '../map/lunkinjarvi';
import { WaterBody } from '../map/waterBody';
import { BIG_WAVE, bigWaveHeight, capsizes, planBigWaves } from './bigWaves';
import { planWeather, weatherAt } from './weather';

const rings = [LUNKINJARVI.shore, ...LUNKINJARVI.islands];
const water = new WaterBody(LUNKINJARVI);

describe('isot aallot', () => {
  it('tulevat vain tuulella, aina samalla tavalla', () => {
    const plan = planWeather(9, 'chaos', 900);
    const waves = planBigWaves(plan, 9, 900);
    expect(waves.length).toBeGreaterThan(5);
    expect(planBigWaves(plan, 9, 900)).toEqual(waves);
    for (const w of waves) {
      const seg = [...plan.segments].reverse().find((s) => s.start <= w.t)!;
      expect(seg.windSpeed).toBeGreaterThanOrEqual(BIG_WAVE.minWind);
      expect(weatherAt(plan, w.t).sky).not.toBe('calm');
    }
    expect(planBigWaves(planWeather(9, 'calm', 900), 9, 900)).toEqual([]);
  });

  it('kaatavat selällä myrskyssä, mutta eivät suojaisessa poukamassa', () => {
    const heights: number[] = [];
    const { bounds } = LUNKINJARVI;
    for (let x = bounds.minX; x < bounds.maxX; x += 40)
      for (let y = bounds.minY; y < bounds.maxY; y += 40)
        if (water.isWater({ x, y })) heights.push(bigWaveHeight(rings, { x, y }, 16, 0));
    expect(Math.max(...heights)).toBeGreaterThan(BIG_WAVE.capsizeHeight);
    expect(Math.min(...heights)).toBeLessThan(BIG_WAVE.capsizeHeight / 3);
  });

  it('aaltoa kohti kääntynyt pysyy pystyssä', () => {
    // Tuuli puhaltaa itään (0), joten aallot tulevat lännestä (π).
    const big = BIG_WAVE.capsizeHeight + 0.1;
    expect(capsizes(Math.PI, 0, big)).toBe(false);
    expect(capsizes(Math.PI - 0.5, 0, big)).toBe(false);
    expect(capsizes(Math.PI / 2, 0, big)).toBe(true);
    expect(capsizes(0, 0, big)).toBe(true);
    expect(capsizes(Math.PI / 2, 0, BIG_WAVE.capsizeHeight - 0.05)).toBe(false);
  });
});
