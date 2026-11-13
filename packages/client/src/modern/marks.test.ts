import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Marks } from './marks';
import { Softener } from './soften';

const camera = new THREE.PerspectiveCamera();
camera.position.set(0, 2, 0);
camera.lookAt(0, 0, -10);
camera.updateMatrixWorld();

/** Pelin roiskerenkaat: ryhmä `splash-rings` ja renkaat sen lapsina. */
function rings() {
  const scene = new THREE.Scene();
  const group = new THREE.Group();
  group.name = 'splash-rings';
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 12), new THREE.MeshBasicMaterial());
  ring.userData.shape = 'ripple';
  group.add(ring);
  scene.add(group);
  return { scene, ring };
}

/** Pelin vieheen merkki: ryhmä `lure-marker` ja pikselitimantti. */
function marker() {
  const scene = new THREE.Scene();
  const group = new THREE.Group();
  group.name = 'lure-marker';
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x4dd06a }));
  group.add(sprite);
  scene.add(group);
  const gem = () => group.children.find((c) => c.name === 'modern-mark') as THREE.Mesh | undefined;
  return { scene, group, sprite, gem };
}

describe('veden pinnan merkit modernissa ilmeessä (#650)', () => {
  it('haalistaa roiskerenkaan iän mukana ja palauttaa sen peittäväksi', () => {
    const { scene, ring } = rings();
    const material = ring.material as THREE.MeshBasicMaterial;
    const marks = new Marks(scene);
    ring.userData.life = 0;
    marks.update(camera);
    expect(material.transparent).toBe(true);
    const fresh = material.opacity;
    expect(fresh).toBeGreaterThan(0.7);
    ring.userData.life = 0.6;
    marks.update(camera);
    expect(material.opacity).toBeLessThan(fresh * 0.5);
    ring.userData.life = 1;
    marks.update(camera);
    expect(material.opacity).toBe(0);
    // Usvan tiheys on alfakanavassa: rengas ei kirjoita siihen.
    expect(material.blendSrcAlpha).toBe(THREE.ZeroFactor);

    marks.dispose();
    expect(material.transparent).toBe(false);
    expect(material.opacity).toBe(1);
    expect(material.blending).toBe(THREE.NormalBlending);
  });

  it('piirtää roiskerenkaan väreenä ja pyöristää muut pinnan merkit', () => {
    const { scene, ring } = rings();
    const aim = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.8, 8), new THREE.MeshBasicMaterial());
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.15, 6), new THREE.MeshBasicMaterial());
    const moved = new THREE.Mesh(
      new THREE.RingGeometry(3, 12, 16).translate(0, 0, 1),
      new THREE.MeshBasicMaterial(),
    );
    scene.add(aim, shadow, moved);
    const plain = [ring, aim, shadow, moved].map((m) => m.geometry);
    const softener = new Softener(scene);
    softener.update();
    // Väre: kaksi ohutta kehää pelin renkaan säteellä.
    ring.geometry.computeBoundingBox();
    expect(ring.geometry.boundingBox!.max.x).toBeCloseTo(1, 2);
    expect(ring.geometry.getAttribute('position').count).toBeGreaterThan(200);
    expect((aim.geometry as THREE.RingGeometry).parameters.thetaSegments).toBe(48);
    expect((aim.geometry as THREE.RingGeometry).parameters.innerRadius).toBe(0.5);
    expect((shadow.geometry as THREE.CircleGeometry).parameters.segments).toBe(32);
    // Muokattua muotoa ei vaihdeta.
    expect(moved.geometry).toBe(plain[3]);
    softener.dispose();
    expect([ring, aim, shadow, moved].map((m) => m.geometry)).toEqual(plain);
  });

  it('piirtää vieheen merkin timanttina kuvan paikalle, kokoon ja väriin', () => {
    const { scene, sprite, gem } = marker();
    sprite.position.set(1, 0.06, -8);
    sprite.scale.set(0.02, 0.02, 1);
    sprite.material.sizeAttenuation = false;
    sprite.center.set(0.5, 0);
    const marks = new Marks(scene);
    marks.update(camera);
    expect(sprite.visible).toBe(false);
    const mesh = gem()!;
    // Silmin koko on kuvapisteinä: kasvaa etäisyyden mukana. Timantti seisoo pinnalla.
    const depth = -sprite.position.clone().applyMatrix4(camera.matrixWorldInverse).z;
    expect(mesh.scale.x).toBeCloseTo(0.02 * depth);
    expect(mesh.position.y).toBeCloseTo(0.06 + mesh.scale.x / 2);
    // Tärpissä merkki painuu pinnan alle kuvan ankkurin mukana.
    sprite.center.y = 0.5;
    marks.update(camera);
    expect(mesh.position.y).toBeCloseTo(0.06);
    // Tilan väri seuraa pelin väriä.
    sprite.material.color.setHex(0xd23a2a);
    expect((mesh.material as THREE.MeshLambertMaterial).color.getHex()).toBe(0xd23a2a);

    // Ylhäältä koko on metreinä ja kärjet ilmansuunnissa.
    const top = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
    top.position.set(0, 50, 0);
    top.lookAt(0, 0, 0);
    top.updateMatrixWorld();
    sprite.material.sizeAttenuation = true;
    sprite.scale.set(0.9, 0.9, 1);
    marks.update(top);
    expect(mesh.scale.x).toBeCloseTo(0.9);
    expect(mesh.rotation.y).toBe(0);

    marks.dispose();
    expect(gem()).toBeUndefined();
    expect(sprite.visible).toBe(true);
  });
});
