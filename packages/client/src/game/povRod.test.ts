import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createFishing, rodTip } from '@lunki/shared';
import { rodSideOffset } from './lineHang';
import { PovCamera } from './povCamera';
import { PovRod } from './povRod';
import { REST_POSE, type RodPose } from './rodMotion';
import { ROD_TIP_Y } from './lineHang';

/** Vapa ja kela kalastajan silmin annetulla sisäisellä resoluutiolla. */
function setup(width: number, height: number) {
  const pov = new PovCamera();
  pov.setResolution({ width, height, scale: 3 });
  const pos = { x: 10, y: 20 };
  const heading = 0.7;
  pov.apply(pos, heading, 0);
  const rod = new PovRod();
  const tip = rodTip(pos, heading);
  const side = rodSideOffset(heading);
  rod.update(
    pov.camera,
    pov.pixelSize,
    pos,
    heading,
    { x: tip.x + side.x, y: tip.y + side.y },
    createFishing(),
    false,
    0xc3cbd2,
  );
  rod.group.updateMatrixWorld(true);
  const toPixel = (p: THREE.Vector3) => {
    const n = p.clone().project(pov.camera);
    return { x: ((n.x + 1) / 2) * width, y: ((1 - n.y) / 2) * height, z: n.z };
  };
  return { pov, rod, toPixel };
}

const vertex = (obj: THREE.Object3D, i: number) => {
  const attr = (obj as THREE.Line).geometry.getAttribute('position') as THREE.BufferAttribute;
  return new THREE.Vector3().fromBufferAttribute(attr, i);
};

describe('virveli kalastajan silmin', () => {
  it('vapa on kaksi pikseliä paksu koko matkalta', () => {
    const { rod, toPixel } = setup(427, 240);
    const [blank, shade] = rod.group.children;
    for (const i of [0, 1]) {
      const a = toPixel(vertex(blank!, i));
      const b = toPixel(vertex(shade!, i));
      const d = [Math.abs(a.x - b.x), Math.abs(a.y - b.y)].sort((p, q) => p - q);
      expect(d[0]).toBeCloseTo(0, 3);
      expect(d[1]).toBeCloseTo(1, 3);
    }
  });

  it.each([
    ['vaaka', 427, 240],
    ['pysty', 130, 282],
  ])('kela näkyy ruudulla (%s)', (_, w, h) => {
    const { rod, toPixel } = setup(w, h);
    const reel = rod.group.children.find((c) => c instanceof THREE.Group)!;
    const p = toPixel(reel.getWorldPosition(new THREE.Vector3()));
    expect(p.z).toBeLessThan(1);
    expect(p.x).toBeGreaterThan(w * 0.05);
    expect(p.x).toBeLessThan(w * 0.95);
    expect(p.y).toBeGreaterThan(h * 0.05);
    expect(p.y).toBeLessThan(h * 0.95);
  });
});

describe('perhovapa kalastajan silmin (#236)', () => {
  it('ohut vihreä aihio, perhokela ja taipuma heitossa', () => {
    const pov = new PovCamera();
    pov.setResolution({ width: 427, height: 240, scale: 3 });
    const pos = { x: 0, y: 0 };
    pov.apply(pos, 0, 0);
    const tip = rodTip(pos, 0);
    const draw = (bend: number) => {
      const rod = new PovRod();
      rod.update(pov.camera, pov.pixelSize, pos, 0, tip, createFishing(), false, 0xc3cbd2, {
        fly: true,
        bend,
      });
      return rod;
    };
    const straight = draw(0);
    const [blank, shade] = straight.group.children;
    expect(shade!.visible).toBe(false);
    expect(((blank as THREE.Line).material as THREE.LineBasicMaterial).color.getHex()).toBe(
      0x6a9a3e,
    );
    // Taipuma siirtää aihion keskikohtaa, kärki pysyy siiman alkupisteessä.
    const bent = draw(0.4).group.children[0]!;
    const mid = 11;
    expect(vertex(bent, mid).y - vertex(blank!, mid).y).toBeGreaterThan(0.05);
    expect(vertex(bent, 23).distanceTo(vertex(blank!, 23))).toBeLessThan(0.01);
  });
});

describe('vavan liike kalastajan silmin', () => {
  const pov = new PovCamera();
  pov.setResolution({ width: 427, height: 240, scale: 3 });
  const pos = { x: 0, y: 0 };
  pov.apply(pos, 0, 0);
  const tip = rodTip(pos, 0);
  const draw = (pose: RodPose) => {
    const rod = new PovRod();
    const end = rod.update(pov.camera, pov.pixelSize, pos, 0, tip, createFishing(), false, 0, {
      pose,
    });
    return { end, blank: rod.group.children[0]! };
  };
  const rest = draw(REST_POSE);

  it('levossa kärki on siiman alkupisteessä', () => {
    expect(rest.end.x).toBeCloseTo(tip.x, 5);
    expect(rest.end.y).toBeCloseTo(tip.y, 5);
    expect(rest.end.h).toBeCloseTo(ROD_TIP_Y, 5);
  });

  it('nykäisy nostaa koko vavan, ja siima lähtee nostetusta kärjestä', () => {
    const lifted = draw({ ...REST_POSE, lift: 0.5 });
    expect(lifted.end.h).toBeGreaterThan(ROD_TIP_Y + 0.3);
    expect(vertex(lifted.blank, 23).y).toBeCloseTo(lifted.end.h, 5);
  });

  it('kala taivuttaa aihion kaarelle ja vetää kärkeä alas kalaa kohti', () => {
    const fish = { x: 15, y: 0, depth: 2 };
    const pose = { lift: 0.45, bend: 0, flex: 0, pull: fish };
    const straight = draw(pose);
    const bent = draw({ ...pose, bend: 1.2 });
    expect(bent.end.h).toBeLessThan(straight.end.h - 0.3);
    // Kaari: aihion keskikohta on kärkien välisen suoran yläpuolella.
    const a = vertex(bent.blank, 0);
    const b = vertex(bent.blank, 23);
    const m = vertex(bent.blank, 11);
    expect(m.y).toBeGreaterThan((a.y + b.y) / 2 + 0.05);
  });
});
