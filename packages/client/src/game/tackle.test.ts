import { DEFAULT_TACKLE, type Tackle } from '@lunki/shared';
import { describe, expect, it } from 'vitest';
import { rigChanges } from './tackle';

const spin: Tackle = { ...DEFAULT_TACKLE, method: 'spin', leader: false, line: 'medium' };
const fly: Tackle = { ...DEFAULT_TACKLE, method: 'fly', flyLeader: 'mono', flyLine: 'floating' };

describe('rigChanges', () => {
  it('kertoo vaihtuneen siiman ja perukkeen', () => {
    expect(rigChanges(spin, { ...spin, leader: true })).toEqual(['leader']);
    expect(rigChanges(spin, { ...spin, line: 'thick', leader: true })).toEqual(['line', 'leader']);
    expect(rigChanges(fly, { ...fly, flyLeader: 'steel' })).toEqual(['flyLeader']);
    expect(rigChanges(fly, { ...fly, flyLine: 'sinking' })).toEqual(['flyLine']);
  });

  it('vieheen tai kalastustavan vaihto ei ole siiman vaihto', () => {
    expect(rigChanges(spin, { ...spin, lure: 'jig' })).toBeNull();
    expect(rigChanges(spin, { ...spin, lure: 'jig', leader: true })).toBeNull();
    expect(rigChanges(spin, { ...spin, method: 'fly' })).toBeNull();
    expect(rigChanges(fly, { ...fly, fly: 'popper', flyLeader: 'steel' })).toBeNull();
  });

  it('toisen kalastustavan siima ei kuulu käytössä olevaan', () => {
    expect(rigChanges(spin, { ...spin, flyLeader: 'fluoro' })).toBeNull();
    expect(rigChanges(spin, spin)).toBeNull();
  });
});
