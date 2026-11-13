import { activeLook, onLookChange, smoothLook } from '../engine/look';
import { pixelBytes, smoothPixels, type PixelImage } from '../engine/smoothPixels';

/**
 * Käyttöliittymän pikselikuvat ilmeen mukaan (#674): Retrossa kuva piirretään
 * pikseleinä, Terävällä samasta kuvasta sileä versio (`smoothPixels`). Kuvan
 * mitat sivulla tulevat aina lähdekuvan pikseleistä, joten asettelu ei muutu.
 */

/** Kankaalle piirrettävän tekstin fontti: Terävällä sileä versio samasta fontista. */
export const uiFont = (px: number): string =>
  `${px}px ${smoothLook(activeLook()) ? "'Lunki Silea', " : ''}VT323, monospace`;

/** Piirtää pikselikuvan kankaalle käytössä olevan ilmeen mukaan. */
export function paintPixels(canvas: HTMLCanvasElement, px: PixelImage): void {
  const image = smoothLook(activeLook()) ? smoothPixels(px) : px;
  canvas.width = image.width;
  canvas.height = image.height;
  const g = canvas.getContext('2d');
  if (!g) return;
  const data = g.createImageData(image.width, image.height);
  data.data.set(pixelBytes(image));
  g.putImageData(data, 0, 0);
}

const tracked = new Set<{ ref: WeakRef<HTMLElement>; draw: (el: never) => void }>();

/**
 * Piirtää elementin kuvan ja piirtää sen uudelleen, kun ilme vaihtuu.
 * `draw` ei saa sulkea elementtiä sisäänsä: se saa elementin parametrina.
 */
export function lookArt<T extends HTMLElement>(el: T, draw: (el: T) => void): T {
  draw(el);
  if (tracked.size > 400) sweep();
  tracked.add({ ref: new WeakRef(el), draw: draw as (el: never) => void });
  return el;
}

function sweep(): void {
  for (const entry of tracked) if (!entry.ref.deref()) tracked.delete(entry);
}

onLookChange(() => {
  for (const entry of tracked) {
    const el = entry.ref.deref();
    if (el) entry.draw(el as never);
    else tracked.delete(entry);
  }
});
