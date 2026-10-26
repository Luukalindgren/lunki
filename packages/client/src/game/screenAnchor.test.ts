import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { screenAnchor } from './screenAnchor';

const rect = { left: 0, top: 0, width: 800, height: 600 };

function povCamera(): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(70, 800 / 600, 0.1, 2000);
  cam.position.set(0, 1.2, 0);
  cam.lookAt(0, 1.2, -10);
  cam.updateMatrixWorld();
  return cam;
}

describe('screenAnchor', () => {
  it('sijoittaa edessä olevan pisteen ruudulle', () => {
    const at = screenAnchor(new THREE.Vector3(0, 1.2, -20), povCamera(), rect);
    expect(at).not.toBeNull();
    expect(at!.x).toBeCloseTo(400);
    expect(at!.y).toBeCloseTo(300);
  });

  it('piilottaa kameran takana olevan pisteen (ei peilikuvaa)', () => {
    // Suoraan takana: ilman z-tarkistusta osuisi keskelle ruutua.
    expect(screenAnchor(new THREE.Vector3(0, 1.5, 20), povCamera(), rect)).toBeNull();
    expect(screenAnchor(new THREE.Vector3(3, 1.5, 40), povCamera(), rect)).toBeNull();
  });

  it('piilottaa sivulla ruudun ulkopuolella olevan pisteen', () => {
    expect(screenAnchor(new THREE.Vector3(50, 1.2, -5), povCamera(), rect)).toBeNull();
  });

  it('toimii ylhäältä katsovalla ortokameralla', () => {
    const cam = new THREE.OrthographicCamera(-50, 50, 50, -50, 0.1, 1000);
    cam.position.set(0, 200, 0);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld();
    const at = screenAnchor(new THREE.Vector3(25, 1.5, 0), cam, rect);
    expect(at!.x).toBeCloseTo(600);
  });
});
