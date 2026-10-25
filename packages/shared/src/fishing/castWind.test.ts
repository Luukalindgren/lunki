import { describe, expect, it } from 'vitest';
import { predictLanding } from './cast';

const from = { x: 0, y: 0 };

describe('heitto tuulessa', () => {
  it('myötätuuli pidentää ja vastatuuli lyhentää heittoa', () => {
    const calm = predictLanding(from, 0, 1).x;
    const tail = predictLanding(from, 0, 1, 1, 1 / 60, { x: 10, y: 0 }).x;
    const head = predictLanding(from, 0, 1, 1, 1 / 60, { x: -10, y: 0 }).x;
    expect(tail).toBeGreaterThan(calm * 1.05);
    expect(head).toBeLessThan(calm * 0.95);
  });

  it('sivutuuli kaartaa heittoa tuulen alle', () => {
    const p = predictLanding(from, 0, 1, 1, 1 / 60, { x: 0, y: 10 });
    expect(p.y).toBeGreaterThan(3);
    expect(p.y).toBeLessThan(20);
  });
});
