import { describe, expect, it } from 'vitest';
import { BUBBLE_CHARS, bubbleText } from './speechBubble';

describe('puhekuplan teksti (#228)', () => {
  it('lyhyt viesti sellaisenaan, pitkä lyhennetään merkin tarkkuudella', () => {
    expect(bubbleText('moi')).toBe('moi');
    const long = 'ä'.repeat(BUBBLE_CHARS + 10);
    const cut = bubbleText(long);
    expect([...cut]).toHaveLength(BUBBLE_CHARS);
    expect(cut.endsWith('…')).toBe(true);
    expect(bubbleText('x'.repeat(BUBBLE_CHARS))).toBe('x'.repeat(BUBBLE_CHARS));
  });
});
