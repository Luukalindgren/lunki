import { describe, expect, it } from 'vitest';
import { SplashRings } from './splashRings';

describe('roiskerenkaat', () => {
  it('kertoo renkaan iän 0–1 ja nimeää osansa modernia ilmettä varten (#650)', () => {
    const rings = new SplashRings(2);
    expect(rings.group.name).toBe('splash-rings');
    const [first, second] = rings.group.children;
    expect(first!.userData.shape).toBe('ripple');
    rings.start({ x: 3, y: 4 }, 1, 2);
    rings.update(0.5);
    expect(first!.visible).toBe(true);
    expect(first!.userData.life).toBeCloseTo(0.25);
    expect(second!.visible).toBe(false);
    rings.update(1);
    expect(first!.userData.life).toBeCloseTo(0.75);
    rings.update(1);
    expect(first!.visible).toBe(false);
  });
});
