import { distance, sonarRange, type Structure, type Vec2 } from '@lunki/shared';
import { lureColor } from '../game/lureColor';

/** Näytön koko sisäisinä pikseleinä (yksi pikseli = HUD:n --u). */
const WIDTH = 96;
const HEIGHT = 44;
/** Pinta on ylimmällä rivillä; syvyysasteikko alkaa sen alta. */
const SURFACE_ROW = 0;
/** Pohjan profiili ja vieheen jälki päivittyvät näin usein (s). */
const SAMPLE_TIME = 0.1;
/** Vieheen jälki: näin monta näytettä (noin puoli minuuttia). */
const TRAIL_MAX = 300;
/** Lähempänä pohjaa (m) viehe voi tarttua rakenteisiin. */
const NEAR_BOTTOM = 0.35;

const COLORS = {
  water: '#12324a',
  surface: '#83c2db',
  grid: '#1d4a66',
  bottom: '#6b4a2b',
  bottomLine: '#e0b060',
  land: '#3f6b2a',
  rocks: '#8e99a4',
  tree: '#a0703c',
  reeds: '#5fae3c',
  trail: '#4f6f86',
  glint: '#eef2f3',
  small: '#f6d04d',
  big: '#f08a2c',
  huge: '#d23a2a',
  bite: '#d23a2a',
};

export interface LureSonarFish {
  pos: Vec2;
  depth: number;
  weight: number;
}

/** Yhden hetken tiedot vieheestä ja järvestä siiman suunnassa. */
export interface LureSonarFrame {
  /** Vavan kärki: näytön vasen reuna. */
  tip: Vec2;
  lure: Vec2;
  depth: number;
  depthAt(p: Vec2): number;
  isWater(p: Vec2): boolean;
  structureAt?(p: Vec2): Structure | null;
  /** Vieheen perässä uivat kalat ja kiinni oleva kala. */
  fish: readonly LureSonarFish[];
  /** Kala iski: kelaa nyt. */
  bite: boolean;
  /** Kala on kiinni. */
  hooked: boolean;
  /** Viehe on tarttunut pohjaan. */
  snag: boolean;
}

/** Yksi sarake pohjan profiilia: syvyys (m) ja rakenne, null = maata. */
export interface ProfileColumn {
  bottom: number | null;
  structure: Structure['kind'] | null;
}

/** Näytön leveys metreinä: viiden metrin portaissa, vähintään 10 m. */
export function lureSonarSpan(dist: number): number {
  return Math.max(10, Math.ceil((dist * 1.1 + 1) / 5) * 5);
}

/** Etäisyys vavan kärjestä siiman suuntaan (projektio kärjestä vieheeseen kulkevalle suoralle). */
export function alongLine(tip: Vec2, dir: Vec2, p: Vec2): number {
  return (p.x - tip.x) * dir.x + (p.y - tip.y) * dir.y;
}

/** Pohjan profiili kärjestä vieheen suuntaan `span` metrin matkalta, `columns` saraketta. */
export function lureProfile(
  frame: Pick<LureSonarFrame, 'tip' | 'depthAt' | 'isWater' | 'structureAt'>,
  dir: Vec2,
  span: number,
  columns = WIDTH,
): ProfileColumn[] {
  return Array.from({ length: columns }, (_, i) => {
    const d = (i / (columns - 1)) * span;
    const p = { x: frame.tip.x + dir.x * d, y: frame.tip.y + dir.y * d };
    if (!frame.isWater(p)) return { bottom: null, structure: null };
    const s = frame.structureAt?.(p)?.kind ?? null;
    return { bottom: frame.depthAt(p), structure: s === 'dropoff' ? null : s };
  });
}

/**
 * Vieheluotain: poikkileikkaus järvestä siiman suunnassa. Vasemmalla
 * kalastaja, oikealla viehe; pinta ylhäällä ja pohja alhaalla. Viehe jättää
 * jäljen, joten uppoaminen ja kelauksen nousu näkyvät kaarena. Vieheen
 * perässä uivat kalat näkyvät kaikuina ja tärppi välkkyy.
 */
export class LureSonarDisplay {
  readonly root: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly label: HTMLDivElement;
  /** Pelaaja on piilottanut näkymän (L / SYV). */
  private off = false;
  private active = false;
  private timer = 0;
  private blink = 0;
  private span = 0;
  private range = 3;
  private dir: Vec2 = { x: 1, y: 0 };
  private profile: ProfileColumn[] = [];
  /** Vieheen kulkema reitti maailmassa ja syvyys. */
  private readonly trail: { pos: Vec2; depth: number }[] = [];

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'hud-lure-sonar hud-panel';
    this.root.hidden = true;
    this.canvas = document.createElement('canvas');
    this.canvas.width = WIDTH;
    this.canvas.height = HEIGHT;
    this.ctx = this.canvas.getContext('2d');
    this.label = document.createElement('div');
    this.label.className = 'hud-sonar-label';
    this.root.append(this.canvas, this.label);
    parent.appendChild(this.root);
  }

  /** Näkymä päälle tai pois; palauttaa uuden tilan. */
  toggle(): boolean {
    this.off = !this.off;
    this.root.hidden = this.off || !this.active;
    return !this.off;
  }

  /**
   * Kutsutaan joka askeleella; `frame` luodaan vain, kun näyttö päivittyy.
   * `inWater` = viehe on vedessä (ei ilmassa, kelalla tai maalla).
   */
  update(dt: number, inWater: boolean, frame: () => LureSonarFrame): void {
    if (!inWater) {
      this.active = false;
      this.root.hidden = true;
      this.trail.length = 0;
      this.span = 0;
      return;
    }
    // Uusi heitto: näyttö aloittaa heti, leveys heiton pituudesta.
    if (!this.active) this.timer = 0;
    this.active = true;
    this.root.hidden = this.off;
    this.blink += dt;
    this.timer -= dt;
    if (this.timer > 0 || this.off) return;
    this.timer += SAMPLE_TIME;
    if (this.timer < 0) this.timer = SAMPLE_TIME;
    const f = frame();
    if (this.span === 0) this.span = lureSonarSpan(distance(f.tip, f.lure));
    this.sample(f);
    this.draw(f);
  }

  private sample(frame: LureSonarFrame): void {
    const d = distance(frame.tip, frame.lure);
    if (d > 0.01) {
      this.dir = { x: (frame.lure.x - frame.tip.x) / d, y: (frame.lure.y - frame.tip.y) / d };
    }
    // Rengas voi ajautua kauemmas vieheestä: näyttö levenee tarvittaessa.
    if (d > this.span * 0.95) this.span = lureSonarSpan(d);
    this.profile = lureProfile(frame, this.dir, this.span);
    this.trail.push({ pos: { ...frame.lure }, depth: frame.depth });
    if (this.trail.length > TRAIL_MAX) this.trail.shift();
    const deepest = Math.max(
      frame.depth,
      ...this.profile.map((c) => c.bottom ?? 0),
      ...frame.fish.map((f) => f.depth),
    );
    this.range = sonarRange(deepest);
    const bottom = frame.depthAt(frame.lure);
    this.label.textContent = labelFor(frame, bottom, this.blink);
    this.label.classList.toggle('alert', frame.bite || frame.snag);
    this.label.classList.toggle(
      'warn',
      !frame.bite && !frame.snag && !frame.hooked && bottom - frame.depth < NEAR_BOTTOM,
    );
  }

  private draw(frame: LureSonarFrame): void {
    const g = this.ctx;
    if (!g) return;
    const x = (dist: number) => Math.round((dist / this.span) * (WIDTH - 1));
    const y = (depth: number) =>
      SURFACE_ROW + 1 + Math.round((depth / this.range) * (HEIGHT - SURFACE_ROW - 2));
    g.fillStyle = COLORS.water;
    g.fillRect(0, 0, WIDTH, HEIGHT);
    // Metrin välein himmeä apuviiva.
    g.fillStyle = COLORS.grid;
    for (let d = 1; d < this.range; d++) {
      for (let px = (d % 2) * 2; px < WIDTH; px += 4) g.fillRect(px, y(d), 1, 1);
    }
    g.fillStyle = COLORS.surface;
    g.fillRect(0, SURFACE_ROW, WIDTH, 1);

    this.profile.forEach((c, i) => {
      if (c.bottom === null) {
        g.fillStyle = COLORS.land;
        g.fillRect(i, SURFACE_ROW, 1, HEIGHT - SURFACE_ROW);
        return;
      }
      const by = y(c.bottom);
      g.fillStyle = COLORS.bottom;
      g.fillRect(i, by, 1, HEIGHT - by);
      g.fillStyle = COLORS.bottomLine;
      g.fillRect(i, by, 1, 1);
      if (c.structure === 'reeds') {
        // Kaislat kasvavat pohjasta pintaan asti.
        g.fillStyle = COLORS.reeds;
        for (let py = SURFACE_ROW + 1; py < by; py += 2) g.fillRect(i, py, 1, 1);
      } else if (c.structure === 'rocks') {
        g.fillStyle = COLORS.rocks;
        g.fillRect(i, by - 2 + (i % 2), 1, 2 - (i % 2));
      } else if (c.structure === 'tree') {
        g.fillStyle = COLORS.tree;
        g.fillRect(i, by - 1 - (i % 3), 1, 1 + (i % 3));
      }
    });

    // Vieheen jälki himmeänä: uppoaminen ja nousu kaarena.
    g.fillStyle = COLORS.trail;
    for (const t of this.trail) {
      const tx = x(alongLine(frame.tip, this.dir, t.pos));
      if (tx >= 0 && tx < WIDTH) g.fillRect(tx, y(t.depth), 1, 1);
    }

    for (const f of frame.fish) {
      const fx = x(alongLine(frame.tip, this.dir, f.pos));
      if (fx < 0 || fx >= WIDTH) continue;
      // Isompi kala näkyy paksumpana ja punaisempana kaikuna, kuten renkaan luotaimessa.
      const size = f.weight < 0.4 ? 1 : f.weight < 2 ? 2 : 3;
      g.fillStyle = size === 1 ? COLORS.small : size === 2 ? COLORS.big : COLORS.huge;
      const fy = y(f.depth);
      g.fillRect(fx - size, fy, size * 2 + 1, 1);
      if (size > 1) g.fillRect(fx - size + 1, fy - 1, size * 2 - 1, 1);
    }

    const lx = Math.min(WIDTH - 2, x(distance(frame.tip, frame.lure)));
    const ly = Math.min(HEIGHT - 2, y(frame.depth));
    const flash = Math.floor(this.blink / 0.15) % 2 === 0;
    if (frame.bite && flash) {
      // Tärppi: punainen rengas vieheen ympärillä.
      g.fillStyle = COLORS.bite;
      g.fillRect(lx - 2, ly - 2, 6, 1);
      g.fillRect(lx - 2, ly + 3, 6, 1);
      g.fillRect(lx - 2, ly - 1, 1, 4);
      g.fillRect(lx + 3, ly - 1, 1, 4);
    }
    g.fillStyle = frame.snag ? COLORS.bite : hex(lureColor(frame.depth));
    g.fillRect(lx, ly, 2, 2);
    g.fillStyle = COLORS.glint;
    g.fillRect(lx, ly, 1, 1);
  }
}

function labelFor(frame: LureSonarFrame, bottom: number, blink: number): string {
  if (frame.bite) return Math.floor(blink / 0.3) % 2 === 0 ? 'TÄRPPI! KELAA!' : 'TÄRPPI!';
  if (frame.snag) return 'Pohjassa kiinni!';
  return `Viehe ${fi(frame.depth)} / pohja ${fi(bottom)} m`;
}

const fi = (v: number) => v.toFixed(1).replace('.', ',');
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
