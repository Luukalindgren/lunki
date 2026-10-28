import { describe, expect, it } from 'vitest';
import { AWARD_IDS } from '@lunki/shared';
import { AWARD_ICON, AWARD_ICONS } from './awardIcons';
import { ICON_SIZE } from './emoteIcons';

describe('palkintojen ikonit (#367)', () => {
  it('ikonit ovat 16 × 16 tunnetuista väreistä ja eroavat toisistaan', () => {
    const all = Object.entries(AWARD_ICONS);
    for (const [id, rows] of all) {
      expect(rows, id).toHaveLength(ICON_SIZE);
      for (const r of rows) expect(r, id).toMatch(/^[.srbyokwg]{16}$/);
    }
    expect(new Set(all.map(([, rows]) => rows.join())).size).toBe(all.length);
  });

  it('jokaisella palkinnolla on ikoni, kalapalkinnoilla kalan kuva', () => {
    for (const id of AWARD_IDS) expect(id in AWARD_ICON, id).toBe(true);
    const fish = AWARD_IDS.filter((id) => AWARD_ICON[id] === null);
    expect(fish).toEqual(['biggest', 'first', 'smallest', 'theOneThatGotAway']);
  });
});
