import { describe, expect, it } from 'vitest';
import type { FlyLinePose } from '../game/flyLine';
import { panelPoint, panelScale } from './flyCastPanel';

const pose: FlyLinePose = {
  tipS: 1.6,
  tipH: 2.4,
  length: 12,
  phase: 'loop',
  dir: -1,
  unroll: 1,
  late: 0,
  wide: false,
};
const tip = { x: 55, y: 20 };

describe('perhoheiton sivukuva (#236)', () => {
  it('pinta on vesirivillä, kärki kärjen kohdalla ja korkeampi ylempänä', () => {
    const scale = panelScale(pose.length);
    expect(panelPoint({ s: 1.6, h: 2.4, lat: 0 }, pose, tip, scale)).toEqual(tip);
    expect(panelPoint({ s: 1.6, h: 0, lat: 0 }, pose, tip, scale).y).toBe(36);
    expect(panelPoint({ s: 1.6, h: 3.4, lat: 0 }, pose, tip, scale).y).toBeLessThan(tip.y);
  });

  it('koko siima mahtuu näytölle kummallekin puolelle', () => {
    for (const length of [3, 12, 22]) {
      const scale = panelScale(length);
      // Kärki on enintään vavan mitan (13 px) päässä kalastajasta (48).
      expect(48 - 13 - length * scale).toBeGreaterThanOrEqual(0);
      expect(48 + 13 + length * scale).toBeLessThan(96);
    }
  });
});
