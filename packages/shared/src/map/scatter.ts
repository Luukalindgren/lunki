import { distance, type Vec2 } from '../vec2';
import type { Pier } from './piers';

/**
 * Pohjan pienet rakenteet (#226): siirtolohkareet, uposkasvustot ja risukot
 * sekä pohjan laatu. Lunkinjärvestä ei ole luotausta, joten ne sijoitellaan
 * sääntöjen mukaan siitä, millainen Hämeen järviylängön moreenijärven pohja
 * tyypillisesti on (ks. docs/pohja.md). Sijoittelu on kiinteä: sama järvi
 * näyttää kaikille pelaajille ja palvelimelle samalta, eikä se kuluta
 * kalakannan satunnaislukuja.
 */

/** Pohjan laatu: lieju syvänteissä, hiekka loivilla rannoilla, kivikko jyrkillä. */
export type BottomType = 'mud' | 'sand' | 'rock';

export const BOTTOM_TYPES: readonly BottomType[] = ['mud', 'sand', 'rock'];

export const SCATTER = {
  /** Kivien ehdokasruudukko (m). */
  boulderStep: 9,
  /** Kasvustojen ehdokasruudukko (m). */
  weedStep: 34,
  /** Uppotukkien ehdokasruudukko (m). */
  logStep: 55,
  /** Kasvustot kasvavat tällä syvyysvälillä (m). */
  weedDepth: { min: 0.8, max: 3 },
  /** Risukot ja tukit tällä syvyysvälillä (m). */
  brushDepth: { min: 1.4, max: 4.5 },
  /** Lieju alkaa tästä syvyydestä (m), suojaisissa lahdissa matalammalta. */
  mudDepth: 5,
} as const;

/** Sijoittelussa tarvittavat tiedot valmiiksi lasketusta pohjasta. */
export interface ScatterGround {
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  isWater(p: Vec2): boolean;
  depthAt(p: Vec2): number;
  /** Etäisyys rantaan (m). */
  shoreDistance(p: Vec2): number;
  /** Rannan jyrkkyyskerroin (1 = tavallinen, >1 jyrkkä). */
  steepness(p: Vec2): number;
  /** Käsin merkityt kivikot ja matalikot: kiviä on niiden ympärillä tiheämmin. */
  rockAreas: readonly { pos: Vec2; radius: number }[];
  shoals: readonly { pos: Vec2; radius: number }[];
  /** Kohta on kaislikossa (siellä on omat varret). */
  inReeds(p: Vec2): boolean;
  piers: readonly Pier[];
}

export interface ScatterItem {
  kind: 'boulder' | 'weed' | 'brush';
  pos: Vec2;
  radius: number;
  /** Korkeus pohjasta (m). */
  height: number;
  /** Kasvuston tiheys 0–1 (muilla 1). */
  density: number;
}

/** Deterministinen luku [0, 1) kokonaislukupisteestä ja kanavasta. */
export function hash01(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Pehmeä 0–1-paino: 1 keskellä, 0 säteen kohdalla. */
const near = (p: Vec2, c: Vec2, radius: number) => Math.max(0, 1 - distance(p, c) / radius);

/** Kaikki sääntöjen mukaan sijoitellut rakenteet. */
export function scatterStructures(g: ScatterGround): ScatterItem[] {
  // Kovat rakenteet ensin: structureAt palauttaa kasvuston sisällä olevan kiven.
  return [...boulders(g), ...brush(g), ...weeds(g)];
}

/**
 * Siirtolohkareet: jääkauden jättämiä yksittäisiä kiviä jyrkillä rannoilla,
 * matalikoilla ja kivikkojen ympärillä. Osa ulottuu lähelle pintaa.
 */
function boulders(g: ScatterGround): ScatterItem[] {
  const out: ScatterItem[] = [];
  const step = SCATTER.boulderStep;
  eachCell(g, step, 1, (p, i, j) => {
    const depth = g.depthAt(p);
    const shore = g.shoreDistance(p);
    if (shore < 2 || g.inReeds(p)) return;
    // Rantakivikko: jyrkällä rannalla tiheämmin, ulottuu parinkymmenen metrin päähän.
    const steep = g.steepness(p);
    let chance = 0.08 * Math.max(0, steep - 0.6) ** 2 * Math.max(0, 1 - shore / 28);
    for (const s of g.shoals) chance += 0.22 * near(p, s.pos, s.radius * 1.3);
    for (const r of g.rockAreas) chance += 0.3 * near(p, r.pos, r.radius * 2.5);
    // Yksittäisiä kiviä siellä täällä matalassa.
    if (depth < 4) chance += 0.022;
    if (hash01(i, j, 31) >= chance) return;
    const radius = 0.3 + hash01(i, j, 32) ** 2 * 1.2;
    // Isoimmat kivet nousevat lähelle pintaa; pinnan yli ei.
    const height = Math.min(radius * (0.8 + hash01(i, j, 33) * 0.7), Math.max(0.2, depth - 0.1));
    out.push({ kind: 'boulder', pos: p, radius, height, density: 1 });
  });
  return out;
}

/**
 * Uposkasvustot: suojaisissa lahdissa ja loivilla rannoilla 0,8–3 m:ssä
 * (ahvenvita, uistinvita, karvalehti, ärviä; hiekalla nuottaruoho).
 */
function weeds(g: ScatterGround): ScatterItem[] {
  const out: ScatterItem[] = [];
  eachCell(g, SCATTER.weedStep, 0.6, (p, i, j) => {
    const depth = g.depthAt(p);
    if (depth < SCATTER.weedDepth.min || depth > SCATTER.weedDepth.max || g.inReeds(p)) return;
    const shelter = Math.max(0, 1.3 - g.steepness(p));
    if (hash01(i, j, 41) >= 0.07 + shelter * 0.3) return;
    const radius = 7 + hash01(i, j, 42) * 11;
    const height = Math.min(0.3 + hash01(i, j, 43) * 0.9, depth - 0.3);
    if (height < 0.25) return;
    out.push({ kind: 'weed', pos: p, radius, height, density: 0.4 + hash01(i, j, 44) * 0.6 });
  });
  return out;
}

/**
 * Risukot ja uppotukit: mökkiläisten ahvenrisukoita laiturien edustalla ja
 * vanhoja tukkeja rannan tuntumassa.
 */
function brush(g: ScatterGround): ScatterItem[] {
  const out: ScatterItem[] = [];
  const ok = (p: Vec2) => {
    if (!g.isWater(p) || g.inReeds(p)) return false;
    const d = g.depthAt(p);
    return d >= SCATTER.brushDepth.min && d <= SCATTER.brushDepth.max;
  };
  g.piers.forEach((pier, k) => {
    // Noin joka kolmannen laiturin edustalla risukko 6–14 m kärjen edessä.
    if (hash01(k, 0, 51) < 0.7) return;
    const len = distance(pier.from, pier.to) || 1;
    const dir = { x: (pier.to.x - pier.from.x) / len, y: (pier.to.y - pier.from.y) / len };
    const reach = 6 + hash01(k, 1, 51) * 8;
    const side = (hash01(k, 2, 51) - 0.5) * 8;
    const p = {
      x: pier.to.x + dir.x * reach - dir.y * side,
      y: pier.to.y + dir.y * reach + dir.x * side,
    };
    if (ok(p))
      out.push({
        kind: 'brush',
        pos: p,
        radius: 2 + hash01(k, 3, 51) * 1.5,
        height: 0.6 + hash01(k, 4, 51) * 0.6,
        density: 1,
      });
  });
  eachCell(g, SCATTER.logStep, 0.5, (p, i, j) => {
    const shore = g.shoreDistance(p);
    if (shore < 8 || shore > 45 || !ok(p) || hash01(i, j, 61) >= 0.1) return;
    out.push({
      kind: 'brush',
      pos: p,
      radius: 2.5 + hash01(i, j, 62) * 2,
      height: 0.4 + hash01(i, j, 63) * 0.5,
      density: 1,
    });
  });
  return out;
}

/** Käy järven läpi ruudukkona; `jitter` siirtää pistettä ruudun sisällä (osuus). */
function eachCell(
  g: ScatterGround,
  step: number,
  jitter: number,
  visit: (p: Vec2, i: number, j: number) => void,
): void {
  const b = g.bounds;
  const cols = Math.ceil((b.maxX - b.minX) / step);
  const rows = Math.ceil((b.maxY - b.minY) / step);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const p = {
        x: b.minX + (i + 0.5 + (hash01(i, j, 7) - 0.5) * jitter) * step,
        y: b.minY + (j + 0.5 + (hash01(i, j, 8) - 0.5) * jitter) * step,
      };
      if (g.isWater(p)) visit(p, i, j);
    }
  }
}

/**
 * Pohjan laatu pisteessä: kivikko jyrkillä rannoilla, matalikoilla ja
 * kivikoissa, lieju syvänteissä ja suojaisissa lahdissa, muuten hiekka.
 */
export function bottomTypeFor(g: ScatterGround, p: Vec2): BottomType {
  const depth = g.depthAt(p);
  const shore = g.shoreDistance(p);
  if (g.rockAreas.some((r) => distance(p, r.pos) < r.radius * 1.6)) return 'rock';
  if (g.shoals.some((s) => distance(p, s.pos) < s.radius * 0.8)) return 'rock';
  const steep = g.steepness(p);
  if (steep > 1.3 && shore < 25) return 'rock';
  const shelter = Math.max(0, 1.2 - steep);
  if (depth >= SCATTER.mudDepth - shelter * 2.5) return 'mud';
  return 'sand';
}
