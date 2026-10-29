import { describe, expect, it } from 'vitest';
import { LURE_LOOK, lureColor, lureLook } from './lureColor';

describe('vieheen tilan väri järvellä', () => {
  it('syvyys näkyy värinä', () => {
    expect(lureLook({ depth: 0, bottom: 5 })).toBe(lureColor(0));
    expect(lureLook({ depth: 2, bottom: 5 })).toBe(lureColor(2));
  });

  it('pohjan tuntuma, rikka ja tartunta näkyvät väreinä', () => {
    expect(lureLook({ depth: 1.8, bottom: 2 })).toBe(LURE_LOOK.bottom);
    // Matalassa pinnan viehe ei ole "pohjassa", vaikka pohja on lähellä.
    expect(lureLook({ depth: 0.1, bottom: 0.3 })).toBe(lureColor(0.1));
    expect(lureLook({ depth: 1.8, bottom: 2, fouled: true })).toBe(LURE_LOOK.fouled);
    expect(lureLook({ depth: 1.8, bottom: 2, fouled: true, snag: true })).toBe(LURE_LOOK.snag);
    expect(lureLook({ depth: 0, bottom: 0, onLand: true })).toBe(lureColor(0, true));
  });
});
