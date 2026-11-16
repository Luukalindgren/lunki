import { describe, expect, it } from 'vitest';
import { PovCamera, cameraAngles, snapAngle, steadyRoll } from './povCamera';

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

describe('cameraAngles', () => {
  const step = { angle: 0.005, roll: 0.0055 };
  /** Aallokon keinunta: nyökkäys ja kallistus hitaana siniaaltona, askel 1/60 s. */
  const sway = (smooth: boolean) => {
    let a = { yaw: NaN, pitch: NaN, roll: NaN };
    const out: { yaw: number; pitch: number; roll: number }[] = [];
    for (let i = 0; i < 240; i++) {
      const t = i / 60;
      const target = { yaw: 1, pitch: 0.04 * Math.sin(t * 3), roll: 0.03 * Math.sin(t * 2.2) };
      a = cameraAngles(target, a, step, smooth);
      out.push(a);
    }
    return out;
  };
  const largest = (v: number[]) => Math.max(...v.slice(1).map((x, i) => Math.abs(x - v[i]!)));

  it('Terävässä ja Modernissa kamera seuraa keinuntaa portaitta', () => {
    const frames = sway(true);
    // Suurin muutos ruudusta toiseen on murto-osa sisäisestä pikselistä.
    expect(largest(frames.map((f) => f.pitch))).toBeLessThan(step.angle * 0.5);
    expect(largest(frames.map((f) => f.roll))).toBeLessThan(step.roll * 0.5);
    expect(frames[30]!.pitch).toBeCloseTo(0.04 * Math.sin(1.5), 10);
    // Pienikin kallistus näkyy: kuollutta aluetta ei ole.
    expect(cameraAngles({ yaw: 0, pitch: 0, roll: 0.01 }, frames[0]!, step, true).roll).toBe(0.01);
  });

  it('Retrossa kulmat pysyvät kokonaisissa pikseleissä', () => {
    const frames = sway(false);
    for (const f of frames) {
      expect(Math.abs(f.pitch / step.angle - Math.round(f.pitch / step.angle))).toBeLessThan(1e-9);
      expect(Math.abs(f.roll / step.roll - Math.round(f.roll / step.roll))).toBeLessThan(1e-9);
    }
    expect(
      cameraAngles({ yaw: 0, pitch: 0, roll: 0.01 }, { yaw: 0, pitch: 0, roll: NaN }, step, false)
        .roll,
    ).toBe(0);
  });
});
