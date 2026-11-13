import { afterEach, describe, expect, it } from 'vitest';
import { setActiveLook } from '../engine/look';
import { SMOOTH_FACTOR, type PixelImage } from '../engine/smoothPixels';
import { fineOutline, paintPixels, uiFont } from './lookArt';
import { sonarColors } from './sonarArt';

/** Kangas, joka muistaa vain kokonsa ja sille piirretyn kuvan mitat. */
function fakeCanvas() {
  const drawn: { width: number; height: number }[] = [];
  const canvas = {
    width: 0,
    height: 0,
    style: {} as Record<string, string>,
    getContext: () => ({
      createImageData: (width: number, height: number) => ({
        width,
        height,
        data: new Uint8ClampedArray(width * height * 4),
      }),
      putImageData: (image: { width: number; height: number }) => drawn.push(image),
    }),
  };
  return { canvas: canvas as unknown as HTMLCanvasElement, drawn };
}

const square = (size: number): PixelImage => ({
  width: size,
  height: size,
  data: new Array<number>(size * size).fill(0x336699),
});

afterEach(() => setActiveLook('retro'));

describe('käyttöliittymän kuvat ilmeen mukaan', () => {
  it('kankaan fontti: Retrossa pikselifontti, Terävällä sileä ja Modernissa teeman fontti pienempänä', () => {
    setActiveLook('retro');
    expect(uiFont(20)).toBe('20px VT323, monospace');
    setActiveLook('sharp');
    expect(uiFont(20)).toContain("'Lunki Silea'");
    setActiveLook('modern');
    const modern = uiFont(20);
    expect(modern).toContain('Alegreya Sans');
    expect(modern).not.toContain('VT323');
    // Leveämpi fontti piirretään pienempänä, jotta rivit mahtuvat.
    expect(Number(/(\d+)px/.exec(modern)![1])).toBeLessThan(20);
  });

  it('tarkan kuvan ääriviiva on puolet tarkkuudesta, vähintään yksi kuvapiste', () => {
    expect(fineOutline(1)).toBe(1);
    expect(fineOutline(2)).toBe(1);
    expect(fineOutline(4)).toBe(2);
  });

  it('laskettu kuva piirretään tarkkana vain Modernissa, ja kankaan koko sivulla ei muutu', () => {
    const calls: number[] = [];
    const fine = (detail: number) => {
      calls.push(detail);
      return square(8 * detail);
    };
    for (const look of ['retro', 'sharp'] as const) {
      setActiveLook(look);
      const { canvas, drawn } = fakeCanvas();
      paintPixels(canvas, square(8), fine);
      expect(calls).toEqual([]);
      expect(drawn[0]!.width).toBe(look === 'retro' ? 8 : 8 * SMOOTH_FACTOR);
    }
    setActiveLook('modern');
    const { canvas, drawn } = fakeCanvas();
    paintPixels(canvas, square(8), fine);
    expect(calls).toEqual([SMOOTH_FACTOR]);
    expect(drawn[0]!.width).toBe(8 * SMOOTH_FACTOR);
    // Ilman tarkkaa versiota Moderni saa saman sileän kuvan kuin Terävä.
    const plain = fakeCanvas();
    paintPixels(plain.canvas, square(8));
    expect(plain.drawn[0]!.width).toBe(8 * SMOOTH_FACTOR);
  });

  it('luotainten vesi on Modernissa järven sinivihreää ja kaiut samat', () => {
    setActiveLook('retro');
    const retro = { ...sonarColors() };
    setActiveLook('sharp');
    expect(sonarColors()).toEqual(retro);
    setActiveLook('modern');
    const modern = sonarColors();
    expect(modern.water).not.toBe(retro.water);
    expect(modern.bottom).toBe(retro.bottom);
    expect(modern.weed).toBe(retro.weed);
    expect(Object.keys(modern).sort()).toEqual(Object.keys(retro).sort());
  });
});
