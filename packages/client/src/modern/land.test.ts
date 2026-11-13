import { describe, expect, it } from 'vitest';
import type * as THREE from 'three';
import { LUNKINJARVI } from '@lunki/shared';
import { bankHeight, Land } from './land';
import { SCENERY_COLORS } from './sceneryColors';
import { testWorld } from './testWorld';

describe('modernin ilmeen maanpinta (#650)', () => {
  const land = new Land(testWorld(), SCENERY_COLORS.summer);

  it('penkka on vesirajassa hieman pinnan yllä ja nousee reiluun metriin', () => {
    expect(bankHeight(0, 0, 0)).toBeCloseTo(0.12);
    expect(bankHeight(-0.5, 0, 0)).toBeLessThan(0);
    expect(bankHeight(-5, 0, 0)).toBeCloseTo(-0.45);
    for (const d of [8, 15, 30]) {
      expect(bankHeight(d, 12, 34)).toBeGreaterThan(1.1);
      expect(bankHeight(d, 12, 34)).toBeLessThan(1.6);
    }
  });

  it('maa on rannassa veden yllä ja järvessä pinnan alla', () => {
    const ring = LUNKINJARVI.shore;
    for (let i = 0; i < ring.length; i += 7) {
      const a = ring[i]!;
      const b = ring[(i + 1) % ring.length]!;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 2) continue;
      // Maa on kulkusuunnasta oikealla.
      const n = { x: (b.y - a.y) / len, y: -(b.x - a.x) / len };
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const at = (d: number) => ({ x: mid.x + n.x * d, y: mid.y + n.y * d });
      if (
        land.shore.signed(at(1.5).x, at(1.5).y) < 1 ||
        land.shore.signed(at(-1.5).x, at(-1.5).y) > -1
      )
        continue;
      expect(land.heightAt(at(1.5)), `maa ${mid.x}, ${mid.y}`).toBeGreaterThan(0.1);
      expect(land.heightAt(at(-1.5)), `vesi ${mid.x}, ${mid.y}`).toBeLessThan(0);
    }
  });

  it('pinta jatkuu rannasta sisämaahan ilman pykäliä', () => {
    // Laiturin tyvestä kohtisuoraan maalle: rantakaista vaihtuu karkeaan maastoon 22 metrissä.
    const pier = LUNKINJARVI.piers![1]!;
    const len = Math.hypot(pier.to.x - pier.from.x, pier.to.y - pier.from.y);
    const inland = { x: (pier.from.x - pier.to.x) / len, y: (pier.from.y - pier.to.y) / len };
    let last = land.heightAt(pier.from);
    for (let d = 0.25; d < 45; d += 0.25) {
      const h = land.heightAt({ x: pier.from.x + inland.x * d, y: pier.from.y + inland.y * d });
      expect(Math.abs(h - last), `${d} m`).toBeLessThan(0.3);
      last = h;
    }
  });

  it('rakentaa maaston, rantakaistan ja tiet ehjinä verkkoina', () => {
    const group = land.build();
    const meshes = group.children as THREE.Mesh[];
    expect(meshes.length).toBeGreaterThan(20);
    expect(group.getObjectByName('modern-lines')).toBeDefined();
    let vertices = 0;
    for (const mesh of meshes) {
      const p = mesh.geometry.getAttribute('position');
      vertices += p.count;
      for (let i = 0; i < p.array.length; i++)
        if (!Number.isFinite(p.array[i])) throw new Error('verkossa on epäluku');
      expect(mesh.geometry.getAttribute('normal').count).toBe(p.count);
      expect(mesh.geometry.getAttribute('color').count).toBe(p.count);
    }
    // Koko järven ranta puolentoista metrin ruuduin: suuruusluokka pysyy kurissa.
    expect(vertices).toBeGreaterThan(100_000);
    expect(vertices).toBeLessThan(400_000);
  });
});
