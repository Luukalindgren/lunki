/**
 * Pikselikuvan terävä versio Terävälle ilmeelle (#674): sama kuva
 * moninkertaisella tarkkuudella niin, että väripintojen portaat ovat sileitä
 * kaaria ja vinoviivoja. Värit eivät sekoitu: jokainen uusi kuvapiste saa sen
 * lähdevärin, jota sen ympärillä on painotettuna eniten, joten kuva pysyy
 * samana piirroksena eikä uutta taidetta tarvitse ylläpitää rinnalla.
 */
export interface PixelImage {
  width: number;
  height: number;
  /** Värit riveittäin (0xRRGGBB), -1 = läpinäkyvä. */
  data: ArrayLike<number>;
}

/** Montako kuvapistetta terävässä kuvassa on lähdepikselin sivulla. */
export const SMOOTH_FACTOR = 4;

/** Painon leveys lähdepikseleinä: pieni pitää yksittäiset pikselit (silmät) tallessa. */
const SIGMA = 0.45;
/** Näin lähellä toisiaan olevat painot ovat tasapeli. */
const TIE = 0.02;

const luma = (c: number) =>
  ((c >> 16) & 0xff) * 0.299 + ((c >> 8) & 0xff) * 0.587 + (c & 0xff) * 0.114;

/**
 * Tasapelissä (vinon viivan kulma) voittaa näkyvä väri läpinäkyvän yli ja
 * tummempi vaaleamman yli: ääriviivat ja ohuet viivat pysyvät yhtenäisinä.
 */
const beats = (a: number, wa: number, b: number, wb: number): boolean => {
  if (Math.abs(wa - wb) > TIE) return wa > wb;
  if (a < 0 !== b < 0) return b < 0;
  return luma(a) < luma(b);
};

export function smoothPixels(px: PixelImage, factor = SMOOTH_FACTOR): PixelImage {
  const { width: w, height: h } = px;
  const W = w * factor;
  const H = h * factor;
  const out = new Int32Array(W * H);
  // Painot ovat samat joka lähdepikselin sisällä: lasketaan kerran.
  const weights: number[][] = [];
  for (let s = 0; s < factor; s++) {
    const at = (s + 0.5) / factor - 0.5;
    weights.push([-1, 0, 1].map((d) => Math.exp(-((d - at) ** 2) / (2 * SIGMA * SIGMA))));
  }
  const colors = new Int32Array(9);
  const sums = new Float64Array(9);
  for (let y = 0; y < H; y++) {
    const sy = Math.floor(y / factor);
    const wy = weights[y % factor]!;
    for (let x = 0; x < W; x++) {
      const sx = Math.floor(x / factor);
      const wx = weights[x % factor]!;
      let n = 0;
      for (let j = -1; j <= 1; j++) {
        const yy = sy + j;
        for (let i = -1; i <= 1; i++) {
          const xx = sx + i;
          // Kuvan reunalla jatkuu reunan väri: koko alan täyttävä kuva pysyy suorakulmaisena.
          const c =
            px.data[Math.min(h - 1, Math.max(0, yy)) * w + Math.min(w - 1, Math.max(0, xx))]!;
          const weight = wx[i + 1]! * wy[j + 1]!;
          let k = 0;
          while (k < n && colors[k] !== c) k++;
          if (k === n) {
            colors[n] = c;
            sums[n++] = 0;
          }
          sums[k]! += weight;
        }
      }
      let best = 0;
      for (let k = 1; k < n; k++)
        if (beats(colors[k]!, sums[k]!, colors[best]!, sums[best]!)) best = k;
      out[y * W + x] = colors[best]!;
    }
  }
  return { width: W, height: H, data: out };
}

/**
 * Kuvan RGBA-tavut. Läpinäkyvä kohta saa lähimmän naapurinsa värin (alfa 0),
 * jotta pehmeä suodatus ei tuo reunaan mustaa.
 */
export function pixelBytes(px: PixelImage): Uint8ClampedArray {
  const { width: w, height: h } = px;
  const rgba = new Uint8ClampedArray(w * h * 4);
  const put = (o: number, c: number, a: number) => {
    rgba[o] = (c >> 16) & 0xff;
    rgba[o + 1] = (c >> 8) & 0xff;
    rgba[o + 2] = c & 0xff;
    rgba[o + 3] = a;
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = px.data[y * w + x]!;
      if (c >= 0) {
        put((y * w + x) * 4, c, 255);
        continue;
      }
      for (const [dx, dy] of NEIGHBOURS) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const near = px.data[yy * w + xx]!;
        if (near < 0) continue;
        put((y * w + x) * 4, near, 0);
        break;
      }
    }
  return rgba;
}

const NEIGHBOURS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
] as const;
