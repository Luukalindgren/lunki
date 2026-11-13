import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { LandedFishPose } from '../game/landingView';
import { fishTurn, Landing } from './landing';

const camera = new THREE.PerspectiveCamera();
camera.position.set(0, 1, 5);
camera.updateMatrixWorld();

/** Pelin nostonäkymä: kalan kuva, haavi viivoista ja siima. */
function landing() {
  const scene = new THREE.Scene();
  const group = new THREE.Group();
  group.name = 'landing';
  const sprite = new THREE.Sprite();
  sprite.visible = false;
  const net = new THREE.Group();
  net.name = 'landing-net';
  const line = (points: [number, number, number][]) =>
    new THREE.BufferGeometry().setFromPoints(points.map((p) => new THREE.Vector3(...p)));
  const ring = new THREE.LineSegments(
    line([
      [0.4, 0, 0],
      [0, 0, 0.4],
      [-0.4, 0, 0],
      [0, 0, -0.4],
    ]),
    new THREE.LineBasicMaterial({ color: 0x3d3428 }),
  );
  const bag = new THREE.LineSegments(
    line([
      [0.4, 0, 0],
      [0.1, -0.35, 0],
    ]),
    new THREE.LineBasicMaterial({ color: 0x8a949e }),
  );
  const handle = new THREE.Line(
    line([
      [-0.4, 0, 0],
      [-0.4, 0.3, 1.2],
    ]),
    new THREE.LineBasicMaterial(),
  );
  net.add(ring, bag, handle);
  net.userData.handle = handle;
  group.add(sprite, net);
  scene.add(group);
  return { scene, group, sprite, net, ring, bag, handle };
}

const fishOf = (group: THREE.Object3D) =>
  group.children.find((c) => c.name === 'modern-landing') as THREE.Mesh;

describe('nosto modernissa ilmeessä (#650)', () => {
  it('piirtää kalan kuvan tilalle lajin mallin samaan paikkaan ja kokoon', () => {
    const { scene, group, sprite } = landing();
    const look = new Landing(scene);
    look.update(camera);
    const fish = fishOf(group);
    expect(fish.visible).toBe(false);

    sprite.visible = true;
    sprite.position.set(2, 0.04, -3);
    sprite.scale.set(0.7, 0.2, 1);
    sprite.userData.fish = {
      species: 'pike',
      hang: 0,
      wiggle: 0,
      heading: 0.5,
    } satisfies LandedFishPose;
    look.update(camera);
    expect(sprite.visible).toBe(false);
    expect(fish.visible).toBe(true);
    expect(fish.position.equals(sprite.position)).toBe(true);
    expect(fish.scale.x).toBeCloseTo(0.7);
    const pike = fish.geometry;
    expect(pike.getAttribute('position').count).toBeGreaterThan(2000);

    // Laji vaihtuu: malli vaihtuu, ja sama laji saa saman mallin uudelleen.
    sprite.userData.fish = { species: 'perch', hang: 1, wiggle: 0, heading: 0 };
    look.update(camera);
    expect(fish.geometry).not.toBe(pike);
    sprite.userData.fish = { species: 'pike', hang: 0, wiggle: 0, heading: 0 };
    look.update(camera);
    expect(fish.geometry).toBe(pike);

    // Peli piilottaa kalan: malli piiloon.
    sprite.userData.fish = null;
    look.update(camera);
    expect(fish.visible).toBe(false);

    sprite.userData.fish = { species: 'pike', hang: 0, wiggle: 0, heading: 0 };
    look.dispose();
    expect(fishOf(group)).toBeUndefined();
    expect(sprite.visible).toBe(true);
  });

  it('kääntää kalan kyljelleen kuono kulkusuuntaan tai roikkumaan pää ylöspäin', () => {
    const at = new THREE.Vector3(0, 0.5, 0);
    const nose = new THREE.Vector3();
    const side = new THREE.Vector3();
    const turn = (pose: LandedFishPose) => {
      const q = fishTurn(new THREE.Quaternion(), pose, at, camera);
      nose.set(1, 0, 0).applyQuaternion(q);
      side.set(0, 0, 1).applyQuaternion(q);
    };
    // Kyljellään: kuono suuntaan (järven y on maailman -z). Silmin kylki
    // kallistuu katsojaan päin kummin päin kala onkin.
    const lying: LandedFishPose = { species: 'pike', hang: 0, wiggle: 0, heading: Math.PI / 2 };
    turn(lying);
    expect(nose.x).toBeCloseTo(0);
    expect(nose.z).toBeCloseTo(-1);
    for (const heading of [0, Math.PI]) {
      turn({ ...lying, heading });
      const up = Math.abs(side.y) > 0.8 ? Math.sign(side.y) : 0;
      expect(up).not.toBe(0);
      // Ylöspäin oleva kylki katsoo kameraan (+z).
      expect(side.z * up).toBeGreaterThan(0.3);
    }
    // Ylhäältä kala on aivan kyljellään.
    const top = new THREE.OrthographicCamera();
    top.position.set(0, 50, 0);
    top.updateMatrixWorld();
    fishTurn(new THREE.Quaternion(), lying, at, top);
    side.set(0, 0, 1).applyQuaternion(fishTurn(new THREE.Quaternion(), lying, at, top));
    expect(Math.abs(side.y)).toBeCloseTo(1);
    // Siimassa: kuono ylös ja kylki kameraan päin.
    turn({ species: 'pike', hang: 1, wiggle: 0, heading: 0 });
    expect(nose.y).toBeCloseTo(1);
    expect(side.z).toBeCloseTo(1);
  });

  it('tekee haavista kehän, pussin ja varren ja palauttaa pelin viivat', () => {
    const { scene, net, ring, bag, handle } = landing();
    const look = new Landing(scene);
    look.update(camera);
    expect([ring, bag, handle].map((o) => o.visible)).toEqual([false, false, false]);
    const added = net.children.filter((c) => c.name === 'modern-landing');
    expect(added).toHaveLength(3);
    const [rim, shaft, web] = added as [THREE.Mesh, THREE.Mesh, THREE.LineSegments];
    // Kehä on pelin kehän kokoinen ja samaa väriä.
    rim.geometry.computeBoundingSphere();
    expect(rim.geometry.boundingSphere!.radius).toBeCloseTo(0.4, 1);
    expect((rim.material as THREE.MeshLambertMaterial).color.getHex()).toBe(0x3d3428);
    // Pussi ulottuu pelin pussin syvyyteen.
    web.geometry.computeBoundingBox();
    expect(web.geometry.boundingBox!.min.y).toBeCloseTo(-0.35, 2);
    // Varsi kulkee pelin varsiviivan päästä päähän.
    expect(shaft.position.x).toBeCloseTo(-0.4);
    expect(shaft.scale.y).toBeCloseTo(Math.hypot(0.3, 1.2));
    shaft.updateMatrix();
    const tip = new THREE.Vector3(0, 1, 0).applyMatrix4(shaft.matrix);
    expect(tip.z).toBeCloseTo(1.2);

    look.dispose();
    expect(net.children).toHaveLength(3);
    expect([ring, bag, handle].map((o) => o.visible)).toEqual([true, true, true]);
  });
});
