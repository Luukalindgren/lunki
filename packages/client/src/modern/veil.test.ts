import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { fromAbove, GLOW, LIGHT, pixelAt, STAMP, unveil, VEIL, veil } from './veil';

describe('läpikuultavien pintojen sekoitukset (#650)', () => {
  it('läpikuultava pinta ja hehku eivät kirjoita alfaan eivätkä syvyyteen', () => {
    for (const blend of [VEIL, GLOW]) {
      // Alfa = 0 × oma + 1 × kohde: usvan tiheys jää ennalleen.
      expect(blend.blendSrcAlpha).toBe(THREE.ZeroFactor);
      expect(blend.blendDstAlpha).toBe(THREE.OneFactor);
      expect(blend.depthWrite).toBe(false);
      expect(blend.transparent).toBe(true);
    }
    expect(VEIL.blendDst).toBe(THREE.OneMinusSrcAlphaFactor);
    expect(GLOW.blendDst).toBe(THREE.OneFactor);
  });

  it('valonlähde kirjoittaa oman värinsä ja alfaksi nollan', () => {
    expect(LIGHT.blendSrc).toBe(THREE.OneFactor);
    expect(LIGHT.blendDst).toBe(THREE.ZeroFactor);
    expect(LIGHT.blendSrcAlpha).toBe(THREE.ZeroFactor);
    expect(LIGHT.blendDstAlpha).toBe(THREE.ZeroFactor);
  });

  it('leima jättää värin, nostaa alfan täyteen ja kirjoittaa syvyyden', () => {
    expect(STAMP.blendSrc).toBe(THREE.ZeroFactor);
    expect(STAMP.blendDst).toBe(THREE.OneFactor);
    expect(STAMP.blendEquationAlpha).toBe(THREE.MaxEquation);
    expect(STAMP.blendSrcAlpha).toBe(THREE.OneFactor);
    // Kaukosumu lasketaan syvyydestä: ilman sitä pinta saisi taivaan sumun.
    expect(STAMP.depthWrite).toBe(true);
  });

  it('pelin pinta vaihtuu läpikuultavaksi ja takaisin', () => {
    const material = new THREE.MeshBasicMaterial();
    veil(material);
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(material.blending).toBe(THREE.CustomBlending);
    unveil(material);
    expect(material.transparent).toBe(false);
    expect(material.depthWrite).toBe(true);
    expect(material.opacity).toBe(1);
    expect(material.blending).toBe(THREE.NormalBlending);
  });

  it('kuvapisteen koko kasvaa etäisyyden mukana, ylhäältä se on vakio', () => {
    const eyes = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 500);
    eyes.updateMatrixWorld();
    const near = pixelAt(eyes, 720)(new THREE.Vector3(0, 0, -10));
    const far = pixelAt(eyes, 720)(new THREE.Vector3(0, 0, -40));
    expect(far).toBeCloseTo(near * 4);
    // 60 asteen näkökenttä: 10 metrin päässä ruutu on 11,5 m korkea.
    expect(near * 720).toBeCloseTo(2 * 10 * Math.tan(Math.PI / 6));
    expect(fromAbove(eyes)).toBe(false);

    const above = new THREE.OrthographicCamera(-32, 32, 18, -18, 0.1, 500);
    above.zoom = 2;
    const size = pixelAt(above, 720);
    expect(size(new THREE.Vector3(0, 0, -10))).toBeCloseTo(18 / 720);
    expect(size(new THREE.Vector3(5, 0, -90))).toBeCloseTo(18 / 720);
    expect(fromAbove(above)).toBe(true);
  });
});
