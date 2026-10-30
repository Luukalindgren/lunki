import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createFishing, type FishingContext } from '@lunki/shared';
import { FishingView } from './fishingView';

const fishingContext = (): FishingContext => ({
  tubePos: { x: 0, y: 0 },
  heading: Math.PI / 2,
  isWater: () => true,
  depthAt: () => 3,
});

describe('siiman väri', () => {
  it('valittu väri näkyy jo ennen ensimmäistä heittoa', () => {
    const view = new FishingView();
    view.lineColor = 0xd23a2a;
    expect(view.shownLineColor).toBe(0xd23a2a);
  });
});

describe('tärppi ylhäältä', () => {
  it('jokainen nykäys nostaa renkaan vieheen kohdalle', () => {
    const view = new FishingView();
    view.metersPerPixel = 0.25;
    const rings = () =>
      view.group.children
        .flatMap((c) => c.children)
        .filter(
          (c) => c instanceof THREE.Mesh && c.visible && c.geometry instanceof THREE.RingGeometry,
        ).length;
    const s = {
      ...createFishing(),
      stage: 'water' as const,
      lure: { x: 0, y: 12 },
      struckId: 3,
      strikeAge: 0,
    };
    const ctx = fishingContext();
    view.strikeSwirl(s.lure);
    const seen: number[] = [];
    for (let i = 0; i < 60; i++) {
      s.strikeAge = i / 60;
      view.update(s, ctx, { x: 0, y: 10 }, 1 / 60);
      seen.push(rings());
    }
    expect(seen[0]).toBe(1);
    expect(Math.max(...seen)).toBeGreaterThanOrEqual(2);
  });
});
