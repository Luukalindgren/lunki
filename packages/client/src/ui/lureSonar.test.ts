import { describe, expect, it } from 'vitest';
import type { Structure, Vec2 } from '@lunki/shared';
import { alongLine, lureProfile, lureSonarSpan } from './lureSonar';
import { lureColor } from '../game/lureColor';

describe('vieheluotain', () => {
  it('näytön leveys on viiden metrin portaissa ja vieheelle jää tilaa', () => {
    expect(lureSonarSpan(2)).toBe(10);
    expect(lureSonarSpan(18)).toBe(25);
    expect(lureSonarSpan(40)).toBe(45);
    for (const d of [5, 12, 23, 37, 60]) expect(lureSonarSpan(d)).toBeGreaterThan(d);
  });

  it('etäisyys mitataan siiman suuntaan', () => {
    const tip = { x: 10, y: 5 };
    const dir = { x: 0, y: 1 };
    expect(alongLine(tip, dir, { x: 10, y: 15 })).toBeCloseTo(10);
    expect(alongLine(tip, dir, { x: 13, y: 9 })).toBeCloseTo(4);
  });

  it('profiili näyttää pohjan, maan ja rakenteet kärjestä vieheen suuntaan', () => {
    // Pohja syvenee itään; 20 m:n jälkeen on rantaa, 8–10 m kohdalla kivikko.
    const rocks: Structure = { kind: 'rocks', pos: { x: 9, y: 0 }, radius: 1 };
    const cols = lureProfile(
      {
        tip: { x: 0, y: 0 },
        depthAt: (p: Vec2) => p.x / 10,
        isWater: (p: Vec2) => p.x < 20,
        structureAt: (p: Vec2) => (Math.abs(p.x - 9) <= 1 ? rocks : null),
      },
      { x: 1, y: 0 },
      25,
      26,
    );
    expect(cols).toHaveLength(26);
    expect(cols[0]).toEqual({ bottom: 0, structure: null, height: 0, floor: null });
    expect(cols[15]!.bottom).toBeCloseTo(1.5);
    expect(cols[9]!.structure).toBe('rocks');
    expect(cols[12]!.structure).toBeNull();
    expect(cols[22]!.bottom).toBeNull();
  });

  it('profiili kertoo pohjan laadun ja kiven korkeuden (#226)', () => {
    const boulder: Structure = { kind: 'boulder', pos: { x: 5, y: 0 }, radius: 1, height: 0.7 };
    const cols = lureProfile(
      {
        tip: { x: 0, y: 0 },
        depthAt: () => 3,
        isWater: () => true,
        structureAt: (p: Vec2) => (Math.abs(p.x - 5) <= 1 ? boulder : null),
        bottomTypeAt: (p: Vec2) => (p.x < 8 ? 'rock' : 'mud'),
      },
      { x: 1, y: 0 },
      10,
      11,
    );
    expect(cols[5]).toEqual({ bottom: 3, structure: 'boulder', height: 0.7, floor: 'rock' });
    expect(cols[9]).toEqual({ bottom: 3, structure: null, height: 0, floor: 'mud' });
  });

  it('vieheen väri kertoo syvyyden', () => {
    expect(lureColor(0)).toBe(0xf08a2c);
    expect(lureColor(0.6)).toBe(0xc05bb4);
    expect(lureColor(2)).toBe(0x6b2d6e);
    expect(lureColor(2, true)).toBe(0xf08a2c);
  });
});
