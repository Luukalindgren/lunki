import { describe, expect, it } from 'vitest';
import { TOUCHPAD_COOLDOWN_MS, WheelZoom, isTouchpad } from './wheelZoom';

const mouse = (deltaY: number) => ({
  deltaY,
  deltaMode: 0,
  ctrlKey: false,
  wheelDeltaY: -1.2 * deltaY,
});
const pad = (deltaY: number) => ({
  deltaY,
  deltaMode: 0,
  ctrlKey: false,
  wheelDeltaY: -3 * deltaY,
});

/** Kosketuslevyn tapahtumat 60 Hz:n tahdissa, palauttaa askelten summan. */
function swipe(z: WheelZoom, deltas: number[], start = 0): number {
  return deltas.reduce((sum, d, i) => sum + z.feed(pad(d), start + i * 16), 0);
}

describe('isTouchpad', () => {
  it('tunnistaa hiiren rullan loven', () => {
    expect(isTouchpad(mouse(100))).toBe(false);
    expect(isTouchpad({ deltaY: 3, deltaMode: 1, ctrlKey: false, wheelDeltaY: -120 })).toBe(false);
    // macOS:n hiiri: pieni delta mutta wheelDeltaY 120:n monikerta.
    expect(isTouchpad({ deltaY: 4, deltaMode: 0, ctrlKey: false, wheelDeltaY: -120 })).toBe(false);
  });

  it('tunnistaa kosketuslevyn ja nipistyksen', () => {
    expect(isTouchpad(pad(6))).toBe(true);
    expect(isTouchpad(pad(120))).toBe(true);
    expect(isTouchpad({ deltaY: -2.5, deltaMode: 0, ctrlKey: true })).toBe(true);
    expect(isTouchpad({ deltaY: 7, deltaMode: 0, ctrlKey: false })).toBe(true);
  });
});

describe('WheelZoom', () => {
  it('hiiren rullan lovi on yksi askel', () => {
    const z = new WheelZoom();
    expect(z.feed(mouse(100), 0)).toBe(1);
    expect(z.feed(mouse(-100), 10)).toBe(-1);
    expect(z.feed({ deltaY: 3, deltaMode: 1, ctrlKey: false }, 20)).toBe(1);
  });

  it('pieni kosketuslevyn liike ei zoomaa', () => {
    const z = new WheelZoom();
    expect(swipe(z, Array(10).fill(8))).toBe(0);
  });

  it('pyyhkäisy hitausvierityksineen on enintään pari askelta', () => {
    const z = new WheelZoom();
    // Noin 900 px yhteensä: kiihtyvä veto ja hiipuva hitausvieritys.
    const deltas = [
      5, 15, 30, 50, 60, 60, 55, 45, 40, 35, 30, 25, 20, 16, 12, 10, 8, 6, 4, 3, 2, 1,
    ];
    const steps = swipe(z, deltas);
    expect(steps).toBeGreaterThanOrEqual(1);
    expect(steps).toBeLessThanOrEqual(2);
  });

  it('tauko nollaa kesken jääneen kertymän', () => {
    const z = new WheelZoom();
    expect(swipe(z, [40, 40, 40])).toBe(0);
    expect(swipe(z, [40, 40], 1000)).toBe(0);
  });

  it('nipistys zoomaa suuntansa mukaan', () => {
    const z = new WheelZoom();
    let steps = 0;
    for (let i = 0; i < 20; i++)
      steps += z.feed({ deltaY: -2.5, deltaMode: 0, ctrlKey: true }, i * 16);
    expect(steps).toBe(-1);
  });

  it('jatkuva vieritys askeltaa tasaisesti viiveen jälkeen', () => {
    const z = new WheelZoom();
    const second = Array(Math.round(1000 / 16)).fill(30);
    const steps = swipe(z, second);
    expect(steps).toBeLessThanOrEqual(Math.ceil(1000 / TOUCHPAD_COOLDOWN_MS));
    expect(steps).toBeGreaterThanOrEqual(2);
  });
});
