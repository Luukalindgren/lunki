import { describe, expect, it } from 'vitest';
import { DEFAULT_TACKLE } from './gear';
import { simulateNaiveAngler } from './naiveAngler';

describe('kalastusta tuntematon pelaaja', () => {
  // 16 × 10 min (dt 1/30) mitattuna: helppo 1,0, normaali 0,4 ja realistinen 0,2 kalaa/min.
  // Naiivi pelaaja ei nykäise, joten isot kalat jäävät häneltä (#402): normaali 0,43 → 0,40.
  it('saa helpolla kalaa melkein joka heitolla eikä menetä viehettä pohjaan', () => {
    const easy = simulateNaiveAngler('easy', 1000, 10);
    expect(easy.caught).toBeGreaterThanOrEqual(7);
    expect(easy.caught).toBeGreaterThanOrEqual(easy.casts * 0.5);
    expect(easy.lineBroken).toBe(0);
    const normal = simulateNaiveAngler('normal', 1000, 10);
    expect(normal.caught).toBeLessThan(easy.caught / 2);
  }, 60_000);

  // Onki (#570), 4 × 10 min normaalilla: virveli 20 kalaa 6,0 kg, onki 29 kalaa 7,5 kg.
  // Onkija saa enemmän pieniä kaloja, mutta painoa suunnilleen saman verran.
  it('saa ongella saman verran painoa kuin virvelillä', () => {
    const pole = { ...DEFAULT_TACKLE, method: 'pole' as const };
    let spin = 0;
    let onki = 0;
    let broken = 0;
    for (let seed = 1000; seed < 1002; seed++) {
      spin += simulateNaiveAngler('normal', seed, 10, { move: 180 }).weight;
      const r = simulateNaiveAngler('normal', seed, 10, { move: 180, tackle: pole });
      onki += r.weight;
      broken += r.lineBroken;
    }
    expect(onki).toBeGreaterThan(spin * 0.5);
    expect(onki).toBeLessThan(spin * 2);
    expect(broken).toBeLessThanOrEqual(1);
  }, 120_000);
});
