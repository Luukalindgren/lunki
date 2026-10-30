import { describe, expect, it } from 'vitest';
import type { Controls } from './controls';
import { HeldMenu } from './heldMenu';

/** Valikon, ohjauksen ja kellon korvikkeet: M pohjassa tai ei. */
function setup(minHold = 0) {
  const menu = {
    open: true,
    selected: 0,
    picked: 0,
    pickSelected: () => menu.picked++,
    point: (dx: number, dy: number) => (menu.selected = dx > 0 ? 1 : dy > 0 ? 2 : 0),
  };
  const keys = { down: true };
  const clock = { ms: 0 };
  const input = { padAim: { x: 0, y: 0 } };
  const c = { isDown: () => keys.down, input } as unknown as Controls;
  const hold = new HeldMenu(
    () => menu,
    'method',
    minHold,
    () => clock.ms,
  );
  return { menu, keys, clock, c, hold, input };
}

describe('pikavalikon pito (#387)', () => {
  it('irrotus valitsee osoitetun kohdan', () => {
    const { menu, keys, clock, c, hold } = setup(0.35);
    hold.opened(c);
    clock.ms = 500;
    hold.step(c);
    keys.down = false;
    hold.step(c);
    expect(menu.picked).toBe(1);
    hold.step(c);
    expect(menu.picked).toBe(1);
  });

  it('lyhyt napautus jättää valikon auki', () => {
    const { menu, keys, clock, c, hold } = setup(0.35);
    hold.opened(c);
    clock.ms = 100;
    keys.down = false;
    hold.step(c);
    expect(menu.picked).toBe(0);
  });

  it('nopea pito toisen kohdan kohdalle valitsee', () => {
    const { menu, keys, clock, c, hold } = setup(0.35);
    hold.opened(c);
    clock.ms = 100;
    menu.selected = 1;
    keys.down = false;
    hold.step(c);
    expect(menu.picked).toBe(1);
  });

  it('ilman pitoa avattu tai muuten suljettu valikko ei valitse', () => {
    const { menu, keys, c, hold } = setup();
    keys.down = false;
    hold.opened(c);
    hold.step(c);
    expect(menu.picked).toBe(0);
    keys.down = true;
    hold.opened(c);
    menu.open = false;
    hold.step(c);
    keys.down = false;
    menu.open = true;
    hold.step(c);
    expect(menu.picked).toBe(0);
  });

  it('peliohjaimen oikea tatti osoittaa, ja irrotus valitsee', () => {
    const { menu, keys, clock, c, hold, input } = setup(0.35);
    hold.opened(c);
    input.padAim = { x: 0.2, y: 0 };
    hold.step(c);
    // Tatin pieni liike ei osoita.
    expect(menu.selected).toBe(0);
    input.padAim = { x: 0.9, y: 0.1 };
    hold.step(c);
    expect(menu.selected).toBe(1);
    clock.ms = 100;
    keys.down = false;
    hold.step(c);
    expect(menu.picked).toBe(1);
  });
});
