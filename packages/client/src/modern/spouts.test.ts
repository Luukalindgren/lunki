import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SPOUT_FUNNEL, SpoutView } from '../game/spoutView';
import { funnelRadius, funnelShape, Spouts } from './spouts';

const eyes = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 500);
const above = new THREE.OrthographicCamera(-20, 20, 12, -12, 0.1, 500);

describe('trombi modernissa ilmeessä (#650)', () => {
  it('suppilo on vedessä kapea, levenee pilveen ja juuressa on roiskehelma', () => {
    const { height, top, foot } = SPOUT_FUNNEL;
    expect(funnelRadius(height)).toBeCloseTo(top, 1);
    // Helma leventää juurta, mutta sen yläpuolella suppilo on kapeimmillaan.
    expect(funnelRadius(0)).toBeGreaterThan(foot);
    const waist = funnelRadius(height * 0.15);
    expect(waist).toBeLessThan(funnelRadius(0));
    expect(waist).toBeLessThan(top * 0.3);
    for (let y = height * 0.2; y < height; y += 5)
      expect(funnelRadius(y + 5)).toBeGreaterThan(funnelRadius(y));

    const shape = funnelShape();
    shape.computeBoundingBox();
    expect(shape.boundingBox!.min.y).toBeCloseTo(0);
    expect(shape.boundingBox!.max.y).toBeCloseTo(height);
    expect(shape.boundingBox!.max.x).toBeCloseTo(funnelRadius(height), 1);
  });

  it('vaihtaa pelin suppilon ja roiskeen pilvipatsaaksi ja palauttaa ne', () => {
    const view = new SpoutView();
    view.group.name = 'spouts';
    view.update(0.016, [{ x: 30, y: 40 }]);
    const spout = view.group.children[0]!;
    const part = (name: string) => spout.getObjectByName(name) as THREE.Mesh;
    const funnel = part('spout-funnel').material as THREE.Material;
    const spray = part('spout-spray').material as THREE.Material;
    const streaks = part('spout-streaks').material as THREE.MeshBasicMaterial;

    const spouts = new Spouts();
    spouts.bind(view.group);
    expect(funnel.visible).toBe(false);
    expect(spray.visible).toBe(false);
    // Imuvirran juovat jäävät pelin piirrettäviksi läpikuultavina.
    expect(streaks.visible).toBe(true);
    expect(streaks.transparent).toBe(true);
    expect(streaks.opacity).toBeLessThan(1);
    const holders = view.group.children.map((s) => s.getObjectByName('modern-spout'));
    expect(holders.every((h) => h !== undefined)).toBe(true);

    // Pilvipatsas pyörii pelin suppilon mukana.
    view.update(0.5, [{ x: 30, y: 40 }]);
    spouts.update(eyes);
    const meshes = holders[0]!.children as THREE.Mesh[];
    for (const mesh of meshes) expect(mesh.rotation.y).toBeCloseTo(part('spout-funnel').rotation.y);

    spouts.dispose();
    expect(funnel.visible).toBe(true);
    expect(spray.visible).toBe(true);
    expect(streaks.transparent).toBe(false);
    expect(streaks.opacity).toBe(1);
    expect(spout.getObjectByName('modern-spout')).toBeUndefined();
  });

  it('silmin näkyy ulkopinta leimattuna, ylhäältä himmeä sisäpinta ilman leimaa', () => {
    const view = new SpoutView();
    view.update(0.016, [{ x: 0, y: 0 }]);
    const spouts = new Spouts();
    spouts.bind(view.group);
    const holder = view.group.children[0]!.getObjectByName('modern-spout')!;
    const [mound, body, stamp] = holder.children as THREE.Mesh[];
    const material = body!.material as THREE.ShaderMaterial;

    spouts.update(eyes);
    expect(material.side).toBe(THREE.FrontSide);
    expect(stamp!.visible).toBe(true);
    // Leima kirjoittaa syvyyden, jotta kaukosumu lasketaan patsaan etäisyydestä.
    expect((stamp!.material as THREE.Material).depthWrite).toBe(true);
    expect(material.depthWrite).toBe(false);
    const peak = material.uniforms.uPeak!.value as number;
    expect(mound!.renderOrder).toBeLessThan(0);

    spouts.update(above);
    expect(material.side).toBe(THREE.BackSide);
    expect(stamp!.visible).toBe(false);
    expect(material.uniforms.uPeak!.value).toBeLessThan(peak);
    expect(mound!.renderOrder).toBeGreaterThan(0);
    spouts.dispose();
  });
});
