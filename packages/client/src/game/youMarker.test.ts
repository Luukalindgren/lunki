import { describe, expect, it } from 'vitest';
import { YOU_MARKER_MIN_MPP, YouMarker } from './youMarker';

describe('YouMarker', () => {
  it('näkyy vain kauas loitonnettaessa ylhäältä katsottuna', () => {
    const m = new YouMarker();
    m.update({ x: 10, y: 20 }, 0.125, true);
    expect(m.group.visible).toBe(false);
    m.update({ x: 10, y: 20 }, YOU_MARKER_MIN_MPP, true);
    expect(m.group.visible).toBe(true);
    expect(m.group.position.x).toBe(10);
    expect(m.group.position.z).toBe(-20);
    m.update({ x: 10, y: 20 }, 4, false);
    expect(m.group.visible).toBe(false);
  });

  it('pysyy samankokoisena pikseleinä', () => {
    const m = new YouMarker();
    m.update({ x: 0, y: 0 }, 2, true);
    expect(m.group.scale.x).toBe(2);
    m.update({ x: 0, y: 0 }, 8, true);
    expect(m.group.scale.x).toBe(8);
  });
});
