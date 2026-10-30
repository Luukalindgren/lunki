import { DEFAULT_TACKLE, type Tackle } from '@lunki/shared';
import { describe, expect, it } from 'vitest';
import { leaderOnly } from './tackle';

const spin: Tackle = { ...DEFAULT_TACKLE, method: 'spin', leader: false };
const fly: Tackle = { ...DEFAULT_TACKLE, method: 'fly', flyLeader: 'mono' };

describe('leaderOnly', () => {
  it('tunnistaa pelkän perukkeen vaihdon', () => {
    expect(leaderOnly(spin, { ...spin, leader: true })).toBe(true);
    expect(leaderOnly(fly, { ...fly, flyLeader: 'steel' })).toBe(true);
  });

  it('vieheen tai kalastustavan vaihto ei ole perukkeen vaihto', () => {
    expect(leaderOnly(spin, { ...spin, lure: 'jig' })).toBe(false);
    expect(leaderOnly(spin, { ...spin, lure: 'jig', leader: true })).toBe(false);
    expect(leaderOnly(spin, { ...spin, method: 'fly' })).toBe(false);
    expect(leaderOnly(fly, { ...fly, fly: 'popper', flyLeader: 'steel' })).toBe(false);
  });

  it('toisen kalastustavan peruke ei kuulu käytössä olevaan', () => {
    expect(leaderOnly(spin, { ...spin, flyLeader: 'fluoro' })).toBe(false);
    expect(leaderOnly(spin, spin)).toBe(false);
  });
});
