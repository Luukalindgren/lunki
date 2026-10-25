import { describe, expect, it } from 'vitest';
import {
  DEFAULT_APPEARANCE,
  GEAR_COLORS,
  LINE_COLORS,
  parseAppearance,
  randomAppearance,
} from './appearance';

describe('parseAppearance', () => {
  it('hyväksyy listan värit', () => {
    const a = { tube: 0xf6d04d, fins: 0xd23a2a, shirt: 0x1b5a84, line: 0x9ef0d6 };
    expect(parseAppearance(a)).toEqual(a);
  });

  it('korvaa tuntemattomat värit oletuksilla', () => {
    expect(parseAppearance({ tube: 0x123456, fins: 'red', line: 0x1b5a84 })).toEqual(
      DEFAULT_APPEARANCE,
    );
    expect(parseAppearance({ tube: 0xf6d04d })).toEqual({ ...DEFAULT_APPEARANCE, tube: 0xf6d04d });
    expect(parseAppearance(null)).toBeNull();
    expect(parseAppearance('x')).toBeNull();
  });
});

describe('randomAppearance', () => {
  it('arpoo sallitut värit', () => {
    for (const r of [0, 0.3, 0.6, 0.9999]) {
      const a = randomAppearance(() => r);
      expect(parseAppearance(a)).toEqual(a);
    }
  });

  it('värilistoissa ei ole tuplia', () => {
    for (const list of [GEAR_COLORS, LINE_COLORS])
      expect(new Set(list.map((c) => c.hex)).size).toBe(list.length);
  });
});
