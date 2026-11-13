import { activeLook, onLookChange, smoothLook } from '../engine/look';
import { pixelBytes, SMOOTH_FACTOR, smoothPixels, type PixelImage } from '../engine/smoothPixels';

/**
 * Käyttöliittymän pikselikuvat ilmeen mukaan (#674): Retrossa kuva piirretään
 * pikseleinä, Terävällä samasta kuvasta sileä versio (`smoothPixels`) ja
 * Modernissa (#650) laskemalla piirretty kuva suoraan tarkempana. Kuvan
 * mitat sivulla tulevat aina lähdekuvan pikseleistä, joten asettelu ei muutu.
 */

/** Modernin teeman tekstifontti kankaalle (`modern/theme.css`, `--text-font`) ja sen koko pelin fontista. */
const MODERN_FONT = { family: "'Alegreya Sans', 'Segoe UI', sans-serif", weight: 700, size: 0.82 };

/**
 * Kankaalle piirrettävän tekstin fontti: Terävällä sileä versio samasta
 * fontista, Modernissa teeman tekstifontti hieman pienempänä, koska se on
 * pikselifonttia leveämpi.
 */
export const uiFont = (px: number): string => {
  const look = activeLook();
  if (look === 'modern')
    return `${MODERN_FONT.weight} ${Math.round(px * MODERN_FONT.size)}px ${MODERN_FONT.family}`;
  return `${px}px ${smoothLook(look) ? "'Lunki Silea', " : ''}VT323, monospace`;
};

/** Ääriviivan paksuus kuvapisteinä, kun kuva lasketaan `detail` kertaa tarkempana. */
export const fineOutline = (detail: number): number => Math.max(1, detail >> 1);

/**
 * Piirtää pikselikuvan kankaalle käytössä olevan ilmeen mukaan. Laskemalla
 * piirretty kuva voi antaa saman piirroksen suoraan tarkempana (`fine`,
 * kerroin = kuvapisteitä lähdepikselin sivulla): Moderni käyttää sitä, jolloin
 * muodot ovat sileitä eivätkä pyöristettyjä pikseleitä. Kuvan mitat sivulla
 * pysyvät samoina, koska tarkka kuva on tasan kertoimen verran suurempi.
 */
export function paintPixels(
  canvas: HTMLCanvasElement,
  px: PixelImage,
  fine?: (detail: number) => PixelImage,
): void {
  const look = activeLook();
  const image =
    look === 'modern' && fine ? fine(SMOOTH_FACTOR) : smoothLook(look) ? smoothPixels(px) : px;
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
