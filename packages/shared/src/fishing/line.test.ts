import { describe, expect, it } from 'vitest';
import { LINE_POINTS, createLine, lineLength, stepLine } from './line';

describe('Verlet-siima', () => {
  const tip = { x: 0, y: 0 };

  it('kireä siima on suora', () => {
    const line = createLine(tip, { x: 20, y: 0 });
    for (let i = 0; i < 120; i++) stepLine(line, tip, { x: 20, y: 0 }, 20, 1 / 60, { x: 0, y: 2 });
    for (const p of line.points) expect(Math.abs(p.y)).toBeLessThan(0.5);
  });

  it('löysä siima kaartuu virran mukana mutta ei veny', () => {
    const line = createLine(tip, { x: 20, y: 0 });
    for (let i = 0; i < 300; i++) stepLine(line, tip, { x: 20, y: 0 }, 26, 1 / 60, { x: 0, y: 2 });
    const maxY = Math.max(...line.points.map((p) => p.y));
    expect(maxY).toBeGreaterThan(1);
    expect(lineLength(line)).toBeLessThanOrEqual(26 * 1.02);
  });

  it('päät pysyvät kiinni', () => {
    const line = createLine(tip, { x: 10, y: 5 });
    stepLine(line, { x: 1, y: 1 }, { x: 12, y: 6 }, 15, 1 / 60);
    expect(line.points[0]).toEqual({ x: 1, y: 1 });
    expect(line.points[LINE_POINTS - 1]).toEqual({ x: 12, y: 6 });
  });
});
