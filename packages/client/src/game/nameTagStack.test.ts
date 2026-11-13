import { describe, expect, it } from 'vitest';
import { stackTags, TAG_STACK, type TagBox } from './nameTagStack';

const tag = (id: string, x: number, dist: number, y = 100): TagBox => ({
  id,
  x,
  y,
  w: 80,
  h: 20,
  dist,
});

describe('nimikylttien pino (#633)', () => {
  it('erillään olevat kyltit pysyvät paikallaan', () => {
    const slots = stackTags([tag('a', 100, 5), tag('b', 300, 9)]);
    expect(slots.get('a')).toEqual({ lift: 0, hidden: false, more: 0 });
    expect(slots.get('b')).toEqual({ lift: 0, hidden: false, more: 0 });
  });

  it('päällekkäin osuvista lähin pysyy ja kauempi nousee sen päälle', () => {
    const slots = stackTags([tag('kaukana', 110, 40), tag('lähellä', 100, 5)]);
    expect(slots.get('lähellä')!.lift).toBe(0);
    expect(slots.get('kaukana')!.lift).toBe(20 + TAG_STACK.gap);
  });

  it('pino kasvaa ylöspäin eikä yksikään kyltti peitä toista', () => {
    const slots = stackTags([tag('a', 100, 1), tag('b', 104, 2), tag('c', 96, 3)]);
    const lifts = ['a', 'b', 'c'].map((id) => slots.get(id)!.lift);
    expect(lifts).toEqual([0, 22, 44]);
  });

  it('pinon ylärajan yli menevät piilotetaan ja ylin kertoo määrän', () => {
    const slots = stackTags(Array.from({ length: 7 }, (_, i) => tag(`p${i}`, 100 + i, i)));
    const shown = [...slots.values()].filter((s) => !s.hidden);
    expect(shown).toHaveLength(TAG_STACK.max);
    expect(slots.get('p3')!.more).toBe(3);
    expect(slots.get('p6')!.hidden).toBe(true);
  });

  it('eri korkeudella oleva kyltti ei nouse turhaan', () => {
    const slots = stackTags([tag('a', 100, 1), tag('b', 100, 2, 60)]);
    expect(slots.get('b')!.lift).toBe(0);
  });
});
