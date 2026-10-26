import { ECHO_STYLE, GIANT_RIM, sonarRange, type SonarPing } from '@lunki/shared';
import { decimal, t } from '../i18n';

/** Näytön koko sisäisinä pikseleinä (yksi pikseli = HUD:n --u). */
const WIDTH = 64;
const HEIGHT = 44;
/** Uusi sarake näin usein (s): koko näyttö kattaa noin viisi sekuntia. */
const COLUMN_TIME = 0.08;

const COLORS = {
  water: '#12324a',
  grid: '#1d4a66',
  bottom: '#6b4a2b',
  bottomLine: '#e0b060',
  /** Kova kivikkopohja kaikuu kirkkaampana, pehmeä lieju himmeämpänä. */
  rockLine: '#fff0c0',
  mudLine: '#9a7444',
  boulder: '#8e99a4',
  weed: '#3f8f3a',
  brush: '#7a5230',
};

/**
 * Kaikuluotain HUD:ssa: rullaava kuva renkaan alta. Pohja ja kalat piirretään
 * pikseleinä kankaalle, joka skaalautuu muun HUD:n mukana.
 */
export class SonarDisplay {
  readonly root: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly label: HTMLDivElement;
  private readonly columns: SonarPing[] = [];
  private timer = 0;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'hud-sonar hud-panel';
    this.canvas = document.createElement('canvas');
    this.canvas.width = WIDTH;
    this.canvas.height = HEIGHT;
    this.ctx = this.canvas.getContext('2d');
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
    if (this.columns.length > WIDTH) this.columns.shift();
    const n = p.echoes.length;
    const fish = n === 0 ? '' : n === 1 ? t('sonar.fishOne') : t('sonar.fishMany', { n });
    this.label.textContent = t('sonar.depth', { depth: decimal(p.bottom, 1) }) + fish;
    this.draw();
  }

  private draw(): void {
    const g = this.ctx;
    if (!g) return;
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
        // violetti ja jättikala mustana valkoisella reunalla, kolmen sarakkeen levyisenä.
        const style = ECHO_STYLE[e.size]!;
        const top = ey - style.px + 1;
        if (e.size === 4) {
          g.fillStyle = GIANT_RIM;
          g.fillRect(x - 2, top, 5, style.px);
          g.fillRect(x - 1, top - 1, 3, style.px + 2);
          g.fillStyle = style.color;
          g.fillRect(x - 1, top, 3, style.px);
        } else {
          g.fillStyle = style.color;
          g.fillRect(x, top, 1, style.px);
        }
      }
    });
  }
}
