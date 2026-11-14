import { describe, expect, it } from 'vitest';
import { LandCover, type AreaKind } from '@lunki/shared';
import { backBase, backHeight, createForestBack, planForestBack } from './forestBack';
import { Land } from './land';
import { SCENERY_COLORS } from './sceneryColors';
import { ShoreField } from './shoreField';
import { testWorld } from './testWorld';
import { FOREST_DEPTH } from './trees';

describe('modernin ilmeen metsän tausta', () => {
  const world = testWorld();
  const land = new Land(world, SCENERY_COLORS.summer);
  const shore = new ShoreField(world.map, FOREST_DEPTH + 40);
  const segments = planForestBack(world);

  it('kulkee metsän takareunan takana eikä koskaan vedessä', () => {
    expect(segments.length).toBeGreaterThan(300);
    for (const { a, b } of segments) {
      for (const p of [a, b]) {
        const d = shore.signed(p.x, p.y);
        expect(d, `${p.x}, ${p.y}`).toBeGreaterThan(FOREST_DEPTH);
        expect(d, `${p.x}, ${p.y}`).toBeLessThan(FOREST_DEPTH + 12);
      }
      expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeLessThan(12);
    }
  });

  it('järvi on pätkän etupuolella', () => {
    for (const { a, b } of segments) {
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 1) continue;
      // Sama normaali kuin seinämän pinnalla (a:sta b:hen, ylös).
      const n = { x: (b.y - a.y) / len, y: (a.x - b.x) / len };
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      expect(shore.signed(mid.x + n.x * 4, mid.y + n.y * 4)).toBeLessThan(
        shore.signed(mid.x - n.x * 4, mid.y - n.y * 4),
      );
    }
  });

  it('on metsässä latvusten alaosan korkuinen ja pellolla poissa', () => {
    const cover = new LandCover(world.surroundings!);
    let forest = 0;
    for (const { a } of segments) {
      const kind = cover.kindAt(a);
      if (kind !== 'forest' && kind !== null) continue;
      const h = backHeight(cover, a);
      expect(h).toBeGreaterThan(9);
      expect(h).toBeLessThan(19);
      forest++;
    }
    expect(forest).toBeGreaterThan(200);
    // Puuton maa jää avoimeksi, pihapiirin takana tausta on täyskorkea.
    const only = (kind: AreaKind) => ({ kindAt: () => kind }) as unknown as LandCover;
    for (const kind of ['field', 'beach', 'bare', 'water'] as const)
      expect(backHeight(only(kind), { x: 10, y: 20 })).toBe(0);
    expect(backHeight(only('residential'), { x: 10, y: 20 })).toBeGreaterThan(9);
  });

  it('nousee edessä olevan mäen laelle', () => {
    for (const { a } of segments.filter((_, i) => i % 5 === 0))
      expect(backBase(land, shore, a)).toBeGreaterThanOrEqual(land.heightAt(a));
  });

  it('rakentaa yhden verkon, joka ei heitä varjoa', () => {
    const mesh = createForestBack(world, land, SCENERY_COLORS.summer);
    expect(mesh.name).toBe('modern-forest-back');
    const position = mesh.geometry.getAttribute('position');
    expect(position.count).toBeGreaterThan(5000);
    expect(position.count % 6).toBe(0);
    for (let i = 0; i < position.count; i++) expect(Number.isFinite(position.getY(i))).toBe(true);
  });
});
