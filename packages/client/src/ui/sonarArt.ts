import { ECHO_STYLE, type BottomType } from '@lunki/shared';
import { activeLook } from '../engine/look';

/**
 * HUDin pienten näyttöjen (kaikuluotain, vieheluotain, perhoheiton sivukuva)
 * yhteinen piirto. Näytön mitat ovat sisäisiä pikseleitä (yksi = HUDin --u).
 * Retrossa kangas on sen kokoinen ja kuva piirretään pikseleinä. Terävällä
 * (#674) kankaalla on `PANEL_DETAIL` kuvapistettä sisäistä pikseliä kohden, ja
 * sama kuva piirretään viivoina ja muotoina: pohja kaarena, kasvit varsina,
 * kivet pyöreinä ja kalat kaarina.
 */

/** Terävän näytön kuvapisteitä sisäistä pikseliä kohden. */
export const PANEL_DETAIL = 4;

export const SONAR_COLORS = {
  water: '#12324a',
  waterDeep: '#0d263a',
  surface: '#83c2db',
  grid: '#1d4a66',
  bottom: '#6b4a2b',
  bottomMid: '#5b3f25',
  bottomDeep: '#4a321d',
  bottomLine: '#e0b060',
  /** Kova kivikkopohja kaikuu kirkkaampana, pehmeä lieju himmeämpänä. */
  rockLine: '#fff0c0',
  mudLine: '#9a7444',
  land: '#3f6b2a',
  landDark: '#2c5220',
  rocks: '#8e99a4',
  boulder: '#8e99a4',
  rocksLight: '#c3cbd2',
  rocksDark: '#5a646e',
  tree: '#a0703c',
  reeds: '#5fae3c',
  reedsLight: '#9ad05a',
  weed: '#3f8f3a',
  weedLight: '#6fbf52',
  brush: '#7a5230',
  brushLight: '#a0703c',
  trail: '#4f6f86',
  glint: '#eef2f3',
  bite: '#d23a2a',
} as const;

/** Pohjan pintaviivan väri pohjan laadun mukaan. */
export const floorLine = (floor: BottomType | null | undefined): string =>
  floor === 'rock'
    ? SONAR_COLORS.rockLine
    : floor === 'mud'
      ? SONAR_COLORS.mudLine
      : SONAR_COLORS.bottomLine;

/**
 * Asettaa kankaan koon ilmeen mukaan ja palauttaa piirtopinnan, jonka
 * yksikkö on sisäinen pikseli. `sharp` kertoo, piirretäänkö tarkka kuva.
 */
export function panelContext(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
): { g: CanvasRenderingContext2D; sharp: boolean } | null {
  const sharp = activeLook() === 'sharp';
  const k = sharp ? PANEL_DETAIL : 1;
  if (canvas.width !== width * k || canvas.height !== height * k) {
    canvas.width = width * k;
    canvas.height = height * k;
  }
  const g = canvas.getContext('2d');
  if (!g) return null;
  g.setTransform(k, 0, 0, k, 0, 0);
  return { g, sharp };
}

/** Toistettava satunnaisluku 0–1 kokonaisluvusta: kasvit eivät elä kuvasta toiseen. */
export function panelHash(n: number, salt = 0): number {
  let h = (Math.imul(n | 0, 374761393) + Math.imul(salt | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Yksi sarake pohjaa tarkassa kuvassa. */
export interface BedColumn {
  /** Sarakkeen keskikohta ja pohjan rivi (sisäisiä pikseleitä). */
  x: number;
  y: number;
  floor?: BottomType | null;
  /** Pohjasta kohoava rakenne ja sen yläreunan rivi. */
  cover?: { kind: CoverKind; top: number } | null;
  /** Pysyvä tunniste: rullaavassa kuvassa sama sarake piirtyy aina samoin. */
  key: number;
}

export type CoverKind = 'boulder' | 'weed' | 'brush' | 'reeds' | 'rocks' | 'tree';

/** Veden tausta: syvemmällä tummempi, metrin välein himmeä katkoviiva. */
export function drawWater(
  g: CanvasRenderingContext2D,
  width: number,
  height: number,
  lines: readonly number[],
): void {
  const fill = g.createLinearGradient(0, 0, 0, height);
  fill.addColorStop(0, SONAR_COLORS.water);
  fill.addColorStop(1, SONAR_COLORS.waterDeep);
  g.fillStyle = fill;
  g.fillRect(0, 0, width, height);
  g.strokeStyle = SONAR_COLORS.grid;
  g.lineWidth = 0.3;
  g.setLineDash([1, 3]);
  g.beginPath();
  for (const y of lines) {
    g.moveTo(0, y);
    g.lineTo(width, y);
  }
  g.stroke();
  g.setLineDash([]);
}

/** Pehmeä käyrä pisteiden kautta (jatkaa aloitettua polkua). */
function curveThrough(g: CanvasRenderingContext2D, pts: readonly { x: number; y: number }[]): void {
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    g.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
  }
  const last = pts[pts.length - 1]!;
  g.lineTo(last.x, last.y);
}

/**
 * Pohja tarkassa kuvassa: maa-aines kahtena kerroksena, rakeita ja pinta
 * viivana, jonka väri ja paksuus kertovat pohjan laadun. `cols` ovat
 * peräkkäisiä vesisarakkeita vasemmalta oikealle.
 */
export function drawBed(g: CanvasRenderingContext2D, cols: readonly BedColumn[], height: number) {
  if (cols.length === 0) return;
  const first = cols[0]!;
  const last = cols[cols.length - 1]!;
  const x0 = first.x - 0.5;
  const x1 = last.x + 0.5;
  const pts = [{ x: x0, y: first.y }, ...cols, { x: x1, y: last.y }];
  const body = (drop: number, color: string) => {
    g.beginPath();
    g.moveTo(x0, height);
    g.lineTo(x0, first.y + drop);
    curveThrough(
      g,
      pts.map((p) => ({ x: p.x, y: p.y + drop })),
    );
    g.lineTo(x1, height);
    g.closePath();
    g.fillStyle = color;
    g.fill();
  };
  body(0, SONAR_COLORS.bottom);
  body(4, SONAR_COLORS.bottomMid);
  body(11, SONAR_COLORS.bottomDeep);
  // Rakeet: kivikossa vaaleita kiviä, muualla tummia jyviä.
  for (const c of cols) {
    for (let k = 0; k < 2; k++) {
      const dy = 0.9 + panelHash(c.key, 20 + k) * 5;
      if (c.y + dy > height) continue;
      const rock = c.floor === 'rock';
      g.fillStyle = rock ? SONAR_COLORS.rocksDark : SONAR_COLORS.bottomDeep;
      const r = rock ? 0.3 + panelHash(c.key, 30 + k) * 0.35 : 0.2;
      g.beginPath();
      g.arc(c.x + panelHash(c.key, 40 + k) - 0.5, c.y + dy, r, 0, Math.PI * 2);
      g.fill();
    }
  }
  // Pintaviiva pätkittäin pohjan laadun mukaan.
  g.lineCap = 'round';
  g.lineJoin = 'round';
  let from = 0;
  while (from < cols.length) {
    let to = from;
    while (to + 1 < cols.length && cols[to + 1]!.floor === cols[from]!.floor) to++;
    const run = pts.slice(from, to + 3);
    g.beginPath();
    g.moveTo(run[0]!.x, run[0]!.y);
    curveThrough(g, run);
    g.strokeStyle = floorLine(cols[from]!.floor);
    g.lineWidth = cols[from]!.floor === 'rock' ? 1.1 : cols[from]!.floor === 'mud' ? 0.5 : 0.7;
    g.stroke();
    from = to + 1;
  }
}

/** Pohjasta kohoavat rakenteet: peräkkäiset samanlaiset sarakkeet ovat yksi esiintymä. */
export function drawCover(g: CanvasRenderingContext2D, cols: readonly BedColumn[]): void {
  g.lineCap = 'round';
  g.lineJoin = 'round';
  let from = 0;
  while (from < cols.length) {
    const kind = cols[from]!.cover?.kind;
    let to = from;
    while (
      to + 1 < cols.length &&
      cols[to + 1]!.cover?.kind === kind &&
      cols[to + 1]!.x - cols[to]!.x < 1.5
    )
      to++;
    if (kind) COVER[kind](g, cols.slice(from, to + 1));
    from = to + 1;
  }
}

type CoverPainter = (g: CanvasRenderingContext2D, run: readonly BedColumn[]) => void;

const line = (
  g: CanvasRenderingContext2D,
  color: string,
  width: number,
  path: (g: CanvasRenderingContext2D) => void,
) => {
  g.beginPath();
  path(g);
  g.strokeStyle = color;
  g.lineWidth = width;
  g.stroke();
};

/** Kasvin varsi pohjasta ylös: huojuu vähän ja kantaa pari lehteä. */
const stems =
  (dark: string, light: string, leaves: boolean): CoverPainter =>
  (g, run) => {
    for (const c of run) {
      const top = c.cover!.top;
      for (let k = 0; k < 2; k++) {
        const h = (c.y - top) * (0.55 + panelHash(c.key, k) * 0.45);
        if (h < 0.6) continue;
        const x = c.x - 0.25 + k * 0.5 + (panelHash(c.key, 3 + k) - 0.5) * 0.3;
        const lean = (panelHash(c.key, 5 + k) - 0.5) * (leaves ? 1.6 : 0.5);
        const color = panelHash(c.key, 7 + k) < 0.4 ? light : dark;
        line(g, color, leaves ? 0.32 : 0.28, (p) => {
          p.moveTo(x, c.y);
          p.quadraticCurveTo(x + lean * 0.2, c.y - h * 0.5, x + lean, c.y - h);
        });
        if (!leaves) continue;
        for (let leaf = 1; leaf <= 2; leaf++) {
          const t = leaf / 3 + panelHash(c.key, 9 + leaf + k) * 0.2;
          const lx = x + lean * t * t;
          const ly = c.y - h * t;
          const side = (leaf + k) % 2 === 0 ? 1 : -1;
          line(g, color, 0.25, (p) => {
            p.moveTo(lx, ly);
            p.lineTo(lx + side * 0.7, ly - 0.5);
          });
        }
      }
    }
  };

/** Iso kivi: pyöreä kumpu sarakkeiden yläreunojen kautta, valo ylhäällä ja varjo alhaalla. */
const boulder: CoverPainter = (g, run) => {
  const a = run[0]!;
  const b = run[run.length - 1]!;
  const dome = (inset: number) => {
    g.beginPath();
    g.moveTo(a.x - 0.6 + inset, a.y + 0.3);
    const tops = run.map((c) => ({ x: c.x, y: c.cover!.top + inset }));
    g.quadraticCurveTo(a.x - 0.6 + inset, tops[0]!.y, tops[0]!.x, tops[0]!.y);
    curveThrough(g, [tops[0]!, ...tops]);
    g.quadraticCurveTo(b.x + 0.6 - inset, tops[tops.length - 1]!.y, b.x + 0.6 - inset, b.y + 0.3);
    g.closePath();
  };
  dome(0);
  g.fillStyle = SONAR_COLORS.rocksDark;
  g.fill();
  g.save();
  g.clip();
  // Valo tulee ylävasemmalta: sama kumpu siirrettynä jättää varjon oikeaan alareunaan.
  g.translate(-0.5, -0.4);
  dome(0);
  g.fillStyle = SONAR_COLORS.rocks;
  g.fill();
  g.restore();
  line(g, SONAR_COLORS.rocksLight, 0.3, (p) => {
    const tops = run.map((c) => ({ x: c.x, y: c.cover!.top + 0.25 }));
    p.moveTo(tops[0]!.x, tops[0]!.y);
    curveThrough(p, [tops[0]!, ...tops]);
  });
};

/** Kivikko: muutama pieni kivi pohjalla. */
const rocks: CoverPainter = (g, run) => {
  for (const c of run) {
    const r = 0.45 + panelHash(c.key, 1) * 0.5;
    g.beginPath();
    g.ellipse(c.x, c.y - r * 0.5, r * 1.1, r, 0, 0, Math.PI * 2);
    g.fillStyle = panelHash(c.key, 2) < 0.5 ? SONAR_COLORS.rocks : SONAR_COLORS.rocksDark;
    g.fill();
    line(g, SONAR_COLORS.rocksLight, 0.2, (p) =>
      p.ellipse(c.x, c.y - r * 0.5, r * 1.1, r, 0, Math.PI * 1.1, Math.PI * 1.6),
    );
  }
};

/** Risukko: haarovia oksia sikin sokin. */
const brush: CoverPainter = (g, run) => {
  for (const c of run) {
    const h = c.y - c.cover!.top;
    if (h < 0.5) continue;
    const lean = (panelHash(c.key, 1) - 0.5) * 2.4;
    const len = 0.6 + panelHash(c.key, 2) * 0.4;
    const tip = { x: c.x + lean, y: c.y - h * len };
    const color = panelHash(c.key, 3) < 0.5 ? SONAR_COLORS.brush : SONAR_COLORS.brushLight;
    line(g, color, 0.3, (p) => {
      p.moveTo(c.x, c.y);
      p.lineTo(tip.x, tip.y);
      const t = 0.4 + panelHash(c.key, 4) * 0.3;
      const fx = c.x + lean * t;
      const fy = c.y - h * len * t;
      p.moveTo(fx, fy);
      p.lineTo(fx - lean * 0.8 - 0.4, fy - h * 0.3);
    });
  }
};

/** Uppopuu: runko pohjaa pitkin ja siitä nousevat oksantyngät. */
const tree: CoverPainter = (g, run) => {
  const a = run[0]!;
  const b = run[run.length - 1]!;
  line(g, SONAR_COLORS.tree, 0.8, (p) => {
    p.moveTo(a.x - 0.4, a.y - 0.5);
    curveThrough(
      p,
      run.map((c) => ({ x: c.x, y: c.y - 0.6 })),
    );
    p.lineTo(b.x + 0.4, b.y - 0.9);
  });
  for (const c of run) {
    if (panelHash(c.key, 1) < 0.45) continue;
    const h = 1 + panelHash(c.key, 2) * 2;
    line(g, SONAR_COLORS.brush, 0.3, (p) => {
      p.moveTo(c.x, c.y - 0.8);
      p.lineTo(c.x + (panelHash(c.key, 3) - 0.5) * 1.6, c.y - 0.8 - h);
    });
  }
};

const COVER: Record<CoverKind, CoverPainter> = {
  boulder,
  rocks,
  brush,
  tree,
  weed: stems(SONAR_COLORS.weed, SONAR_COLORS.weedLight, true),
  reeds: stems(SONAR_COLORS.reeds, SONAR_COLORS.reedsLight, false),
};

/**
 * Kalan kaiku luotaimessa: kaari kuten oikeassa luotaimessa, isompi kala
 * paksumpana ja leveämpänä. `x`, `y` = kaaren huippu.
 */
export function drawEchoArch(g: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const style = ECHO_STYLE[size]!;
  const half = 1.2 + style.px * 0.55;
  const drop = 0.8 + style.px * 0.35;
  g.lineCap = 'round';
  line(g, style.color, 0.45 + style.px * 0.22, (p) => {
    p.moveTo(x - half, y + drop);
    p.quadraticCurveTo(x, y - drop, x + half, y + drop);
  });
}

/** Kala sivulta vieheluotaimessa: runko ja pyrstö, pää suuntaan `dir` (1 = oikealle). */
export function drawFishShape(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  dir: number,
): void {
  const style = ECHO_STYLE[size]!;
  const len = 1.6 + style.px * 0.9;
  const thick = 0.45 + style.px * 0.22;
  g.fillStyle = style.color;
  g.beginPath();
  g.ellipse(x, y, len, thick, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(x - dir * len * 0.8, y);
  g.lineTo(x - dir * (len + thick * 1.6), y - thick * 1.3);
  g.lineTo(x - dir * (len + thick * 1.6), y + thick * 1.3);
  g.closePath();
  g.fill();
}
