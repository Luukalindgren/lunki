import { describe, expect, it } from 'vitest';
import { AWARD_IDS, type Award } from '@lunki/shared';
import { fi } from '../i18n/fi';
import { awardDetail, formatDistance } from './raceSummary';

const award = (id: Award['id'], value: number, fish?: Award['fish']): Award => ({
  id,
  winners: [{ id: 'a', name: 'A' }],
  value,
  ...(fish ? { fish } : {}),
});

describe('palkintojen selitteet (#367)', () => {
  it('jokaisella palkinnolla on nimi ja selite', () => {
    for (const id of AWARD_IDS) {
      expect(fi[`award.${id}` as keyof typeof fi], id).toBeTruthy();
      expect(fi[`award.${id}.detail` as keyof typeof fi], id).toBeTruthy();
    }
  });

  it('luvut ja kalat selitteeseen, yksi kerta omalla lauseellaan', () => {
    expect(awardDetail(award('swimmer', 3))).toBe('kaatui 3 kertaa');
    expect(awardDetail(award('swimmer', 1))).toBe('kävi uimassa');
    expect(awardDetail(award('longestCast', 42))).toBe('pisin heitto 42 m');
    expect(awardDetail(award('first', 95, { species: 'perch', weight: 0.25 }))).toBe(
      'ahven 250 g jo ajassa 1:35',
    );
    expect(awardDetail(award('marathon', 1520))).toBe('kulki 1,5 km');
    expect(awardDetail(award('dockGuard', 330))).toBe('5:30 paikallaan');
  });

  it('matka metreinä tai kilometreinä', () => {
    expect(formatDistance(812.4)).toBe('812 m');
    expect(formatDistance(2345)).toBe('2,3 km');
  });
});
