import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Gear } from './gear';
import { Softener } from './soften';

const renderer = {
  capabilities: { getMaxAnisotropy: () => 1 },
} as unknown as THREE.WebGLRenderer;
const camera = new THREE.PerspectiveCamera();
const added = (o: THREE.Object3D) => o.children.filter((c) => c.name === 'modern-gear');
/** Varusteiden läpikäynti on joka 20. ruudulla. */
const settle = (gear: Gear) => {
  for (let i = 0; i < 20; i++) gear.update(camera);
};

describe('kalastajan varusteiden modernit osat (#650)', () => {
  it('valaisee veden alla näkyvät osat ja kelan samalla värillä ja palauttaa ne', () => {
    const scene = new THREE.Scene();
    const wet = new THREE.MeshBasicMaterial({ color: 0x123a5c, depthTest: false });
    const fin: THREE.Mesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.02, 0.2), wet);
    fin.name = 'pov-wet';
    const reel = new THREE.Group();
    reel.name = 'pov-reel';
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.03, 0.02),
      new THREE.MeshBasicMaterial(),
    );
    reel.add(body);
    const foam = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 0.02, 0.02),
      new THREE.MeshBasicMaterial(),
    );
    const rod = new THREE.Group();
    rod.add(reel);
    scene.add(fin, rod, foam);
    const plain = body.geometry;

    const gear = new Gear(scene, renderer);
    const softener = new Softener(scene);
    gear.update(camera);
    softener.update();
    const twin = fin.material as THREE.MeshLambertMaterial;
    expect(twin).toBeInstanceOf(THREE.MeshLambertMaterial);
    expect(twin.depthTest).toBe(false);
    // Peli vaihtaa väriä veden kirkkauden mukaan: sama väri näkyy valaistussa osassa.
    wet.color.setHex(0x335577);
    expect(twin.color.getHex()).toBe(0x335577);
    expect(body.material).toBeInstanceOf(THREE.MeshLambertMaterial);
    // Valaistuksi vaihdettu osa pyöristyy; muu tasavärinen osa jää ennalleen.
    expect(body.geometry).not.toBe(plain);
    expect(foam.material).toBeInstanceOf(THREE.MeshBasicMaterial);

    softener.dispose();
    gear.dispose();
    expect(fin.material).toBe(wet);
    expect(body.material).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(body.geometry).toBe(plain);
  });

  it('lisää ponttoonin kylkeen päällisen ja istuimeen selkänojan', () => {
    const scene = new THREE.Scene();
    const lit = new THREE.MeshLambertMaterial();
    const part = (geometry: THREE.BufferGeometry, name = 'tube') => {
      const mesh = new THREE.Mesh(geometry, lit);
      mesh.name = name;
      return mesh;
    };
    const side = part(
      new THREE.CylinderGeometry(0.2, 0.2, 0.5, 6).rotateZ(Math.PI / 2).translate(0.25, 0, 0.5),
    );
    const tip = part(new THREE.SphereGeometry(0.2, 6, 4));
    // Täyttökisan rengas: peli muotoilee sen itse, joten päällistä ei lisätä.
    const flat = part(new THREE.CylinderGeometry(0.2, 0.2, 0.5, 6));
    flat.userData.reshape = () => undefined;
    const seat = part(new THREE.BoxGeometry(0.46, 0.14, 0.8).translate(0, 0.07, 0), 'seat');
    const player = new THREE.Group();
    player.add(side, tip, flat, seat);
    scene.add(player);

    const gear = new Gear(scene, renderer);
    gear.update(camera);
    expect(added(side)).toHaveLength(1);
    expect(added(tip)).toHaveLength(0);
    expect(added(flat)).toHaveLength(0);
    expect(added(seat)).toHaveLength(1);
    // Päällinen on ponttoonin päällä: ylin kohta vähän pinnan yläpuolella kyljen kohdalla.
    const pad = (added(side)[0] as THREE.Mesh).geometry;
    pad.computeBoundingBox();
    expect(pad.boundingBox!.max.y).toBeCloseTo(0.208, 2);
    expect(pad.boundingBox!.min.y).toBeGreaterThan(0.1);
    expect(pad.boundingBox!.getCenter(new THREE.Vector3()).z).toBeCloseTo(0.5, 2);
    // Selkänoja nousee istuimen päältä.
    expect(added(seat)[0]!.position.y).toBeCloseTo(0.14, 5);

    // Lähtenyt pelaaja: osat poistetaan seuraavalla läpikäynnillä.
    scene.remove(player);
    settle(gear);
    expect(added(side)).toHaveLength(0);
    scene.add(player);
    settle(gear);
    expect(added(side)).toHaveLength(1);
    gear.dispose();
    expect(added(side)).toHaveLength(0);
    expect(added(seat)).toHaveLength(0);
  });

  it('lisää vapaa pitävän käden, joka seuraa kelaa ja on paidan värinen', () => {
    const scene = new THREE.Scene();
    const rod = new THREE.Group();
    const reel = new THREE.Group();
    reel.name = 'pov-reel';
    rod.add(reel);
    const tube = new THREE.Group();
    tube.name = 'pov-tube';
    const shirt = new THREE.MeshLambertMaterial({ color: 0x24502c });
    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.4, 0.05), shirt);
    sleeve.name = 'shirt';
    tube.add(sleeve);
    scene.add(rod, tube);
    camera.position.set(0, 0.55, 0);
    camera.updateMatrixWorld();

    const gear = new Gear(scene, renderer);
    reel.position.set(0.3, 0.4, -0.55);
    gear.update(camera);
    const [grip, arm] = added(rod) as THREE.Mesh[];
    expect(grip!.position.toArray()).toEqual([0.3, 0.4, -0.55]);
    // Hiha alkaa kyynärpäästä silmien alta ja yltää ranteeseen kahvalla.
    expect(arm!.position.y).toBeLessThan(0.3);
    expect(arm!.scale.y).toBeGreaterThan(0.2);
    expect(arm!.scale.y).toBeLessThan(0.9);
    expect((arm!.material as THREE.MeshLambertMaterial).color).toBe(shirt.color);

    reel.position.y = 0.6;
    gear.update(camera);
    expect(grip!.position.y).toBe(0.6);

    gear.dispose();
    expect(added(rod)).toHaveLength(0);
  });
});
