import { describe, expect, it } from 'vitest';
import type { Sprite } from 'three';
import { FloatMarker } from './floatMarker';

const input = { at: { x: 10, y: 5 }, height: 0, pov: true, pixel: 0.01, dip: 0 };

describe('ongen koho', () => {
  it('makaa kyljellään siiman suuntaisena, kun syötti on pohjassa (#799)', () => {
    const m = new FloatMarker();
    const sprite = m.group.children[0] as Sprite;
    m.update(input);
    expect(sprite.material.rotation).toBe(0);
    expect(m.group.userData.lie).toBeNull();

    m.update({ ...input, lie: { x: 0, y: 1 } });
    expect(sprite.material.rotation).toBeCloseTo(Math.PI / 2);
    expect(m.group.userData.lie).toBeCloseTo(Math.PI / 2);
    // Ylhäältä sivukuva käännetään siiman suuntaan.
    m.update({ ...input, pov: false, lie: { x: 1, y: 0 } });
    expect(sprite.material.rotation).toBeCloseTo(-Math.PI / 2);
  });

  it('nousee tärpissä pystyyn', () => {
    const m = new FloatMarker();
    const sprite = m.group.children[0] as Sprite;
    m.update({ ...input, dip: 0.25, lie: { x: 0, y: 1 } });
    expect(sprite.material.rotation).toBe(0);
    expect(m.group.userData.lie).toBeNull();
  });
});
