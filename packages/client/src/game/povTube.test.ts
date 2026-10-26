import { describe, expect, it } from 'vitest';
import { EMOTE_DURATION } from '@lunki/shared';
import { finPose, handRaise } from './povTube';

describe('POV-kellukan räpylät ja käsi (#230)', () => {
  it('räpylät potkivat vuorotellen ja pikapotku heiluttaa enemmän', () => {
    const left = finPose(0.25, false, 0, -1, 0);
    const right = finPose(0.25, false, 0, 1, 0);
    expect(left.swing).toBeCloseTo(-right.swing);
    expect(Math.abs(left.swing)).toBeGreaterThan(0.1);
    const fast = finPose(0.25, true, 0, -1, 0);
    expect(Math.abs(fast.swing)).toBeGreaterThan(Math.abs(left.swing));
    // Nilkka läpsyy säärtä enemmän ja vastakkaiseen suuntaan.
    expect(Math.abs(left.ankle)).toBeGreaterThan(Math.abs(left.swing));
    expect(Math.sign(left.ankle)).toBe(-Math.sign(left.swing));
  });

  it('levossa räpylät vain huojuvat', () => {
    for (let t = 0; t < 10; t += 0.7) {
      expect(Math.abs(finPose(0, false, 0, 1, t).swing)).toBeLessThanOrEqual(0.03);
    }
  });

  it('käännöksessä räpylät kääntyvät eri suuntiin, rajattuna', () => {
    const l = finPose(0, false, 2, -1, 0);
    const r = finPose(0, false, 2, 1, 0);
    expect(l.yaw).toBeCloseTo(-0.45);
    expect(r.yaw).toBeCloseTo(0.45);
    expect(finPose(0, false, 0.3, 1, 0).yaw).toBeCloseTo(0.18);
  });

  it('käsi nousee eleen alussa ja laskee lopussa', () => {
    expect(handRaise(-1)).toBe(0);
    expect(handRaise(0)).toBe(0);
    expect(handRaise(0.25)).toBeCloseTo(1);
    expect(handRaise(EMOTE_DURATION / 2)).toBeCloseTo(1);
    expect(handRaise(EMOTE_DURATION - 0.15)).toBeGreaterThan(0);
    expect(handRaise(EMOTE_DURATION - 0.15)).toBeLessThan(1);
    expect(handRaise(EMOTE_DURATION)).toBe(0);
  });
});
