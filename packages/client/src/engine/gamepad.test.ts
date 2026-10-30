import { describe, expect, it } from 'vitest';
import { PadMenuRepeat, deadZone, padKind, readPad, readPads } from './gamepad';

/** Vakioasettelun ohjain: pohjassa olevat napit numeroina ja akselit. */
function pad(pressed: number[] = [], axes = [0, 0, 0, 0], id = 'Xbox 360 Controller (XInput)') {
  return {
    id,
    axes,
    buttons: Array.from({ length: 17 }, (_, i) => ({
      pressed: pressed.includes(i),
      value: pressed.includes(i) ? 1 : 0,
      touched: false,
    })),
  };
}

describe('peliohjain', () => {
  it('tunnistaa PlayStation-ohjaimen, muut ovat Xbox-asettelua', () => {
    expect(padKind('054c-0ce6-DualSense Wireless Controller')).toBe('playstation');
    expect(padKind('Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)')).toBe(
      'playstation',
    );
    expect(padKind('Xbox Wireless Controller (STANDARD GAMEPAD)')).toBe('xbox');
  });

  it('napit ja vasemman tatin suunnat koodeiksi', () => {
    const f = readPad(pad([0, 9], [-0.9, 0.1, 0, 0]));
    expect([...f.codes].sort()).toEqual(['Pad0', 'Pad9', 'PadLsLeft']);
    expect(f.active).toBe(true);
    // Liipaisin, joka ilmoittaa vain painuman.
    const trigger = pad();
    trigger.buttons[7] = { pressed: false, value: 0.6, touched: false };
    expect(readPad(trigger).codes.has('Pad7')).toBe(true);
  });

  it('tatin pieni liike ei ole mitään', () => {
    expect(deadZone(0.1, -0.1)).toEqual({ x: 0, y: 0 });
    const full = deadZone(1, 0);
    expect(full.x).toBeCloseTo(1);
    const f = readPad(pad([], [0.2, 0.2, 0.1, 0.1]));
    expect(f.codes.size).toBe(0);
    expect(f.active).toBe(false);
  });

  it('kaksi ohjainta yhdessä, puuttuvat ohitetaan', () => {
    const f = readPads([null, pad([1]), pad([3], [0, 0, 0, -1], 'DualShock 4')]);
    expect([...f!.codes].sort()).toEqual(['Pad1', 'Pad3']);
    expect(f!.aim.y).toBeCloseTo(-1);
    expect(readPads([])).toBeNull();
  });

  it('valikossa pohjassa pidetty suunta toistuu, valinta ei', () => {
    const r = new PadMenuRepeat();
    const down = new Set(['Pad13', 'Pad0']);
    expect(r.step(down, 0).sort()).toEqual(['down', 'select']);
    expect(r.step(down, 0.2)).toEqual([]);
    expect(r.step(down, 0.41)).toEqual(['down']);
    expect(r.step(down, 0.45)).toEqual([]);
    expect(r.step(down, 0.54)).toEqual(['down']);
    expect(r.step(new Set(), 0.6)).toEqual([]);
    expect(r.step(new Set(['PadLsUp']), 0.7)).toEqual(['up']);
  });

  it('valikon auetessa pohjassa ollut nappi ei valitse ennen irrotusta', () => {
    const r = new PadMenuRepeat();
    const held = new Set(['Pad0']);
    r.hold(held);
    expect(r.step(held, 0)).toEqual([]);
    expect(r.step(held, 5)).toEqual([]);
    expect(r.step(new Set(), 6)).toEqual([]);
    expect(r.step(held, 7)).toEqual(['select']);
  });
});
