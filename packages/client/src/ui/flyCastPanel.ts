import type { FlyCastState } from '@lunki/shared';
import { flyLinePose, flyLineProfile, type FlyLinePose, type SidePoint } from '../game/flyLine';
import { flyRodAngle, flyRodTip } from '../game/povRod';
import { t } from '../i18n';
import { panelContext } from './sonarArt';

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
  skyLow: '#2b5674',
  water: '#12324a',
  waterDeep: '#0d263a',
  surface: '#83c2db',
  tube: '#d23a2a',
  tubeDark: '#8c1c1c',
  body: '#39424d',
  bodyLight: '#4d5966',
  head: '#e0b48a',
  cap: '#8c1c1c',
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
  /** Tarkassa kuvassa pisteitä ei pyöristetä pikseleihin. */
  snap = true,
): { x: number; y: number } {
  const x = tip.x + (p.s - pose.tipS) * scale;
  const y =
    p.h <= pose.tipH
      ? WATER_ROW - (p.h / Math.max(0.1, pose.tipH)) * (WATER_ROW - tip.y)
      : tip.y - (p.h - pose.tipH) * LIFT_PX;
  const clamped = Math.max(0, Math.min(HEIGHT - 1, y));
  return snap ? { x: Math.round(x), y: Math.round(clamped) } : { x, y: clamped };
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
    const panel = panelContext(this.canvas, WIDTH, HEIGHT);
    if (!panel) return;
    const { g } = panel;
    if (panel.sharp) {
      this.drawSharp(g, cast, now);
      return;
    }
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

  /**
   * Terävä kuva: sama sivukuva tarkempana. Kalastaja istuu renkaassa, vapa
   * ohenee kärkeä kohti ja siima on yhtenäinen kaari.
   */
  private drawSharp(g: CanvasRenderingContext2D, cast: FlyCastState, now: boolean): void {
    const sky = g.createLinearGradient(0, 0, 0, WATER_ROW);
    sky.addColorStop(0, COLORS.sky);
    sky.addColorStop(1, COLORS.skyLow);
    g.fillStyle = sky;
    g.fillRect(0, 0, WIDTH, WATER_ROW);
    const water = g.createLinearGradient(0, WATER_ROW, 0, HEIGHT);
    water.addColorStop(0, COLORS.water);
    water.addColorStop(1, COLORS.waterDeep);
    g.fillStyle = water;
    g.fillRect(0, WATER_ROW, WIDTH, HEIGHT - WATER_ROW);
    g.lineCap = 'round';
    g.lineJoin = 'round';

    // Rengas sivulta: ponttoni ja sen takana selkänoja, alaosa veden alla.
    g.fillStyle = COLORS.tubeDark;
    g.beginPath();
    g.roundRect(ANGLER_X - 5.5, WATER_ROW - 3.4, 2.6, 4.4, 1);
    g.fill();
    g.fillStyle = COLORS.tube;
    g.beginPath();
    g.roundRect(ANGLER_X - 4.5, WATER_ROW - 1.6, 10.5, 3, 1.5);
    g.fill();
    g.fillStyle = COLORS.tubeDark;
    g.beginPath();
    g.roundRect(ANGLER_X - 4.5, WATER_ROW + 0.3, 10.5, 1.1, 0.55);
    g.fill();
    // Kalastaja: vartalo, pää ja lippis, katse oikealle.
    g.fillStyle = COLORS.body;
    g.beginPath();
    g.roundRect(ANGLER_X - 1.6, WATER_ROW - 6.4, 3.4, 5.4, 1);
    g.fill();
    g.fillStyle = COLORS.head;
    g.beginPath();
    g.arc(ANGLER_X + 0.2, WATER_ROW - 7.9, 1.55, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = COLORS.cap;
    g.beginPath();
    g.arc(ANGLER_X + 0.2, WATER_ROW - 8.2, 1.6, Math.PI, Math.PI * 2);
    g.fill();
    g.fillRect(ANGLER_X + 0.4, WATER_ROW - 8.5, 2.5, 0.5);

    const hand = { x: ANGLER_X + 2, y: WATER_ROW - 5 };
    const angle = flyRodAngle(cast.rod);
    const tip = {
      x: hand.x + Math.cos(angle) * ROD_PX,
      y: hand.y - Math.sin(angle) * ROD_PX,
    };
    // Käsivarsi olkapäältä kahvalle.
    g.strokeStyle = COLORS.bodyLight;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(ANGLER_X + 0.6, WATER_ROW - 5.6);
    g.lineTo(hand.x, hand.y);
    g.stroke();
    // Vapa ohenee kärkeä kohti: paksu tyvi ja ohut kärkiosa.
    g.strokeStyle = COLORS.rod;
    const mid = { x: (hand.x + tip.x) / 2, y: (hand.y + tip.y) / 2 };
    g.lineWidth = 0.7;
    g.beginPath();
    g.moveTo(hand.x, hand.y);
    g.lineTo(mid.x, mid.y);
    g.stroke();
    g.lineWidth = 0.4;
    g.beginPath();
    g.moveTo(mid.x, mid.y);
    g.lineTo(tip.x, tip.y);
    g.stroke();

    const pose = flyLinePose(cast, flyRodTip(cast.rod));
    const scale = panelScale(cast.aerial);
    const pts = flyLineProfile(pose).map((p) => panelPoint(p, pose, tip, scale, false));
    g.strokeStyle = COLORS.line;
    g.lineWidth = 0.45;
    g.beginPath();
    pts.forEach((p, i) => (i === 0 ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y)));
    g.stroke();
    // Vedenpinta siiman päälle: veteen laskeutunut siima jää sen alle.
    g.fillStyle = COLORS.surface;
    g.fillRect(0, WATER_ROW - 0.3, WIDTH, 0.6);
    const fly = pts[pts.length - 1]!;
    // Suorassa siimassa perho välkkyy vihreänä: nyt vaihdetaan suuntaa.
    const flash = now && Math.floor(this.blink / 0.12) % 2 === 0;
    g.fillStyle = flash ? COLORS.now : COLORS.fly;
    g.beginPath();
    g.arc(fly.x, fly.y, flash ? 1.3 : 1, 0, Math.PI * 2);
    g.fill();
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
