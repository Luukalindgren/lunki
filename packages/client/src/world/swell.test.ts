import { describe, expect, it } from 'vitest';
import { Swell } from './swell';

const at = { x: 120, y: -40 };

describe('aallokko', () => {
  it('pinta liikkuu tasaisesti, vaikka tuuli puuskii pitkän kisan jälkeen', () => {
    const s = new Swell();
    const dt = 1 / 60;
    // Pitkä kisa: kymmenen minuuttia puuskittaista tuulta.
    for (let i = 0; i < 36000; i++) s.update(dt, 12 * (1 + 0.15 * Math.sin(i * dt * 2.3)), 0.4, at);
    let prev = s.sample(at, 0.3).height;
    let maxStep = 0;
    for (let i = 0; i < 600; i++) {
      s.update(dt, 12 * (1 + 0.15 * Math.sin(i * dt * 2.3)), 0.4, at);
      const h = s.sample(at, 0.3).height;
      maxStep = Math.max(maxStep, Math.abs(h - prev));
      prev = h;
    }
    // Noin 0,25 m keinunta ja 3 s jakso: muutos ruudussa on pari senttiä.
    // (Kello · ω -kaavalla vaihe hyppi tässä kymmeniä radiaaneja sekunnissa.)
    expect(maxStep).toBeLessThan(0.02);
  });

  it('tuulen kääntyessä pinta pysyy jatkuvana kalastajan kohdalla', () => {
    const s = new Swell();
    s.update(1 / 60, 10, 0, at);
    const before = s.sample(at, 0.3).height;
    s.update(0, 14, 0.6, at);
    expect(s.sample(at, 0.3).height).toBeCloseTo(before, 6);
  });

  it('korkeus skaalautuu aallonkorkeuden mukaan ja tyynellä pinta on tasainen', () => {
    const s = new Swell();
    for (let i = 0; i < 100; i++) s.update(0.05, 8, 1, at);
    let max = 0;
    for (let x = 0; x < 60; x += 0.5)
      max = Math.max(max, Math.abs(s.sample({ x, y: 3 }, 0.4).height));
    expect(max).toBeGreaterThan(0.1);
    expect(max).toBeLessThan(0.6);
    expect(s.sample({ x: 5, y: 5 }, 0).height).toBeCloseTo(0, 9);
  });
});
