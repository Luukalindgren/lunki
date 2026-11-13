import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Softener, bakedTransform, softGeometry } from './soften';

const box = (g: THREE.BufferGeometry) => {
  g.computeBoundingBox();
  return [...g.boundingBox!.min.toArray(), ...g.boundingBox!.max.toArray()];
};

describe('perusmuotojen pehmennys (#650)', () => {
  it('löytää muotoon leivotun siirron ja kierron', () => {
    const shapes = [
      new THREE.BoxGeometry(0.3, 0.1, 0.6),
      new THREE.SphereGeometry(0.16, 8, 6),
      new THREE.CylinderGeometry(0.1, 0.07, 0.5, 6),
      new THREE.TorusGeometry(0.4, 0.1, 6, 4, Math.PI / 2),
    ];
    for (const g of shapes) {
      g.rotateZ(0.7)
        .rotateX(-Math.PI / 2)
        .translate(0.4, 0.15, -0.3);
      const m = bakedTransform(g)!;
      expect(m).not.toBeNull();
      const expected = new THREE.Matrix4()
        .makeTranslation(0.4, 0.15, -0.3)
        .multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2))
        .multiply(new THREE.Matrix4().makeRotationZ(0.7));
      m.elements.forEach((v, i) => expect(v).toBeCloseTo(expected.elements[i]!, 5));
    }
  });

  it('pehmeä muoto on samassa paikassa ja samankokoinen, mutta tiheämpi', () => {
    const hard = new THREE.BoxGeometry(0.3, 0.46, 0.56).translate(0.1, 0.23, 0);
    const soft = softGeometry(hard)!;
    box(soft).forEach((v, i) => expect(v).toBeCloseTo(box(hard)[i]!, 3));
    expect(soft.getAttribute('position').count).toBeGreaterThan(
      hard.getAttribute('position').count,
    );

    const tube = new THREE.CylinderGeometry(0.1, 0.1, 0.5, 6).rotateZ(Math.PI / 2);
    const round = softGeometry(tube)!;
    expect((round as THREE.CylinderGeometry).parameters.radialSegments).toBeGreaterThanOrEqual(20);
    // Kuusikulmion kulmat ovat samalla säteellä kuin pyöreän lieriön kehä.
    round.computeBoundingBox();
    expect(round.boundingBox!.max.y).toBeCloseTo(0.1, 3);
    expect(round.boundingBox!.max.x).toBeCloseTo(0.25, 3);
  });

  it('jättää särmiöt, muokatut muodot ja muut kuin perusmuodot ennalleen', () => {
    expect(softGeometry(new THREE.CylinderGeometry(0.1, 0.1, 0.3, 4))).toBeNull();
    const bent = new THREE.BoxGeometry(1, 1, 1);
    bent.getAttribute('position').setX(0, 3);
    expect(softGeometry(bent)).toBeNull();
    expect(softGeometry(new THREE.PlaneGeometry(1, 1))).toBeNull();
    const mirrored = new THREE.BoxGeometry(1, 2, 3).scale(-1, 1, 1);
    expect(softGeometry(mirrored)).toBeNull();
  });

  it('vaihtaa valaistujen osien muodot ja palauttaa ne, kun ilme vaihtuu pois', () => {
    const scene = new THREE.Scene();
    const lit = new THREE.MeshLambertMaterial();
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 0.6), lit);
    const twin: THREE.Mesh = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 0.6), lit);
    const marker = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    const world = new THREE.Group();
    world.name = 'static-pov';
    const house = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 5), lit);
    world.add(house);
    scene.add(torso, twin, marker, world);
    const originals = [torso, twin, marker, house].map((m) => m.geometry);

    const softener = new Softener(scene);
    softener.update();
    expect(torso.geometry).not.toBe(originals[0]);
    // Sama muoto jaetaan pelaajien kesken.
    expect(twin.geometry).toBe(torso.geometry);
    expect(marker.geometry).toBe(originals[2]);
    expect(house.geometry).toBe(originals[3]);

    // Peli vaihtaa osan muodon: uusi muoto pehmenee seuraavalla läpikäynnillä.
    const changed = new THREE.SphereGeometry(0.2, 8, 6);
    twin.geometry = changed;
    for (let i = 0; i < 20; i++) softener.update();
    expect(twin.geometry).not.toBe(changed);

    softener.dispose();
    expect(torso.geometry).toBe(originals[0]);
    expect(twin.geometry).toBe(changed);
  });

  it('jättää valmiiksi pyöreän muodon ennalleen', () => {
    expect(softGeometry(new THREE.CylinderGeometry(0.1, 0.1, 0.5, 24))).toBeNull();
    expect(softGeometry(new THREE.SphereGeometry(0.2, 24, 16))).toBeNull();
    expect(softGeometry(new THREE.TorusGeometry(0.4, 0.1, 16, 48))).toBeNull();
  });

  it('pehmentää pelin muokkaaman muodon lepomuodosta ja antaa sille oman kopion', () => {
    const scene = new THREE.Scene();
    const lit = new THREE.MeshLambertMaterial();
    const make = () => new THREE.CylinderGeometry(0.2, 0.2, 0.6, 6).rotateZ(Math.PI / 2);
    const pontoon = new THREE.Mesh(make(), lit);
    const other = new THREE.Mesh(make(), lit);
    // Peli on litistänyt ponttoonin; lepomuoto kulkee muodon mukana.
    const flat = pontoon.geometry;
    flat.userData.rest = new Float32Array(flat.getAttribute('position').array);
    flat.scale(1, 0.3, 1);
    let fitted = 0;
    pontoon.userData.reshape = () => fitted++;
    scene.add(pontoon, other);

    const softener = new Softener(scene);
    softener.update();
    expect(pontoon.geometry).not.toBe(flat);
    expect(pontoon.geometry).not.toBe(other.geometry);
    expect(fitted).toBe(1);
    // Uusi muoto on täysi: peli sovittaa sen täyttöön itse.
    pontoon.geometry.computeBoundingBox();
    expect(pontoon.geometry.boundingBox!.max.y).toBeCloseTo(0.2, 3);

    softener.dispose();
    expect(pontoon.geometry).toBe(flat);
    expect(fitted).toBe(2);
  });

  it('vaihtaa nimetyn osan muotoiltuun malliin samoihin mittoihin', () => {
    const scene = new THREE.Scene();
    const fin = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.05, 0.22).translate(0.3, 0.1, 0),
      new THREE.MeshLambertMaterial(),
    );
    fin.userData.shape = 'fin';
    scene.add(fin);
    const hard = box(fin.geometry);
    const softener = new Softener(scene);
    softener.update();
    const soft = box(fin.geometry);
    // Kantapäästä kärkeen ja laidasta laitaan sama; lapa on ohut.
    expect(soft[0]).toBeGreaterThanOrEqual(hard[0]! - 0.03);
    expect(soft[3]).toBeCloseTo(hard[3]!, 2);
    expect(soft[2]).toBeCloseTo(hard[2]!, 1);
    expect(soft[5]).toBeCloseTo(hard[5]!, 1);
    expect(fin.geometry.getAttribute('position').count).toBeGreaterThan(200);
    softener.dispose();
    expect(box(fin.geometry)).toEqual(hard);
  });

  it('palauttaa pinnan oikeat normaalit, jotka peli on kallistanut ylös', () => {
    const scene = new THREE.Scene();
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshLambertMaterial());
    const normal = wall.geometry.getAttribute('normal') as THREE.BufferAttribute;
    wall.geometry.userData.normals = new Float32Array(normal.array);
    for (let i = 0; i < normal.count; i++) normal.setXYZ(i, 0, 1, 0);
    scene.add(wall);
    const lifted = wall.geometry;
    const softener = new Softener(scene);
    softener.update();
    expect(wall.geometry).not.toBe(lifted);
    expect(wall.geometry.getAttribute('normal').getZ(0)).toBe(1);
    softener.dispose();
    expect(wall.geometry).toBe(lifted);
  });
});
