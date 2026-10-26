import { describe, expect, it } from 'vitest';
import { EMOTES } from '@lunki/shared';
import { EMOTE_ICONS } from './emoteIcons';

describe('käsimerkkien ikonit (#228)', () => {
  it('jokaisella eleellä on 12 × 12 ikoni tunnetuista väreistä', () => {
    for (const id of EMOTES) {
      const rows = EMOTE_ICONS[id];
      expect(rows, id).toHaveLength(12);
      for (const r of rows) expect(r, id).toMatch(/^[.srby]{12}$/);
    }
  });
});
