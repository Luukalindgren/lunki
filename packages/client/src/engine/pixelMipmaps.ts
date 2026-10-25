/** RGBA-kuva tavutaulukkona. */
export interface Rgba {
  width: number;
  height: number;
  data: Uint8ClampedArray<ArrayBuffer>;
}

/**
 * Puolittaa pikselikuvan: jokaisesta 2×2-lohkosta tulee yksi pikseli, joka on
 * näkyvä, jos vähintään puolet lohkosta on näkyvää. Väri on näkyvien
 * pikselien keskiarvo, joten läpinäkyvä tausta ei tummenna reunoja eikä
 * alphaTest syö ohuita runkoja.
 */
export function halveSprite(src: Rgba): Rgba {
  const width = Math.max(1, src.width >> 1);
  const height = Math.max(1, src.height >> 1);
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      let total = 0;
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const sx = Math.min(src.width - 1, x * 2 + dx);
          const sy = Math.min(src.height - 1, y * 2 + dy);
          const i = (sy * src.width + sx) * 4;
          total++;
          if (src.data[i + 3]! < 128) continue;
          r += src.data[i]!;
          g += src.data[i + 1]!;
          b += src.data[i + 2]!;
          n++;
        }
      }
      const o = (y * width + x) * 4;
      if (n === 0) continue;
      data[o] = r / n;
      data[o + 1] = g / n;
      data[o + 2] = b / n;
      data[o + 3] = n * 2 >= total ? 255 : 0;
    }
  }
  return { width, height, data };
}

/** Koko mipmap-ketju 1×1:een asti, alkaen alkuperäisen puolikkaasta. */
export function spriteMipmaps(src: Rgba): Rgba[] {
  const levels: Rgba[] = [];
  let level = src;
  while (level.width > 1 || level.height > 1) {
    level = halveSprite(level);
    levels.push(level);
  }
  return levels;
}
