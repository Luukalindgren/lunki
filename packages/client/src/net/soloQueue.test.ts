import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SoloSubmit } from './session';
import { flushSoloCatches, pendingSoloCatches, queueSoloCatch, type SoloCatch } from './soloQueue';

const replies: SoloSubmit[] = [];
const sent: SoloCatch[] = [];
vi.mock('./session', () => ({
  submitSoloRecord: (c: SoloCatch) => {
    sent.push(c);
    return Promise.resolve(replies.shift() ?? 'offline');
  },
}));

const fish = (weight: number): SoloCatch => ({
  species: 'pike',
  weight,
  angler: 'Luuka',
  difficulty: 'normal',
  at: '2026-10-27T18:00:00.000Z',
});

describe('yksinpelin saaliit palvelimen ollessa kiinni', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    });
    replies.length = 0;
    sent.length = 0;
  });
  afterEach(() => vi.unstubAllGlobals());

  it('täydestä jonosta putoaa kevyin', () => {
    for (let i = 1; i <= 50; i++) queueSoloCatch(fish(i));
    queueSoloCatch(fish(0.5));
    queueSoloCatch(fish(60));
    expect(pendingSoloCatches()).toBe(50);
  });

  it('lähettää vanhimmasta alkaen ja pysähtyy, kun palvelin ei vastaa', async () => {
    queueSoloCatch(fish(1));
    queueSoloCatch(fish(2));
    queueSoloCatch(fish(3));
    queueSoloCatch(fish(4));
    // Listalle 2., ei listalle, hylätty, sitten palvelin kiinni.
    replies.push({ place: 2 }, { place: null }, 'rejected', 'offline');
    const placed = await flushSoloCatches();
    expect(sent.map((c) => c.weight)).toEqual([1, 2, 3, 4]);
    expect(placed).toEqual([{ entry: fish(1), place: 2 }]);
    // Kiinni olevalle palvelimelle jäänyt odottaa seuraavaa kertaa.
    expect(pendingSoloCatches()).toBe(1);
    replies.push({ place: 1 });
    expect(await flushSoloCatches()).toEqual([{ entry: fish(4), place: 1 }]);
    expect(pendingSoloCatches()).toBe(0);
  });
});
