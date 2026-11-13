import { ECHO_STYLE, sonarRange, type SonarPing } from '@lunki/shared';
import { decimal, t } from '../i18n';
import {
  SONAR_COLORS,
  drawBed,
  drawCover,
  drawEchoArch,
  drawWater,
  panelContext,
  type BedColumn,
} from './sonarArt';

/** Näytön koko sisäisinä pikseleinä (yksi pikseli = HUD:n --u). */
const WIDTH = 64;
const HEIGHT = 44;
/** Uusi sarake näin usein (s): koko näyttö kattaa noin viisi sekuntia. */
const COLUMN_TIME = 0.08;

const COLORS = SONAR_COLORS;

/**
 * Kaikuluotain HUD:ssa: rullaava kuva renkaan alta. Pohja ja kalat piirretään
 * pikseleinä kankaalle, joka skaalautuu muun HUD:n mukana. Terävällä ilmeellä
 * sama kuva piirretään tarkempana (`sonarArt.ts`).
 */
export class SonarDisplay {
  readonly root: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly label: HTMLDivElement;
  private readonly columns: SonarPing[] = [];
  /** Vanhimman sarakkeen järjestysnumero: tarkan kuvan kasvit pysyvät samoina kuvan rullatessa. */
  private serial = 0;
  private timer = 0;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'hud-sonar hud-panel';
    this.canvas = document.createElement('canvas');
    this.label = document.createElement('div');
    this.label.className = 'hud-sonar-label';
    this.root.append(this.canvas, this.label);
    parent.appendChild(this.root);
  }

  toggle(): void {
    this.root.hidden = !this.root.hidden;
  }

  /** Kutsutaan joka askeleella; `ping` luodaan vain, kun uusi sarake tarvitaan. */
  update(dt: number, ping: () => SonarPing): void {
    if (this.root.hidden) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer += COLUMN_TIME;
    if (this.timer < 0) this.timer = COLUMN_TIME;
    const p = ping();
    this.columns.push(p);
    if (this.columns.length > WIDTH) {
      this.columns.shift();
      this.serial++;
    }
    const n = p.echoes.length;
    const fish = n === 0 ? '' : n === 1 ? t('sonar.fishOne') : t('sonar.fishMany', { n });
    this.label.textContent = t('sonar.depth', { depth: decimal(p.bottom, 1) }) + fish;
    this.draw();
  }

  private draw(): void {
    const panel = panelContext(this.canvas, WIDTH, HEIGHT);
    if (!panel) return;
    const { g } = panel;
    if (panel.sharp) {
      this.drawSharp(g);
      return;
    }
    g.fillStyle = COLORS.water;
    g.fillRect(0, 0, WIDTH, HEIGHT);
    const range = sonarRange(Math.max(...this.columns.map((c) => c.bottom)));
    const y = (depth: number) => Math.round((depth / range) * (HEIGHT - 1));
    // Metrin välein himmeä apuviiva.
    g.fillStyle = COLORS.grid;
    for (let d = 1; d < range; d++) {
      for (let x = (d % 2) * 2; x < WIDTH; x += 4) g.fillRect(x, y(d), 1, 1);
    }
    const offset = WIDTH - this.columns.length;
    this.columns.forEach((c, i) => {
      const x = offset + i;
      const by = y(c.bottom);
      g.fillStyle = COLORS.bottom;
      g.fillRect(x, by, 1, HEIGHT - by);
      // Kova pohja kaikuu paksumpana ja kirkkaampana viivana.
      g.fillStyle =
        c.floor === 'rock'
          ? COLORS.rockLine
          : c.floor === 'mud'
            ? COLORS.mudLine
            : COLORS.bottomLine;
      g.fillRect(x, by, 1, c.floor === 'rock' ? 2 : 1);
      if (c.cover) {
        // Kivi kohoumana, kasvusto vihreänä ja risukko ruskeana kerroksena pohjan päällä.
        const top = Math.min(by - 1, y(c.bottom - c.cover.height));
        g.fillStyle = COLORS[c.cover.kind];
        if (c.cover.kind === 'boulder') g.fillRect(x, top, 1, by - top);
        else for (let py = top + (x % 2); py < by; py += 2) g.fillRect(x, py, 1, 1);
      }
      for (const e of c.echoes) {
        const ey = Math.min(by - 1, y(e.depth));
        // Isompi kala näkyy paksumpana kaikuna: keltainen, oranssi, punainen,
        // violetti ja jättikala mustana, kolmen sarakkeen levyisenä.
        const style = ECHO_STYLE[e.size]!;
        const top = ey - style.px + 1;
        g.fillStyle = style.color;
        if (e.size === 4) g.fillRect(x - 1, top, 3, style.px);
        else g.fillRect(x, top, 1, style.px);
      }
    });
  }

  /** Terävä kuva: pohja kaarena, kasvusto varsina, kivet kumpuina ja kalat kaarina. */
  private drawSharp(g: CanvasRenderingContext2D): void {
    const range = sonarRange(Math.max(...this.columns.map((c) => c.bottom)));
    const y = (depth: number) => (depth / range) * (HEIGHT - 1);
    drawWater(
      g,
      WIDTH,
      HEIGHT,
      Array.from({ length: Math.max(0, Math.ceil(range) - 1) }, (_, i) => y(i + 1)),
    );
    const offset = WIDTH - this.columns.length;
    const bed: BedColumn[] = this.columns.map((c, i) => ({
      x: offset + i + 0.5,
      y: y(c.bottom),
      floor: c.floor,
      cover: c.cover
        ? { kind: c.cover.kind, top: Math.min(y(c.bottom) - 1, y(c.bottom - c.cover.height)) }
        : null,
      key: this.serial + i,
    }));
    drawBed(g, bed, HEIGHT);
    drawCover(g, bed);
    this.columns.forEach((c, i) => {
      for (const e of c.echoes) {
        drawEchoArch(g, offset + i + 0.5, Math.min(y(c.bottom) - 1, y(e.depth)), e.size);
      }
    });
  }
}
