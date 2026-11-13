import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { LightningView } from '../game/lightningView';
import { boltNodes, Bolts } from './bolts';
import { fakeDocument } from './testWorld';

beforeAll(() => vi.stubGlobal('document', fakeDocument()));
afterAll(() => vi.unstubAllGlobals());

const eyes = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 2000);
eyes.position.set(0, 0.5, 0);
eyes.lookAt(0, 30, -70);
eyes.updateMatrixWorld();
const above = new THREE.OrthographicCamera(-20, 20, 12, -12, 0.1, 500);
above.position.set(0, 100, 0);
above.lookAt(0, 0, 0);
above.updateMatrixWorld();

/** Pelin salaman jana nelikulmiona: kaksi kärkeä kummassakin päässä, puolileveys `w`. */
function quad(a: [number, number, number], b: [number, number, number], w: number): number[] {
  return [a[0] - w, a[1], a[2], a[0] + w, a[1], a[2], b[0] - w, b[1], b[2], b[0] + w, b[1], b[2]];
}

describe('salama modernissa ilmeessä (#650)', () => {
  it('jakaa pelin janat solmuiksi ja aloittaa haaran uutena polkuna', () => {
    const position = [
      ...quad([0, 0, 0], [2, 10, 0], 0.4),
      ...quad([2, 10, 0], [1, 20, 3], 0.4),
      // Haara lähtee kanavan keskeltä eikä jatka edellisen päästä.
      ...quad([2, 10, 0], [8, 14, 0], 0.25),
      ...quad([8, 14, 0], [12, 15, 0], 0.25),
    ];
    const nodes: Parameters<typeof boltNodes>[2] = [];
    const n = boltNodes(position, 4, nodes);
    // Polun alku ja kolme solmua janaa kohden.
    expect(n).toBe(1 + 3 + 3 + 1 + 3 + 3);
    expect(nodes.slice(0, n).map((node) => node.start)).toEqual([
      true,
      false,
      false,
      false,
      false,
      false,
      false,
      true,
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
    // Janojen päät pysyvät paikoillaan, välisolmut poikkeavat hieman sivuun.
    expect(nodes[0]!.p.toArray()).toEqual([0, 0, 0]);
    expect(nodes[3]!.p.toArray()).toEqual([2, 10, 0]);
    expect(nodes[6]!.p.toArray()).toEqual([1, 20, 3]);
    expect(nodes[13]!.p.toArray()).toEqual([12, 15, 0]);
    const straight = new THREE.Vector3(2, 10, 0).multiplyScalar(1 / 3);
    const off = nodes[1]!.p.distanceTo(straight);
    expect(off).toBeGreaterThan(0);
    expect(off).toBeLessThan(1.5);
    // Leveys on pelin; pääkanava on tasapaksu ja haara kapenee kärkeen.
    expect(nodes[2]!.w).toBeCloseTo(0.4);
    expect(nodes[9]!.w).toBeCloseTo(0.25);
    for (let i = 0; i < 7; i++) expect(nodes[i]!.taper).toBe(1);
    expect(nodes[7]!.taper).toBe(1);
    for (let i = 8; i < 14; i++) expect(nodes[i]!.taper).toBeLessThan(nodes[i - 1]!.taper);
    expect(nodes[13]!.taper).toBeCloseTo(0.15);
    // Sama salama antaa samat solmut joka ruudulla: kanava ei värise.
    const again: Parameters<typeof boltNodes>[2] = [];
    boltNodes(position, 4, again);
    expect(again[1]!.p.toArray()).toEqual(nodes[1]!.p.toArray());
  });

  it('piirtää pelin salaman tilalle ytimen, hehkun, valopallon ja renkaan', () => {
    const view = new LightningView();
    const part = (name: string) => view.group.getObjectByName(name) as THREE.Mesh;
    const materials = ['bolt', 'bolt-halo', 'bolt-glow', 'bolt-ring'].map(
      (name) => part(name).material as THREE.Material,
    );
    const bolts = new Bolts();
    bolts.bind(view.group);
    expect(materials.every((m) => !m.visible)).toBe(true);
    const added = () => view.group.children.filter((c) => c.name === 'modern-bolt') as THREE.Mesh[];
    expect(added()).toHaveLength(4);
    // Ennen iskua mitään ei näy.
    bolts.update(eyes);
    expect(added().every((m) => !m.visible)).toBe(true);

    view.strike({ x: 0, y: 70 });
    view.update(0.016);
    view.orient(eyes, 720);
    bolts.update(eyes);
    const [sheath, core, flare, ring] = added();
    expect(core!.visible).toBe(true);
    expect(sheath!.visible).toBe(true);
    expect(flare!.visible).toBe(true);
    expect(core!.geometry.drawRange.count).toBeGreaterThan(part('bolt').geometry.drawRange.count);
    // Ydin on valonlähde (alfa 0), hehku lisätään kuvaan eikä kirjoita alfaan.
    const coreMaterial = core!.material as THREE.Material;
    expect(coreMaterial.blendSrcAlpha).toBe(THREE.ZeroFactor);
    expect(coreMaterial.blendDstAlpha).toBe(THREE.ZeroFactor);
    const glow = sheath!.material as THREE.Material;
    expect(glow.blendDst).toBe(THREE.OneFactor);
    expect(glow.blendDstAlpha).toBe(THREE.OneFactor);
    // Ydin on pelin nauhaa kapeampi ja kulkee sen kohdalla.
    const pos = core!.geometry.getAttribute('position');
    const width = new THREE.Vector3()
      .fromBufferAttribute(pos, 0)
      .distanceTo(new THREE.Vector3().fromBufferAttribute(pos, 1));
    const game = part('bolt').geometry.getAttribute('position');
    const gameWidth = new THREE.Vector3()
      .fromBufferAttribute(game, 0)
      .distanceTo(new THREE.Vector3().fromBufferAttribute(game, 1));
    expect(width).toBeLessThan(gameWidth * 0.5);
    expect(width).toBeGreaterThan(0);
    for (let i = 0; i < core!.geometry.drawRange.count; i++) {
      const v = core!.geometry.getIndex()!.getX(i);
      expect(Number.isFinite(pos.getX(v) + pos.getY(v) + pos.getZ(v))).toBe(true);
    }

    // Shokkiaalto seuraa pelin rengasta ja haalistuu laajetessaan.
    expect(ring!.visible).toBe(part('bolt-ring').visible);
    const ringMaterial = ring!.material as THREE.MeshBasicMaterial;
    part('bolt-ring').visible = true;
    part('bolt-ring').userData.life = 0.1;
    bolts.update(eyes);
    const fresh = ringMaterial.opacity;
    expect(ring!.scale.x).toBe(part('bolt-ring').scale.x);
    part('bolt-ring').userData.life = 0.8;
    bolts.update(eyes);
    expect(ringMaterial.opacity).toBeLessThan(fresh * 0.3);

    bolts.dispose();
    expect(materials.every((m) => m.visible)).toBe(true);
    expect(added()).toHaveLength(0);
  });

  it('ylhäältä hehku hiipuu jyrkkään mutkaan eikä taitu laataksi', () => {
    const view = new LightningView();
    const bolts = new Bolts();
    bolts.bind(view.group);
    view.strike({ x: 3, y: 2 });
    view.update(0.016);
    view.orient(above, 720);
    bolts.update(above);
    const sheath = view.group.children.find((c) => c.name === 'modern-bolt') as THREE.Mesh;
    const col = sheath.geometry.getAttribute('color');
    const pos = sheath.geometry.getAttribute('position');
    const index = sheath.geometry.getIndex()!;
    let dimmed = 0;
    let full = 0;
    const seen = new Set<number>();
    for (let i = 0; i < sheath.geometry.drawRange.count; i++) {
      const v = index.getX(i);
      if (seen.has(v)) continue;
      seen.add(v);
      expect(Number.isFinite(pos.getX(v) + pos.getY(v) + pos.getZ(v))).toBe(true);
      // Joka kolmas kärki on nauhan keskus; reunat ovat aina läpinäkyviä.
      if (v % 3 !== 1) expect(col.getW(v)).toBe(0);
      else if (col.getW(v) < 0.05) dimmed++;
      else full++;
    }
    // Ylhäältä salama on siksakkia: osa solmuista on jyrkkiä mutkia ilman hehkua.
    expect(full).toBeGreaterThan(0);
    expect(dimmed).toBeGreaterThan(0);
    bolts.dispose();
  });

  it('kaukainen salama hehkuu heikommin', () => {
    const power = (far: boolean) => {
      const view = new LightningView();
      const bolts = new Bolts();
      bolts.bind(view.group);
      view.strike({ x: 0, y: 70 }, far);
      view.update(0.016);
      view.orient(eyes, 720);
      bolts.update(eyes);
      const sheath = view.group.children.find((c) => c.name === 'modern-bolt') as THREE.Mesh;
      const alpha = sheath.geometry.getAttribute('color').getW(1);
      bolts.dispose();
      return alpha;
    };
    expect(power(true)).toBeLessThan(power(false) * 0.6);
  });
});
