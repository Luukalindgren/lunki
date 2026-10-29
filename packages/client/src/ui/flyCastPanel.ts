import type { FlyCastState } from '@lunki/shared';
import { flyLinePose, flyLineProfile, type FlyLinePose, type SidePoint } from '../game/flyLine';
import { flyRodAngle, flyRodTip } from '../game/povRod';
import { t } from '../i18n';

/** Näytön koko sisäisinä pikseleinä (yksi pikseli = HUD:n --u), sama kuin vieheluotaimessa. */
const WIDTH = 96;
const HEIGHT = 44;
/** Vedenpinnan rivi. */
const WATER_ROW = 36;
/** Kalastaja keskellä: takaheitto vasemmalle, eteenheitto oikealle. */
const ANGLER_X = 48;
/** Vavan pituus näytöllä (px). */
const ROD_PX = 13;
/** Korkeus vavan kärjen yläpuolella (px/m): silmukka näkyy korostettuna. */
const LIFT_PX = 5;

const COLORS = {
  sky: '#20425c',
  water: '#12324a',
  surface: '#83c2db',
  tube: '#d23a2a',
  body: '#39424d',
  head: '#e0b48a',
  rod: '#f6d04d',
  line: '#c3cbd2',
  fly: '#f08a2c',
  now: '#7bd66f',
};

/** Näytön vaakamittakaava (px/m): koko siima mahtuu kummallekin puolelle. */
export const panelScale = (length: number) => (WIDTH / 2 - ROD_PX - 3) / Math.max(8, length + 2);

/**
 * Siiman piste näytön pikseleiksi. Vaakasuunta on mittakaavassa, pystysuunta
 * vedestä vavan kärkeen venytetään kärjen korkeudelle, ja kärjen yläpuolella
 * korostetaan, jotta kapeakin silmukka näkyy.
 */
export function panelPoint(
  p: SidePoint,
  pose: FlyLinePose,
  tip: { x: number; y: number },
  scale: number,
): { x: number; y: number } {
  const x = tip.x + (p.s - pose.tipS) * scale;
  const y =
    p.h <= pose.tipH
      ? WATER_ROW - (p.h / Math.max(0.1, pose.tipH)) * (WATER_ROW - tip.y)
      : tip.y - (p.h - pose.tipH) * LIFT_PX;
  return { x: Math.round(x), y: Math.round(Math.max(0, Math.min(HEIGHT - 1, y))) };
}

/**
 * Sivukuva perhoheitosta (#236): kalastaja sivulta, vapa ja siima ilmassa.
 * Takaheittoa ei näe kalastajan silmin eikä ylhäältä, joten paneelista näkee
 * silmukan aukeamisen ja siiman suoristumisen takana. Näkyy vain heiton ajan,
 * ja sen voi piilottaa (P).
 */
export class FlyCastPanel {
  readonly root: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly label: HTMLDivElement;
  /** Pelaaja on piilottanut paneelin (P). */
  private off = false;
  private active = false;
  private blink = 0;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'hud-fly-panel hud-panel';
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

  /** Paneeli päälle tai pois; palauttaa uuden tilan. */
  toggle(): boolean {
    this.off = !this.off;
    this.root.hidden = this.off || !this.active;
    return !this.off;
  }

  /** `cast` = heiton tila (null = ei heittoa), `marker` = "nyt!"-merkki käytössä. */
  update(dt: number, cast: FlyCastState | null, marker: boolean): void {
    this.active = cast !== null;
    this.root.hidden = this.off || !cast;
    if (!cast || this.off) return;
    this.blink += dt;
    const straight = cast.phase === 'loop' && cast.loopAge >= cast.loopTime;
    const now = marker && straight;
    this.label.textContent = labelFor(cast, now);
    this.label.classList.toggle('now', now);
    this.draw(cast, now);
  }

  private draw(cast: FlyCastState, now: boolean): void {
    const g = this.ctx;
    if (!g) return;
    g.fillStyle = COLORS.sky;
    g.fillRect(0, 0, WIDTH, WATER_ROW);
    g.fillStyle = COLORS.water;
    g.fillRect(0, WATER_ROW, WIDTH, HEIGHT - WATER_ROW);
    g.fillStyle = COLORS.surface;
    g.fillRect(0, WATER_ROW, WIDTH, 1);

    // Kalastaja renkaassa sivulta, katse oikealle.
    g.fillStyle = COLORS.tube;
    g.fillRect(ANGLER_X - 4, WATER_ROW - 1, 9, 2);
    g.fillStyle = COLORS.body;
    g.fillRect(ANGLER_X - 1, WATER_ROW - 6, 3, 5);
    g.fillStyle = COLORS.head;
    g.fillRect(ANGLER_X - 1, WATER_ROW - 9, 3, 3);

    // Vapa kädestä kulmassaan; kärki on siiman alkupiste.
    const hand = { x: ANGLER_X + 2, y: WATER_ROW - 5 };
    const angle = flyRodAngle(cast.rod);
    const tip = {
      x: Math.round(hand.x + Math.cos(angle) * ROD_PX),
      y: Math.round(hand.y - Math.sin(angle) * ROD_PX),
    };
    plotLine(g, hand, tip, COLORS.rod);

    const pose = flyLinePose(cast, flyRodTip(cast.rod));
    const scale = panelScale(cast.aerial);
    const pts = flyLineProfile(pose).map((p) => panelPoint(p, pose, tip, scale));
    for (let i = 1; i < pts.length; i++) plotLine(g, pts[i - 1]!, pts[i]!, COLORS.line);
    const fly = pts[pts.length - 1]!;
    // Suorassa siimassa perho välkkyy vihreänä: nyt vaihdetaan suuntaa.
    const flash = now && Math.floor(this.blink / 0.12) % 2 === 0;
    g.fillStyle = flash ? COLORS.now : COLORS.fly;
    g.fillRect(fly.x - 1, fly.y - 1, 2, 2);
  }
}

function labelFor(cast: FlyCastState, now: boolean): string {
  if (cast.busy > 0) return t('flyPanel.busy');
  if (now) return t('game.flyNow');
  if (cast.phase === 'ready') return t(cast.inWater ? 'flyPanel.pickup' : 'flyPanel.ready');
  const stroke = t(cast.dir < 0 ? 'flyPanel.back' : 'flyPanel.forward', {
    m: Math.round(cast.aerial),
  });
  // Siimakäden veto osui tähän liikkeeseen (#398).
  return cast.hauled ? `${stroke} · ${t('flyPanel.haul')}` : stroke;
}

/** Pikselin levyinen viiva kahden pisteen välille. */
function plotLine(
  g: CanvasRenderingContext2D,
  a: { x: number; y: number },
  b: { x: number; y: number },
  color: string,
): void {
  g.fillStyle = color;
  const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y), 1);
  for (let i = 0; i <= steps; i++) {
    g.fillRect(
      Math.round(a.x + ((b.x - a.x) * i) / steps),
      Math.round(a.y + ((b.y - a.y) * i) / steps),
      1,
      1,
    );
  }
}
