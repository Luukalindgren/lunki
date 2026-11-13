import { describe, expect, it, vi } from 'vitest';
import type * as THREE from 'three';
import { ModernHost } from './modernHost';
import type { LookLayer } from './lookLayer';

const scene = (name: string) => ({ name }) as unknown as THREE.Scene;
const camera = {} as THREE.Camera;
const renderer = {} as THREE.WebGLRenderer;

function fakeLayer() {
  const log: string[] = [];
  const layer: LookLayer = {
    attach: (s) => {
      log.push(`attach ${s.name}`);
      return {
        update: () => log.push(`update ${s.name}`),
        dispose: () => log.push(`dispose ${s.name}`),
      };
    },
    release: () => log.push('release'),
  };
  return { layer, log };
}

describe('ModernHost (#650)', () => {
  it('lataa ilmeen vain kerran ja vasta pyydettäessä', async () => {
    const { layer } = fakeLayer();
    const load = vi.fn(() => Promise.resolve(layer));
    const host = new ModernHost(load);
    expect(load).not.toHaveBeenCalled();
    expect(host.loaded).toBe(false);
    await Promise.all([host.ensure(), host.ensure()]);
    await host.ensure();
    expect(load).toHaveBeenCalledTimes(1);
    expect(host.loaded).toBe(true);
  });

  it('epäonnistunut lataus hylätään ja yritetään seuraavalla kerralla uudelleen', async () => {
    const { layer } = fakeLayer();
    const load = vi
      .fn<() => Promise<LookLayer>>()
      .mockRejectedValueOnce(new Error('verkko poikki'))
      .mockResolvedValueOnce(layer);
    const host = new ModernHost(load);
    await expect(host.ensure()).rejects.toThrow();
    expect(host.loaded).toBe(false);
    await host.ensure();
    expect(host.loaded).toBe(true);
  });

  it('roikkuva lataus katkeaa aikarajaan', async () => {
    vi.useFakeTimers();
    try {
      const host = new ModernHost(() => new Promise<LookLayer>(() => undefined), 1000);
      const result = expect(host.ensure()).rejects.toThrow();
      await vi.advanceTimersByTimeAsync(1001);
      await result;
      expect(host.loaded).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('kerros on liitettynä piirrettävään kohtaukseen vain Modernissa', async () => {
    const { layer, log } = fakeLayer();
    const host = new ModernHost(() => Promise.resolve(layer));
    host.frame(true, scene('valikko'), camera, renderer, 'high');
    expect(log).toEqual([]);
    await host.ensure();
    host.frame(true, scene('valikko'), camera, renderer, 'high');
    const race = scene('kisa');
    host.frame(true, race, camera, renderer, 'high');
    host.frame(true, race, camera, renderer, 'high');
    host.frame(false, race, camera, renderer, 'high');
    expect(log).toEqual([
      'attach valikko',
      'update valikko',
      'dispose valikko',
      'attach kisa',
      'update kisa',
      'update kisa',
      'dispose kisa',
      'release',
    ]);
  });

  it('jaettu maisema vapautetaan vain, kun ilme vaihtuu pois, ei kohtauksen vaihtuessa', async () => {
    const { layer, log } = fakeLayer();
    const host = new ModernHost(() => Promise.resolve(layer));
    await host.ensure();
    host.frame(true, scene('valikko'), camera, renderer, 'high');
    host.frame(true, scene('kisa'), camera, renderer, 'high');
    expect(log).not.toContain('release');
    host.frame(false, scene('kisa'), camera, renderer, 'high');
    host.frame(false, scene('kisa'), camera, renderer, 'high');
    expect(log.filter((l) => l === 'release')).toHaveLength(1);
  });
});
