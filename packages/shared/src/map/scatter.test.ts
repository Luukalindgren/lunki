import { describe, expect, it } from 'vitest';
import { LakeBottom } from './bottom';
import { LUNKINJARVI, LUNKINJARVI_BOTTOM } from './lunkinjarvi';
import { ReedIndex } from './reeds';
import { SCATTER, hash01 } from './scatter';
import { WaterBody } from './waterBody';

const water = new WaterBody(LUNKINJARVI);
const build = () =>
  new LakeBottom(
    water,
    LUNKINJARVI.bounds,
    LUNKINJARVI_BOTTOM,
    LUNKINJARVI.reeds,
    LUNKINJARVI.piers,
  );
const bottom = build();
const reeds = new ReedIndex(LUNKINJARVI.reeds);
const of = (kind: string) => bottom.structures.filter((s) => s.kind === kind);

describe('pohjan siroitellut rakenteet (#226)', () => {
  it('määrät ovat realistiset: satoja kiviä, kymmeniä kasvustoja, toistakymmentä risukkoa', () => {
    expect(of('boulder').length).toBeGreaterThanOrEqual(150);
    expect(of('boulder').length).toBeLessThanOrEqual(300);
    expect(of('weed').length).toBeGreaterThanOrEqual(20);
    expect(of('weed').length).toBeLessThanOrEqual(40);
    expect(of('brush').length).toBeGreaterThanOrEqual(10);
    expect(of('brush').length).toBeLessThanOrEqual(15);
  });

  it('sijoittelu on kiinteä: sama järvi kaikille ja palvelimelle', () => {
    const again = build();
    expect(again.structures).toEqual(bottom.structures);
    expect(hash01(3, 4, 5)).toBe(hash01(3, 4, 5));
    expect(hash01(3, 4, 5)).not.toBe(hash01(4, 3, 5));
  });

  it('rakenteet ovat vedessä, eivät kaislikossa, eivätkä kivet nouse pinnan yli', () => {
    for (const s of [...of('boulder'), ...of('weed'), ...of('brush')]) {
      expect(water.isWater(s.pos)).toBe(true);
      const depth = bottom.depthAt(s.pos);
      expect(s.height!).toBeGreaterThan(0);
      expect(s.height!).toBeLessThan(depth);
      expect(reeds.insideDistance(s.pos)).toBeLessThanOrEqual(0);
    }
    for (const w of of('weed')) {
      const d = bottom.depthAt(w.pos);
      expect(d).toBeGreaterThanOrEqual(SCATTER.weedDepth.min);
      expect(d).toBeLessThanOrEqual(SCATTER.weedDepth.max);
      expect(w.density!).toBeGreaterThan(0);
      expect(w.density!).toBeLessThanOrEqual(1);
    }
  });

  it('kivi löytyy hakuruudukosta, ja kasvuston sisällä kova rakenne voittaa', () => {
    for (const s of of('boulder').slice(0, 20)) {
      const hit = bottom.structureAt(s.pos);
      expect(hit).not.toBeNull();
      expect(hit!.kind).not.toBe('weed');
    }
    const weed = of('weed')[0]!;
    expect(bottom.structureAt(weed.pos)).not.toBeNull();
  });

  it('pohjassa on liejua syvänteissä, hiekkaa ja kivikkoa', () => {
    const count = { mud: 0, sand: 0, rock: 0 };
    const b = LUNKINJARVI.bounds;
    for (let x = b.minX; x < b.maxX; x += 20)
      for (let y = b.minY; y < b.maxY; y += 20) {
        const p = { x, y };
        if (!water.isWater(p)) continue;
        const type = bottom.bottomTypeAt(p);
        count[type]++;
        if (bottom.depthAt(p) > 7) expect(type).not.toBe('sand');
      }
    expect(count.mud).toBeGreaterThan(100);
    expect(count.sand).toBeGreaterThan(100);
    expect(count.rock).toBeGreaterThan(20);
  });
});

describe('testijärvellä ei siroitella', () => {
  it('ilman scatter-lippua rakenteita ei lisätä', () => {
    const plain = new LakeBottom(water, LUNKINJARVI.bounds, {
      ...LUNKINJARVI_BOTTOM,
      scatter: false,
    });
    expect(plain.structures.some((s) => s.kind === 'boulder' || s.kind === 'weed')).toBe(false);
  });
});
