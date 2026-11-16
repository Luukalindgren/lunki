import { afterEach, describe, expect, it } from 'vitest';
import { setActiveLook } from '../engine/look';
import { TopDownCamera } from './topDownCamera';

describe('ylhäältä katsova kamera', () => {
  afterEach(() => setActiveLook('retro'));

  const moved = () => {
    const cam = new TopDownCamera();
    cam.setResolution({ width: 480, height: 270, scale: 4 });
    cam.snapTo({ x: 10, y: 20 });
    cam.follow({ x: 11, y: 20 }, 1 / 60, 60);
    return cam;
  };

  it('Terävässä ja Modernissa kamera liukuu askelten välillä portaatta', () => {
    setActiveLook('sharp');
    const cam = moved();
    cam.apply(0);
    expect(cam.camera.position.x).toBe(10);
    cam.apply(0.5);
    const half = cam.camera.position.x;
    cam.apply(1);
    expect(cam.camera.position.x).toBe(cam.center.x);
    expect(half).toBeCloseTo((10 + cam.center.x) / 2);
    expect(cam.camera.position.z).toBe(-20);
  });

  it('Retrossa kamera pysyy sisäisen pikselin rajalla', () => {
    setActiveLook('retro');
    const cam = moved();
    const m = cam.metersPerPixel;
    for (const alpha of [0, 0.3, 0.7, 1]) {
      cam.apply(alpha);
      expect(cam.camera.position.x / m).toBeCloseTo(Math.round(cam.camera.position.x / m));
    }
  });

  it('ruudun piste osuu samaan kohtaan kuin piirretty kuva', () => {
    setActiveLook('sharp');
    const cam = moved();
    cam.apply(0.5);
    const mid = cam.internalToWorld(240, 135);
    expect(mid.x).toBeCloseTo(cam.camera.position.x);
    expect(mid.y).toBeCloseTo(-cam.camera.position.z);
  });
});
