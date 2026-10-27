/**
 * Latausanimaatiot pikselikuvina. Jokainen animaatio on pino kerroksia, ja
 * kerros on yksi SVG-kuva, jota siirretään CSS:n steps()-animaatiolla: kuvien
 * nauha (ruutu kerrallaan) tai kahdesti toistuva tausta, joka rullaa. Siirto
 * (transform) pyörii selaimen kompositorissa, joten animaatio liikkuu silloinkin,
 * kun pääsäie jäsentää pelin koodia tai rakentaa järveä.
 *
 * Tiedostossa ei ole DOM-riippuvuuksia: vite.config.ts upottaa ensimmäisen
 * latausnäkymän index.html:ään jo koontivaiheessa.
 */

type Color = string;

/** Pelin paletti (ks. scripts/ikoni/piirra.py, sonar.ts ja tubeMesh.ts). */
const C = {
  lake: '#12324a',
  deep: '#0e2638',
  wave: '#1b5a84',
  crest: '#2b7aa6',
  white: '#eef2f3',
  line: '#c3cbd2',
  metal: '#9aa3ab',
  red: '#d23a2a',
  redLight: '#ec6a4c',
  redDark: '#8c1c1c',
  orange: '#f08a2c',
  yellow: '#f6d04d',
  yellowDark: '#b8962c',
  shirt: '#24502c',
  shirtDark: '#173a1e',
  skin: '#e0cf9c',
  legs: '#3b4630',
  fins: '#1c232b',
  pikeBack: '#24502c',
  pikeSide: '#4f863a',
  pikeBelly: '#e0cf9c',
  pikeSpot: '#c9d87a',
  eye: '#0b0f14',
  grid: '#1d4a66',
  bottom: '#6b4a2b',
  bottomLine: '#e0b060',
  rockLine: '#fff0c0',
  weed: '#3f8f3a',
  violet: '#9b4dd8',
} as const;

/** Pikselikuva: null = läpinäkyvä. */
export class Pix {
  readonly px: (Color | null)[];

  constructor(
    readonly w: number,
    readonly h: number,
    fill: Color | null = null,
  ) {
    this.px = new Array<Color | null>(w * h).fill(fill);
  }

  get(x: number, y: number): Color | null {
    x = Math.round(x);
    y = Math.round(y);
    return x < 0 || y < 0 || x >= this.w || y >= this.h ? null : this.px[y * this.w + x]!;
  }

  set(x: number, y: number, c: Color | null): void {
    x = Math.round(x);
    y = Math.round(y);
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y * this.w + x] = c;
  }

  rect(x: number, y: number, w: number, h: number, c: Color): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }

  /** Suora viiva (Bresenham). */
  line(x0: number, y0: number, x1: number, y1: number, c: Color): void {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) return;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  /** Käsin piirretty pala: merkki = avain `key`-taulussa, muut läpinäkyviä. */
  stamp(x: number, y: number, rows: readonly string[], key: Record<string, Color>): void {
    rows.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        const c = key[row[i]!];
        if (c) this.set(x + i, y + j, c);
      }
    });
  }

  /** Kopio, jossa koko kuva on siirretty (dx, dy) ja reunan yli menevä kiertää. */
  wrapped(dx: number, dy: number): Pix {
    const out = new Pix(this.w, this.h);
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++)
        out.set(
          (((x + dx) % this.w) + this.w) % this.w,
          (((y + dy) % this.h) + this.h) % this.h,
          this.get(x, y),
        );
    return out;
  }
}

/**
 * Kerros: `frames` = ruudut vuorotellen (nauha), `scroll` = yksi saumaton kuva,
 * joka rullaa pikselin kerrallaan vasemmalle (x) tai ylös (y); `reverse` kääntää suunnan.
 */
export type LoaderLayer =
  | { kind: 'frames'; frames: Pix[]; frameMs: number }
  | { kind: 'scroll'; tile: Pix; axis: 'x' | 'y'; stepMs: number; reverse?: boolean };

export interface LoaderArt {
  id: LoaderVariant;
  w: number;
  h: number;
  /** Taustaväri kerrosten alla. */
  bg: Color;
  layers: LoaderLayer[];
}

export type LoaderVariant = 'tube' | 'pike' | 'sonar';

/** Kuvat SVG-poluiksi: yksi polku väriä kohti, vaakasuorat pikselijonot suorakaiteina. */
function svg(images: readonly Pix[], dir: 'x' | 'y'): string {
  const w = images[0]!.w;
  const h = images[0]!.h;
  const paths = new Map<Color, string>();
  images.forEach((img, i) => {
    const ox = dir === 'x' ? i * w : 0;
    const oy = dir === 'y' ? i * h : 0;
    for (let y = 0; y < h; y++) {
      let x = 0;
      while (x < w) {
        const c = img.get(x, y);
        let n = 1;
        while (x + n < w && img.get(x + n, y) === c) n++;
        if (c) paths.set(c, (paths.get(c) ?? '') + `M${ox + x} ${oy + y}h${n}v1h-${n}z`);
        x += n;
      }
    }
  });
  const tw = dir === 'x' ? w * images.length : w;
  const th = dir === 'y' ? h * images.length : h;
  const body = [...paths].map(([c, d]) => `<path fill="${c}" d="${d}"/>`).join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${tw} ${th}" ` +
    `shape-rendering="crispEdges" aria-hidden="true">${body}</svg>`
  );
}

/**
 * Animaation HTML. Mitat CSS-muuttujina (--w, --h pikseleinä); pikselin koko
 * --px tulee tyylitiedostosta, joten sama kuva skaalautuu tarpeen mukaan.
 */
export function loaderArtHtml(art: LoaderArt): string {
  const layers = art.layers.map((l) => {
    if (l.kind === 'frames') {
      const n = l.frames.length;
      const style =
        `--lw:${art.w * n};--lh:${art.h};` +
        `animation-duration:${n * l.frameMs}ms;animation-timing-function:steps(${n})`;
      return `<div class="loader-layer loader-strip" style="${style}">${svg(l.frames, 'x')}</div>`;
    }
    const n = l.axis === 'x' ? l.tile.w : l.tile.h;
    const lw = l.axis === 'x' ? l.tile.w * 2 : l.tile.w;
    const lh = l.axis === 'y' ? l.tile.h * 2 : l.tile.h;
    const style =
      `--lw:${lw};--lh:${lh};` +
      `animation-duration:${n * l.stepMs}ms;animation-timing-function:steps(${n})` +
      (l.reverse ? ';animation-direction:reverse' : '');
    return (
      `<div class="loader-layer loader-scroll-${l.axis}" style="${style}">` +
      `${svg([l.tile, l.tile], l.axis)}</div>`
    );
  });
  return (
    `<div class="loader-art loader-${art.id}" style="--w:${art.w};--h:${art.h};background:${art.bg}">` +
    `${layers.join('')}</div>`
  );
}

// --- A: kelluntarengas ylhäältä, räpylät potkivat -----------------------------

/** Pieni retroaalto kuten sovelluskuvakkeessa. */
function waveMark(p: Pix, x: number, y: number): void {
  p.stamp(x, y, ['.ab..', 'aaaaa'], { a: C.wave, b: C.crest });
}

/**
 * Rengas ja kalastaja samasta 32×32-kuvasta kuin sovelluskuvake
 * (scripts/ikoni/piirra.py, RENGAS), ilman taustan järveä.
 */
const TUBE = [
  '............................c...',
  '...........................cd...',
  '..........................c.e...',
  '............ffffffff.....c..d...',
  '..........ffggggggggff..c...e...',
  '.........ffggggggggggffc....d...',
  '........fgggggggggggggcf....e...',
  '.......ffgggghhhhhhggcgff...d...',
  '.......fggghh......hcgggf...h...',
  '......fggggh..iiii..hggggf.ff...',
  '......fgggh..jiiiij..hgggf......',
  '......fgggh.jjkkkkjj.hgggf......',
  '......fgggh.jjkkkkjj.hgggf......',
  '......ffgggjjjkkkkjjjgggff......',
  '......ffggg.jjjkkjjj.gggff......',
  '......ffggg.jjjjjjjj.gggff......',
  '......ffgggg.jjjjjj.ggggff......',
  '.......ffgggg.jjjj.ggggff.......',
  '.......fffggggggggggggfff.......',
  '........fffggggggggggfff........',
  '.........fffggggggggfff.........',
  '..........ffffffffffff..........',
  '............ffffffff............',
];

const TUBE_KEY: Record<string, Color> = {
  c: '#3b2a1e',
  d: C.white,
  e: C.line,
  f: C.red,
  g: C.orange,
  h: C.yellow,
  i: C.redDark,
  j: C.shirt,
  k: C.skin,
};

function tubeArt(): LoaderArt {
  const W = 40;
  const H = 40;
  // Järvi rullaa alas: rengas kulkee selkä edellä, poispäin räpylöistä (kuten pelissä).
  const water = new Pix(W, H);
  for (const [x, y] of [
    [3, 4],
    [27, 9],
    [9, 17],
    [31, 24],
    [2, 31],
    [21, 35],
  ] as const)
    waveMark(water, x, y);

  // Kalastaja katsoo alas (kasvot näkyvät), joten sääret ja räpylät ovat
  // renkaan alareunan edessä. Rengas on ylempänä, jotta räpylöille jää tilaa.
  const ox = 4;
  const oy = 5;
  const ankle = oy + 24;
  const fin = (p: Pix, x: number, len: number) => {
    // Lyhyt räpylä = potku alas veteen: ylhäältä katsottuna se lyhenee.
    p.rect(x, ankle, 2, 1, C.fins);
    p.rect(x - 1, ankle + 1, 4, len - 1, C.fins);
    // Lepattava kärki: keskeltä lovettu.
    if (len > 4) p.set(x + 1, ankle + len - 1, null);
  };
  const splash = (p: Pix, x: number, y: number, big: boolean) => {
    p.set(x - 2, y, C.white);
    p.set(x + 3, y + 1, C.crest);
    if (!big) return;
    p.set(x - 1, y + 2, C.crest);
    p.set(x + 2, y + 3, C.white);
    p.set(x + 4, y - 1, C.wave);
    p.set(x - 3, y - 2, C.wave);
  };
  // Potkut vuorotellen: vasen pitkä–keski–lyhyt–keski, oikea vastavaiheessa.
  const lens = [7, 5, 3, 5];
  const frames = lens.map((l, i) => {
    const p = new Pix(W, H);
    const r = lens[(i + 2) % 4]!;
    p.stamp(ox, oy, TUBE, TUBE_KEY);
    // Sääret takin helmasta renkaan yli.
    p.rect(17, oy + 17, 2, ankle - oy - 17, C.legs);
    p.rect(21, oy + 17, 2, ankle - oy - 17, C.legs);
    fin(p, 17, l);
    fin(p, 21, r);
    // Roiske potkun pohjassa ja sen jälkeen laajeneva väre.
    if (l === 3) splash(p, 17, ankle + 4, false);
    if (r === 3) splash(p, 21, ankle + 4, false);
    if (lens[(i + 3) % 4] === 3) splash(p, 17, ankle + 5, true);
    if (lens[(i + 1) % 4] === 3) splash(p, 21, ankle + 5, true);
    return p;
  });

  return {
    id: 'tube',
    w: W,
    h: H,
    bg: C.lake,
    layers: [
      { kind: 'scroll', tile: water, axis: 'y', stepMs: 120, reverse: true },
      { kind: 'frames', frames, frameMs: 160 },
    ],
  };
}

// --- B: hauki iskee lusikkaan --------------------------------------------------

/** Hauki sivulta, kuono oikealla kohdassa (nx, cy). */
function drawPike(p: Pix, nx: number, cy: number, open: boolean, tail: number): void {
  const L = 27;
  const x0 = nx - L;
  const half = (t: number) => (t < 0.12 ? 0.6 + t * 10 : t < 0.78 ? 2.6 : 2.6 - (t - 0.78) * 7);
  for (let i = 0; i <= L; i++) {
    const t = i / L;
    const r = half(t);
    for (let o = -Math.ceil(r); o <= Math.ceil(r); o++) {
      if (Math.abs(o) > r + 0.2) continue;
      let c: Color = C.pikeSide;
      if (o <= -r + 1) c = C.pikeBack;
      else if (o >= r - 0.9 && o > 0) c = C.pikeBelly;
      else if (o === 0 && i % 4 === 1 && t > 0.2 && t < 0.75) c = C.pikeSpot;
      else if (o === -1 && i % 5 === 3 && t > 0.25 && t < 0.7) c = C.pikeSpot;
      p.set(x0 + i, cy + o, c);
    }
  }
  // Haarautuva pyrstö, selkä- ja peräevä taempana kuten hauella.
  p.stamp(x0 - 3, cy - 3 + tail, ['ff..', '.ff.', '..ff', '..ff', '.ff.', 'ff..'], {
    f: C.red,
  });
  p.stamp(x0 + 4, cy - 4, ['.ff', 'fff'], { f: C.red });
  p.stamp(x0 + 4, cy + 3, ['fff', '.ff'], { f: C.red });
  p.set(x0 + 17, cy + 3, C.red);
  p.set(x0 + 18, cy + 3, C.red);
  // Silmä ja kita.
  p.set(nx - 4, cy - 1, C.eye);
  p.set(nx - 4, cy - 2, C.yellow);
  if (open) {
    p.stamp(nx - 3, cy - 1, ['ggggb', 'rrr..', 'rr...', 'kkkk.'], {
      g: C.pikeBack,
      b: C.pikeSide,
      r: C.redDark,
      k: C.pikeBelly,
    });
    p.set(nx - 1, cy + 2, null);
  } else {
    p.stamp(nx - 3, cy - 1, ['gggg', 'bbbb', 'kkk.'], {
      g: C.pikeBack,
      b: C.pikeSide,
      k: C.pikeBelly,
    });
    p.set(nx - 2, cy, C.eye);
  }
}

const SPOON = ['.s..', '.ff.', 'ffdd', 'fddf', 'ddff', '.ff.', '.s..', 's.s.'];
/** Lusikka kääntyneenä syrjittäin: välähtää hopeisena. */
const SPOON_EDGE = ['.s.', '.w.', '.w.', '.e.', '.w.', '.e.', '.s.', 's.s'];

function spoon(p: Pix, x: number, y: number, flash: boolean): void {
  const key = {
    s: C.metal,
    f: C.red,
    d: C.white,
    w: C.white,
    e: C.line,
  };
  p.stamp(x, y, flash ? SPOON_EDGE : SPOON, key);
}

function pikeArt(): LoaderArt {
  const W = 64;
  const H = 32;
  const surface = new Pix(W, 3);
  for (let x = 0; x < W; x++) {
    surface.set(x, 0, C.crest);
    if (x % 8 < 5) surface.set(x, 1, C.wave);
    if (x % 16 === 2 || x % 16 === 3) surface.set(x, 2, C.wave);
  }
  const bed = new Pix(W, H);
  for (let x = 0; x < W; x++) {
    const top = 28 + Math.round(Math.sin(x / 5) + Math.sin(x / 11));
    for (let y = top; y < H; y++) bed.set(x, y, y === top ? C.bottomLine : C.bottom);
  }
  for (const [x, hgt] of [
    [5, 7],
    [8, 5],
    [56, 8],
    [59, 6],
  ] as const)
    for (let j = 0; j < hgt; j++) bed.set(x + ((j >> 1) % 2), 27 - j, C.weed);

  // Lusikka lepää siiman päässä; LX = siiman x.
  const LX = 45;
  const LY = 13;
  /** [kuono x, keskiviiva y, kita auki, pyrstö, lusikka (null = hauen suussa), välke] */
  const seq: [number | null, number, boolean, number, number | null, boolean][] = [
    [null, 16, false, 0, LY, false],
    [null, 16, false, 0, LY, true],
    [3, 16, false, 1, LY, false],
    [10, 16, false, 0, LY, true],
    [17, 16, false, -1, LY, false],
    [23, 16, false, 0, LY, true],
    [28, 16, false, 1, LY, false],
    [31, 16, false, 0, LY, false],
    [36, 16, true, -1, LY, true],
    [46, 16, true, 1, null, false],
    [46, 17, false, -1, null, false],
    [47, 15, false, 1, null, false],
    [47, 10, false, -1, null, false],
    [47, 3, false, 1, null, false],
    [null, 0, false, 0, -1, false],
    [null, 0, false, 0, 6, true],
  ];
  const frames = seq.map(([nx, cy, open, tail, ly, flash], i) => {
    const p = new Pix(W, H);
    if (nx !== null && ly === null) {
      // Kala koukussa: siima kitaan.
      p.line(LX, 0, nx - 1, cy - 1, C.line);
    } else if (ly !== null) {
      for (let y = 0; y < ly + 1; y++) p.set(LX, y, C.line);
      spoon(p, LX - 1, ly, flash);
    }
    if (nx !== null) drawPike(p, nx, cy, open, tail);
    // Kuplia iskun jälkeen.
    if (i >= 9 && i <= 12)
      for (const [bx, by] of [
        [nx! - 1, cy - 5],
        [nx! + 2, cy - 8],
        [nx! - 3, cy - 11],
      ] as const)
        p.set(bx, by - (i - 9) * 2, (bx + by) % 2 ? C.white : C.crest);
    return p;
  });
  return {
    id: 'pike',
    w: W,
    h: H,
    bg: C.lake,
    layers: [
      { kind: 'frames', frames: [bed], frameMs: 1000 },
      { kind: 'frames', frames, frameMs: 120 },
      { kind: 'scroll', tile: surface, axis: 'x', stepMs: 90 },
    ],
  };
}

// --- C: kaikuluotain rullaa ----------------------------------------------------

function sonarArt(): LoaderArt {
  const W = 64;
  const H = 40;
  const grid = new Pix(W, H);
  for (const y of [10, 20, 30]) for (let x = 0; x < W; x += 2) grid.set(x, y, C.grid);

  const tile = new Pix(W, H);
  const tau = Math.PI * 2;
  for (let x = 0; x < W; x++) {
    // Kokonaislukujaksot: kuva on saumaton 64 pikselin välein.
    const b = Math.round(
      29 + 3.2 * Math.sin((tau * x) / W) + 1.6 * Math.sin((tau * 3 * x) / W + 1),
    );
    const rock = x >= 40 && x < 50;
    for (let y = b + 1; y < H; y++) tile.set(x, y, C.bottom);
    tile.set(x, b, rock ? C.rockLine : C.bottomLine);
    if (rock) tile.set(x, b + 1, C.rockLine);
    if (x >= 8 && x < 18) for (let y = b - 5 + (x % 2); y < b; y += 2) tile.set(x, y, C.weed);
  }
  // Kalat kaarina kuten oikeassa luotaimessa; isompi kala paksumpi ja eri värinen.
  const fish: [number, number, number, Color][] = [
    [22, 13, 1, C.yellow],
    [34, 21, 2, C.orange],
    [50, 9, 3, C.red],
    [58, 23, 1, C.yellow],
    [5, 6, 4, C.violet],
  ];
  for (const [fx, fy, px, c] of fish)
    for (let dx = -3; dx <= 3; dx++) {
      const y = fy + Math.round((dx * dx) / 4);
      for (let k = 0; k < px; k++) tile.set((((fx + dx) % W) + W) % W, y - k, c);
    }

  return {
    id: 'sonar',
    w: W,
    h: H,
    bg: C.lake,
    layers: [
      { kind: 'frames', frames: [grid], frameMs: 1000 },
      { kind: 'scroll', tile, axis: 'x', stepMs: 80 },
    ],
  };
}

const ARTS: Record<LoaderVariant, () => LoaderArt> = {
  tube: tubeArt,
  pike: pikeArt,
  sonar: sonarArt,
};

const cache = new Map<LoaderVariant, string>();

/** Valmis HTML animaatiolle (laskettu kerran). */
export function loaderArt(variant: LoaderVariant): string {
  let html = cache.get(variant);
  if (!html) {
    html = loaderArtHtml(ARTS[variant]());
    cache.set(variant, html);
  }
  return html;
}

/** Käytössä oleva animaatio (vaihtoehdot: ks. ARTS). */
export const LOADER_VARIANT: LoaderVariant = 'tube';

const DOTS = '<span class="loader-dots" aria-hidden="true"><i>.</i><i>.</i><i>.</i></span>';

/**
 * Animaatio ja valinnainen teksti, jonka perään pisteet ilmestyvät yksi
 * kerrallaan. `label` on HTML:ää (vain pelin omia tekstejä).
 */
export function loaderHtml(label: string | null = null, variant = LOADER_VARIANT): string {
  if (label === null) return `<div class="loader">${loaderArt(variant)}</div>`;
  return (
    `<div class="loader" role="status">${loaderArt(variant)}` +
    `<p class="loader-label">${label}${DOTS}</p></div>`
  );
}

/**
 * Sivun ensimmäinen latausnäkymä, jonka vite.config.ts upottaa index.html:ään:
 * se näkyy heti tyylitiedoston saavuttua, kun pelin koodi vasta latautuu.
 * Kieli valitaan samoin kuin i18n:ssä (tallennettu valinta tai selaimen kieli).
 * Jos lataus kestää, ruutu kertoo hetken päästä, että peli latautuu yhä.
 */
export function bootLoaderHtml(): string {
  const text = (fi: string, en: string) => `<span data-fi="${fi}" data-en="${en}">${fi}</span>`;
  return (
    `<div id="boot-loader" class="boot-loader"><p class="boot-title">LUNKINJÄRVI</p>` +
    loaderHtml(text('Ladataan', 'Loading')) +
    `<p class="boot-slow">${text('Hidas yhteys? Peli latautuu yhä.', 'Slow connection? The game is still loading.')}</p>` +
    `</div>` +
    `<script>(function(){var l=null;try{l=localStorage.getItem('lunki.lang')}catch(e){}` +
    `if(l!=='fi'&&l!=='en')l=(navigator.language||'').toLowerCase().indexOf('fi')===0?'fi':'en';` +
    `if(l==='en')document.querySelectorAll('#boot-loader [data-en]').forEach(function(e){e.textContent=e.getAttribute('data-en')})})()</script>`
  );
}
