import { describe, expect, it } from 'vitest';
import { simulateNaiveAngler } from './naiveAngler';

describe('kalastusta tuntematon pelaaja', () => {
  // 16 × 10 min (dt 1/30) mitattuna: helppo 1,1, normaali 0,4 ja realistinen 0,2 kalaa/min.
  it('saa helpolla kalaa melkein joka heitolla eikä menetä viehettä pohjaan', () => {
    const easy = simulateNaiveAngler('easy', 1000, 10);
    expect(easy.caught).toBeGreaterThanOrEqual(7);
    expect(easy.caught).toBeGreaterThanOrEqual(easy.casts * 0.5);
    expect(easy.lineBroken).toBe(0);
    const normal = simulateNaiveAngler('normal', 1000, 10);
    expect(normal.caught).toBeLessThan(easy.caught / 2);
  }, 60_000);
});
