import { describe, expect, it } from 'vitest';
import { LookGuard, defaultLook } from './look';

/** Ajaa vahtia tasaisella ruutunopeudella; palauttaa, vaatiko se paluuta Retroon. */
function run(guard: LookGuard, fps: number, seconds: number): boolean {
  let fell = false;
  for (let i = 0; i < fps * seconds; i++) fell = guard.frame(1 / fps) || fell;
  return fell;
}

describe('LookGuard', () => {
  it('ei vaihda ilmettä, kun ruutunopeus riittää', () => {
    expect(run(new LookGuard(), 60, 30)).toBe(false);
    expect(run(new LookGuard(), 33, 30)).toBe(false);
  });

  it('palauttaa Retroon, kun ruutunopeus jää alle 30', () => {
    expect(run(new LookGuard(), 20, 10)).toBe(true);
  });

  it('ei laske kisan alun hitaita ruutuja', () => {
    const guard = new LookGuard();
    expect(run(guard, 10, 2.5)).toBe(false);
    expect(run(guard, 60, 20)).toBe(false);
  });

  it('pitkä tauko ei ole hidas ruutu', () => {
    const guard = new LookGuard();
    run(guard, 60, 5);
    expect(guard.frame(5)).toBe(false);
    expect(run(guard, 60, 10)).toBe(false);
  });

  it('palauttaa Retroon, kun joka ruutu kestää yli puoli sekuntia', () => {
    const guard = new LookGuard();
    let fell = false;
    for (let i = 0; i < 12; i++) fell = guard.frame(0.8) || fell;
    expect(fell).toBe(true);
  });
});

describe('defaultLook', () => {
  it('on Terävä, kun ilmettä ei ole valittu', () => {
    expect(defaultLook(false)).toBe('sharp');
  });

  it('on Retro automaation ohjaamassa selaimessa', () => {
    expect(defaultLook(true)).toBe('retro');
  });
});
