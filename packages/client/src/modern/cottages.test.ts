import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { LUNKINJARVI_SURROUNDINGS } from '@lunki/shared';
import { createCottages, WINDOW_LIGHTS, WindowLights } from './cottages';
import { Land } from './land';
import { SCENERY_COLORS } from './sceneryColors';
import { testWorld } from './testWorld';

describe('mökkien ikkunoiden valot modernissa ilmeessä (#650)', () => {
  const land = new Land(testWorld(), SCENERY_COLORS.summer);
  const buildings = createCottages(LUNKINJARVI_SURROUNDINGS, land);
  const windows = buildings.getObjectByName('modern-windows') as THREE.Mesh;

  it('osa laseista on omassa verkossaan samoilla paikoilla joka kerta', () => {
    expect(windows).toBeDefined();
    const count = windows.geometry.getAttribute('position').count;
    expect(count).toBeGreaterThan(0);
    // Valaistut lasit ovat vain osa rakennuksista: muut osat ovat omissa verkoissaan.
    let rest = 0;
    for (const c of buildings.children)
      if (c !== windows) rest += (c as THREE.Mesh).geometry.getAttribute('position').count;
    expect(count).toBeLessThan(rest * 0.2);
    const again = createCottages(LUNKINJARVI_SURROUNDINGS, land).getObjectByName(
      'modern-windows',
    ) as THREE.Mesh;
    expect(again.geometry.getAttribute('position').count).toBe(count);
    expect(again.geometry.getAttribute('position').getX(7)).toBe(
      windows.geometry.getAttribute('position').getX(7),
    );
  });

  it('valot syttyvät hämärällä ja sammuvat päivällä', () => {
    const day = windows.material;
    const lights = new WindowLights(buildings);
    // Puuttuva tieto on päivä (valikon tausta ennen ensimmäistä kisaa).
    lights.update(undefined);
    expect(lights.lit).toBe(false);
    lights.update(1);
    expect(windows.material).toBe(day);
    lights.update(WINDOW_LIGHTS.below + 0.01);
    expect(lights.lit).toBe(false);

    lights.update(WINDOW_LIGHTS.below - 0.01);
    expect(lights.lit).toBe(true);
    const night = windows.material as THREE.MeshBasicMaterial;
    expect(night).not.toBe(day);
    expect(night.color.getHex()).toBe(WINDOW_LIGHTS.color);
    // Valonlähde kuten taivas ja salama: alfa 0, ohi yön sävytyksen ja sumun.
    expect(night.blendSrcAlpha).toBe(THREE.ZeroFactor);
    expect(night.blendDstAlpha).toBe(THREE.ZeroFactor);
    expect(night.blendSrc).toBe(THREE.OneFactor);

    lights.update(0.8);
    expect(lights.lit).toBe(false);
    expect(windows.material).toBe(day);
  });

  it('ilmeen vaihtuessa lasit palaavat päivän pinnalle', () => {
    const day = windows.material;
    const lights = new WindowLights(buildings);
    lights.update(0.1);
    expect(windows.material).not.toBe(day);
    lights.dispose();
    expect(windows.material).toBe(day);
    expect(lights.lit).toBe(false);
  });

  it('ilman valaistuja laseja ei tee mitään', () => {
    const lights = new WindowLights(new THREE.Group());
    lights.update(0);
    expect(lights.lit).toBe(false);
    lights.dispose();
  });
});
