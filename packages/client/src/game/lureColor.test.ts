import { describe, expect, it } from 'vitest';
import { LURE_LOOK, lureColor, lureLook } from './lureColor';

describe('vieheen merkki järvellä', () => {
  it('syvyys näkyy värinä ja kokona: syvempi on pienempi', () => {
    const top = lureLook({ depth: 0, bottom: 5 });
    const deep = lureLook({ depth: 2, bottom: 5 });
    expect(top.color).toBe(lureColor(0));
    expect(deep.color).toBe(lureColor(2));
    expect(deep.scale).toBeLessThan(top.scale);
    expect(lureLook({ depth: 9, bottom: 10 }).scale).toBeCloseTo(LURE_LOOK.smallScale);
  });

  it('pohjan tuntuma, rikka ja tartunta näkyvät väreinä', () => {
    expect(lureLook({ depth: 1.8, bottom: 2 }).color).toBe(LURE_LOOK.bottom);
    // Matalassa pinnan viehe ei ole "pohjassa", vaikka pohja on lähellä.
    expect(lureLook({ depth: 0.1, bottom: 0.3 }).color).toBe(lureColor(0.1));
    expect(lureLook({ depth: 1.8, bottom: 2, fouled: true }).color).toBe(LURE_LOOK.fouled);
    expect(lureLook({ depth: 1.8, bottom: 2, fouled: true, snag: true }).color).toBe(
      LURE_LOOK.snag,
    );
    expect(lureLook({ depth: 0, bottom: 0, onLand: true })).toEqual({
      color: lureColor(0, true),
      scale: 1,
    });
  });
});
