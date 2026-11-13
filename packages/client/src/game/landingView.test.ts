import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { Fish } from '@lunki/shared';
import { LandingView, type LandedFishPose } from './landingView';

const tip = new THREE.Vector3(0, 2, 0);
const tube = { x: 0, y: 0 };
const spriteOf = (view: LandingView) =>
  view.group.children.find((c): c is THREE.Sprite => (c as THREE.Sprite).isSprite)!;

describe('nostonäkymä', () => {
  it('kertoo kalan lajin ja asennon modernia ilmettä varten (#650)', () => {
    const view = new LandingView();
    expect(view.group.name).toBe('landing');
    expect(view.group.children.some((c) => c.name === 'landing-net')).toBe(true);
    const sprite = spriteOf(view);
    const fish = { species: 'pike', weight: 2, pos: { x: 3, y: 1 }, heading: 0.8 } as Fish;

    // Väsynyt kala kyljellään pinnassa.
    view.update(fish, true, tip, tube, 0);
    const surfaced = sprite.userData.fish as LandedFishPose;
    expect(surfaced.species).toBe('pike');
    expect(surfaced.hang).toBe(0);
    expect(surfaced.heading).toBe(0.8);

    // Ei kalaa: asento tyhjenee kuvan mukana.
    view.update(null, false, tip, tube, 0);
    expect(sprite.visible).toBe(false);
    expect(sprite.userData.fish).toBeNull();

    // Nosto siimasta kalastajan silmin: kala roikkuu pää ylöspäin.
    view.pov = true;
    view.start({ by: 'hand', at: { x: 3, y: 1 } }, 'perch', 0.3);
    view.update(null, false, tip, tube, 0);
    const lifted = sprite.userData.fish as LandedFishPose;
    expect(lifted.species).toBe('perch');
    expect(lifted.hang).toBe(1);
    view.dispose();
  });
});
