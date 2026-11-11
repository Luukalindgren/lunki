import { describe, expect, it } from 'vitest';
import { StickFlick } from './stickFlick';

const DT = 1 / 60;
const hold = (f: StickFlick, x: number, y: number, steps: number, allowed = true) => {
  for (let i = 0; i < steps; i++) expect(f.step({ x, y }, DT, allowed)).toBe(false);
};
const center = (f: StickFlick, allowed = true) => f.step({ x: 0, y: 0 }, DT, allowed);

describe('vavan nykäisy oikealla tatilla (#595)', () => {
  it('nopea nykäisy taakse ja takaisin nykäisee kerran', () => {
    const f = new StickFlick();
    hold(f, 0.05, 1, 6);
    expect(center(f)).toBe(true);
    expect(center(f)).toBe(false);
  });

  it('hidas veto, sivuliike, ylös työntö tai kierto ei nykäise', () => {
    const slow = new StickFlick();
    hold(slow, 0, 1, 40);
    expect(center(slow)).toBe(false);
    const side = new StickFlick();
    hold(side, 1, 0.2, 6);
    expect(center(side)).toBe(false);
    const up = new StickFlick();
    hold(up, 0, -1, 6);
    expect(center(up)).toBe(false);
    const spun = new StickFlick();
    for (let i = 0; i < 12; i++) {
      const a = Math.PI / 2 + i * 0.3;
      spun.step({ x: Math.cos(a), y: Math.sin(a) }, DT, true);
    }
    expect(center(spun)).toBe(false);
  });

  it('ei nykäise, kun tatti ei ole vapaa edes osan liikkeestä', () => {
    const f = new StickFlick();
    hold(f, 0, 1, 3, false);
    hold(f, 0, 1, 3);
    expect(center(f)).toBe(false);
    hold(f, 0, 1, 6);
    expect(center(f, false)).toBe(false);
  });
});
