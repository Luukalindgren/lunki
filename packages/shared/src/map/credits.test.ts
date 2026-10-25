import { describe, expect, it } from 'vitest';
import { mapCredits } from './credits';

describe('lähdemaininnat', () => {
  it('mainitsevat kaikki kartan aineistot kerran', () => {
    const credits = mapCredits();
    expect(credits.some((c) => c.includes('OpenStreetMap'))).toBe(true);
    expect(credits.some((c) => c.includes('Copernicus'))).toBe(true);
    expect(credits.some((c) => c.includes('Syke'))).toBe(true);
    expect(new Set(credits).size).toBe(credits.length);
  });
});
