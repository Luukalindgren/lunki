import { describe, expect, it } from 'vitest';
import { EMOTES } from '@lunki/shared';
import { EMOTE_ICONS, ICON_SIZE } from './emoteIcons';

describe('käsimerkkien ikonit (#228)', () => {
  it('jokaisella eleellä on 16 × 16 ikoni tunnetuista väreistä', () => {
    for (const id of EMOTES) {
      const rows = EMOTE_ICONS[id];
      expect(rows, id).toHaveLength(ICON_SIZE);
      for (const r of rows) expect(r, id).toMatch(/^[.srbyok]{16}$/);
    }
  });

  it('ikonit eroavat toisistaan ja jättävät reunan ääriviivalle (#228 palaute)', () => {
    expect(new Set(EMOTES.map((id) => EMOTE_ICONS[id].join())).size).toBe(EMOTES.length);
    // Vilkutuksessa ja nyrkissä liikeviivat molemmin puolin kättä.
    for (const id of ['wave', 'fist'] as const) {
      const rows = EMOTE_ICONS[id];
      expect(
        rows.some((r) => r.startsWith('y')),
        id,
      ).toBe(true);
      expect(
        rows.some((r) => r.endsWith('y')),
        id,
      ).toBe(true);
    }
    // "Näin iso": kaksi kättä ja kala niiden välissä.
    const mid = EMOTE_ICONS.bigFish[7]!;
    expect(mid.indexOf('b')).toBeGreaterThan(mid.indexOf('s'));
    expect(mid.lastIndexOf('b')).toBeLessThan(mid.lastIndexOf('s'));
  });
});
