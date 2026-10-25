import { describe, expect, it } from 'vitest';
import { halveSprite, spriteMipmaps, type Rgba } from './pixelMipmaps';

const image = (width: number, height: number, opaque: (x: number, y: number) => boolean): Rgba => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = 200;
      data[i + 1] = 100;
      data[i + 2] = 50;
      data[i + 3] = opaque(x, y) ? 255 : 0;
    }
  return { width, height, data };
};

describe('pikselispritejen mipmapit', () => {
  it('ohut runko säilyy ja väri ei tummu läpinäkyvästä taustasta', () => {
    // Yhden pikselin levyinen pystyviiva.
    const half = halveSprite(image(4, 4, (x) => x === 1));
    expect(half.width).toBe(2);
    expect(half.height).toBe(2);
    expect(half.data[3]).toBe(255);
    expect(half.data[0]).toBe(200);
    expect(half.data[7]).toBe(0);
  });

  it('yksittäinen pikseli katoaa', () => {
    const half = halveSprite(image(2, 2, (x, y) => x === 0 && y === 0));
    expect(half.data[3]).toBe(0);
  });

  it('ketju jatkuu 1×1:een', () => {
    const levels = spriteMipmaps(image(64, 32, () => true));
    expect(levels.map((l) => `${l.width}x${l.height}`)).toEqual([
      '32x16',
      '16x8',
      '8x4',
      '4x2',
      '2x1',
      '1x1',
    ]);
    expect(levels.at(-1)!.data[3]).toBe(255);
  });
});
