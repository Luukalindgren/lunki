import type * as THREE from 'three';
import type { Vec2 } from '@lunki/shared';

/**
 * Siiman piirto kolmiulotteisena. Fysiikka laskee siiman vain pinnan tasossa
 * (ylhäältä katsottuna), joten vavan kärjen ja veden välinen osuus lisätään
 * piirrossa: siima roikkuu kärjestä kaarena ja laskeutuu pinnalle, jonka
 * jälkeen se jatkaa pinnalla fysiikan muotoa.
 */

/** Vavan kärjen piirtokorkeus vedenpinnasta (m). */
export const ROD_TIP_Y = 1.2;

/** Ilmassa roikkuvan osuuden näytteet (kärki mukaan lukien yksi enemmän). */
export const AIR_SAMPLES = 10;

const HANG = {
  /** Löysän siiman kosketuskohta kärjen korkeuden kerrannaisena (m/m). */
  slackSpan: 0.6,
  /** Kireän siiman kosketuskohta kauempana, korkeuden kerrannaisena. */
  tautSpan: 6,
  /** Painovoima taivuttaa kireääkin siimaa hieman: tätä suoremmaksi ei vedetä. */
  maxTaut: 0.85,
  /** Tällä jännityksellä siima on täysin kireä (sama raja kuin värityksessä). */
  tautTension: 0.3,
  /** Lennon aikaisen kaaren notko suhteessa vavan ja vieheen väliin. */
  flightSag: 0.06,
  /** Vavan kärki on kalastajan oikealla puolella: siirtymä häviää näin pitkällä (m). */
  sideFade: 2.5,
} as const;

/** Vapa on oikeassa kädessä: kärki näin paljon katseen oikealla puolella (m). */
export const ROD_SIDE = 0.5;

/** Vavan kärjen sivusiirtymä renkaan suunnasta (järven koordinaateissa). */
export function rodSideOffset(heading: number): Vec2 {
  return {
    x: Math.cos(heading - Math.PI / 2) * ROD_SIDE,
    y: Math.sin(heading - Math.PI / 2) * ROD_SIDE,
  };
}

/** Piste järven koordinaateissa ja korkeus vedenpinnasta. */
export interface LinePoint {
  x: number;
  y: number;
  h: number;
}

/** Siiman jännitys (0…) kireydeksi 0–1. */
export function tautness(tension: number): number {
  return Math.min(1, Math.max(0, tension / HANG.tautTension));
}

/**
 * Siima vavan kärjestä pitkin pinnan polkua `path` (ensimmäinen piste kärjen
 * alla). Löysä siima putoaa kärjestä jyrkästi ja kaartuu pinnan suuntaiseksi,
 * kireä on lähes suora ja osuu veteen kauempana vieheen suunnassa.
 * `tipOffset` siirtää piirrettyä kärkeä sivuun fysiikan kärjestä; siirtymä
 * vaimenee siiman alkupäässä, joten viehe pysyy paikallaan.
 */
export function hangLine(
  path: readonly Vec2[],
  tipHeight: number,
  taut: number,
  surface: number,
  tipOffset: Vec2 = { x: 0, y: 0 },
): LinePoint[] {
  const n = path.length;
  if (n === 0) return [];
  const cum = [0];
  for (let i = 1; i < n; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    cum.push(cum[i - 1]! + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const k = Math.min(1, Math.max(0, taut)) * HANG.maxTaut;
  const total = cum[n - 1]!;
  const span = Math.min(total, tipHeight * (HANG.slackSpan + HANG.tautSpan * k));
  const fade = Math.max(Math.min(total, span + HANG.sideFade), 1e-6);
  // Neliönä vaimeneva siirtymä liittyy fysiikan siimaan ilman mutkaa.
  const side = (s: number) => Math.max(0, 1 - s / fade) ** 2;

  const out: LinePoint[] = [];
  let seg = 0;
  for (let j = 0; j <= AIR_SAMPLES; j++) {
    const u = j / AIR_SAMPLES;
    const s = span * u;
    while (seg < n - 2 && cum[seg + 1]! < s) seg++;
    const a = path[seg]!;
    const b = path[Math.min(seg + 1, n - 1)]!;
    const len = cum[Math.min(seg + 1, n - 1)]! - cum[seg]!;
    const t = len > 0 ? (s - cum[seg]!) / len : 0;
    // Löysänä paraabeli, joka sivuaa pintaa kosketuskohdassa; kireänä suora.
    const f = (1 - u) * (k + (1 - k) * (1 - u));
    const w = side(s);
    out.push({
      x: a.x + (b.x - a.x) * t + tipOffset.x * w,
      y: a.y + (b.y - a.y) * t + tipOffset.y * w,
      h: surface + (tipHeight - surface) * f,
    });
  }
  for (let i = 1; i < n; i++) {
    if (cum[i]! <= span) continue;
    const w = side(cum[i]!);
    out.push({ x: path[i]!.x + tipOffset.x * w, y: path[i]!.y + tipOffset.y * w, h: surface });
  }
  return out;
}

/** Heiton aikana siima kulkee kärjestä ilmassa olevaan vieheeseen loivana kaarena. */
export function flightLine(
  tip: LinePoint,
  lure: LinePoint,
  samples: number,
  surface: number,
): LinePoint[] {
  const dist = Math.hypot(lure.x - tip.x, lure.y - tip.y);
  const sag = dist * HANG.flightSag;
  const out: LinePoint[] = [];
  for (let i = 0; i < samples; i++) {
    const t = samples > 1 ? i / (samples - 1) : 1;
    const h = tip.h + (lure.h - tip.h) * t - sag * 4 * t * (1 - t);
    out.push({
      x: tip.x + (lure.x - tip.x) * t,
      y: tip.y + (lure.y - tip.y) * t,
      h: Math.max(surface, h),
    });
  }
  return out;
}

/** Kirjoittaa pisteet viivaan; ylimääräiset kärkivälit jäävät viimeiseen pisteeseen. */
export function writeLine(pos: THREE.BufferAttribute, pts: readonly LinePoint[]): void {
  for (let i = 0; i < pos.count; i++) {
    const p = pts[Math.min(i, pts.length - 1)];
    if (p) pos.setXYZ(i, p.x, p.h, -p.y);
  }
}
