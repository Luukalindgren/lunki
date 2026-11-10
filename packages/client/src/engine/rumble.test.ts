import { describe, expect, it } from 'vitest';
import { RUMBLES, Rumble, pullEffect } from './rumble';

function setup() {
  const sent: Record<string, number>[] = [];
  let resets = 0;
  let now = 0;
  const pad = {
    playEffect: (_: 'dual-rumble', p: Record<string, number>) => {
      sent.push(p);
      return Promise.resolve();
    },
    reset: () => {
      resets++;
      return Promise.resolve();
    },
  };
  const rumble = new Rumble(
    () => [pad],
    () => now,
  );
  rumble.active = true;
  return { rumble, sent, resets: () => resets, tick: (ms: number) => (now += ms) };
}

describe('ohjaimen värinä (#592)', () => {
  it('värähtää vain, kun pelaaja käyttää ohjainta ja värinä on päällä', () => {
    const { rumble, sent } = setup();
    rumble.active = false;
    rumble.pulse('thud');
    rumble.pull(0.5);
    rumble.active = true;
    rumble.enabled = false;
    rumble.pulse('thud');
    expect(sent).toHaveLength(0);
    rumble.enabled = true;
    rumble.pulse('thud');
    expect(sent[0]).toMatchObject({ duration: RUMBLES.thud.ms, strongMagnitude: 1 });
  });

  it('kalan veto uusitaan harvakseltaan eikä peitä tapahtuman värähdystä', () => {
    const { rumble, sent, tick } = setup();
    rumble.pull(0.5);
    rumble.pull(0.5);
    expect(sent).toHaveLength(1);
    tick(100);
    rumble.pull(0.5);
    expect(sent).toHaveLength(2);
    rumble.pulse('slam');
    tick(200);
    rumble.pull(0.5);
    expect(sent).toHaveLength(3);
    tick(RUMBLES.slam.ms);
    rumble.pull(0.5);
    expect(sent).toHaveLength(4);
  });

  it('veto loppuu, kun kala irtoaa', () => {
    const { rumble, resets, tick } = setup();
    rumble.pull(0);
    expect(resets()).toBe(0);
    rumble.pull(0.4);
    tick(16);
    rumble.pull(0);
    expect(resets()).toBe(1);
  });

  it('veto voimistuu kireyden mukana ja jyrisee vasta lähellä katkeamista', () => {
    expect(pullEffect(0.2).weak).toBeLessThan(pullEffect(0.8).weak);
    expect(pullEffect(0.5).strong).toBeLessThan(0.2);
    expect(pullEffect(1).strong).toBe(1);
    expect(pullEffect(3).weak).toBeLessThanOrEqual(1);
  });
});
