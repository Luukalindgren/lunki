import { describe, expect, it } from 'vitest';
import { PovCamera, snapAngle, steadyRoll } from './povCamera';

describe('POV-kameran vakautus', () => {
  const step = 0.01;

  it('pieni huojunta ei vaihda porrasta', () => {
    let a = snapAngle(1.0, NaN, step);
    for (const t of [1.003, 0.996, 1.006, 0.995]) {
      const next = snapAngle(t, a, step);
      expect(next).toBe(a);
      a = next;
    }
  });

  it('kääntyminen etenee kokonaisin askelin', () => {
    let a = snapAngle(0, NaN, step);
    for (let t = 0; t <= 0.5; t += 0.002) a = snapAngle(t, a, step);
    expect(Math.abs(a - 0.5)).toBeLessThanOrEqual(step);
    expect(Math.abs(a / step - Math.round(a / step))).toBeLessThan(1e-9);
  });

  it('toimii myös kulman kiertyessä ±π:n yli', () => {
    const a = snapAngle(Math.PI - 0.001, NaN, step);
    const b = snapAngle(-Math.PI + 0.02, a, step);
    expect(b - a).toBeCloseTo(0.02, 1);
  });

  it('pienet kallistukset vaimennetaan pois', () => {
    expect(steadyRoll(0.01)).toBe(0);
    expect(steadyRoll(-0.01)).toBe(-0);
    expect(steadyRoll(0.1)).toBeCloseTo(0.085);
    expect(steadyRoll(-0.1)).toBeCloseTo(-0.085);
  });
});

describe('POV-kameran näkökenttä (#330)', () => {
  it('pikselin koko kasvaa näkökentän mukana', () => {
    const pov = new PovCamera();
    pov.setResolution({ width: 480, height: 270, scale: 4 });
    expect(pov.camera.fov).toBe(72);
    const narrow = pov.pixelSize;
    pov.setFov(90);
    expect(pov.camera.fov).toBe(90);
    expect(pov.pixelSize).toBeGreaterThan(narrow * 1.3);
  });

  it('pystyruudulla kuvaa levennetään oletuksellakin', () => {
    const pov = new PovCamera();
    pov.setResolution({ width: 180, height: 390, scale: 2 });
    expect(pov.camera.fov).toBeGreaterThan(90);
  });
});
