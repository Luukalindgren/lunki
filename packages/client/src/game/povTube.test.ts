import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { EMOTE_DURATION } from '@lunki/shared';
import { DIM, finPose, handRaise, slackCoilLayout, slackHang, slackPilePoint } from './povTube';

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

describe('perhon löysä siima POV:ssa', () => {
  const coils = slackCoilLayout();

  it('kasa on siimatason päällä, ei vedessä', () => {
    for (let i = 0; i <= coils.length * 32; i++) {
      const p = slackPilePoint(i / 32);
      expect(p.x).toBeGreaterThan(DIM.apronFrom);
      expect(p.x).toBeLessThan(DIM.flapTo);
      expect(Math.abs(p.z)).toBeLessThan(DIM.apronHalf);
      expect(p.y).toBeGreaterThan(DIM.apronY);
    }
  });

  it('kiekurat kasautuvat toistensa päälle', () => {
    const ys = coils.map((k) => k.y);
    for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeGreaterThan(ys[i - 1]!);
  });

  it('siima on yksi yhtenäinen viiva kiekuralta toiselle', () => {
    // Peräkkäiset pisteet ovat lähellä toisiaan myös kiekuran vaihtuessa.
    for (let i = 1; i <= coils.length * 64; i++) {
      expect(slackPilePoint(i / 64).distanceTo(slackPilePoint((i - 1) / 64))).toBeLessThan(0.03);
    }
  });

  it('riippuva siima alkaa kelalta, päättyy kasaan eikä painu tason läpi', () => {
    const reel = new THREE.Vector3(0.2, 0.36, 0.27);
    const pile = slackPilePoint(0);
    const pts = Array.from({ length: 10 }, () => new THREE.Vector3());
    slackHang(reel, pile, pts);
    expect(pts[0]!.distanceTo(reel)).toBeLessThan(1e-6);
    expect(pts[9]!.distanceTo(pile)).toBeLessThan(1e-6);
    for (const p of pts) expect(p.y).toBeGreaterThanOrEqual(pile.y - 1e-6);
  });
});
