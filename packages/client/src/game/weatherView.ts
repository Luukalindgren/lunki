import * as THREE from 'three';
import { weatherAt, type Vec2, type WeatherNow, type WeatherPlan } from '@lunki/shared';
import { t as tr } from '../i18n';
import { skyName, warningText } from '../i18n/names';

/** Sadepisaroiden enimmäismäärä ja putoamisnopeus (m/s). */
const DROPS = 900;
const FALL_SPEED = 9;
const DROP_LENGTH = 0.7;
/** Sadealueen säde kameran ympärillä POV:ssa (m). */
const POV_RADIUS = 25;
const TOP = 22;

/** Kahdeksasta ilmansuunnasta (0 = itä, vastapäivään) se, johon kulma osoittaa. */
const octant = (angle: number): Octant => {
  const k = Math.round(angle / (Math.PI / 4));
  return (((k % 8) + 8) % 8) as Octant;
};
type Octant = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** Ilmansuunta, jossa kulma `angle` osoittaa (esim. "lounaassa"). */
export function compassIn(angle: number): string {
  return tr(`in.${octant(angle)}`);
}

/** Mistä tuulee (ja aallot tulevat), esim. "lounaasta". */
export function windFrom(windDir: number): string {
  return tr(`from.${octant(windDir + Math.PI)}`);
}

/** Tuulen nimi: tuuli nimetään suunnasta, josta se tulee. */
export function windName(windDir: number): string {
  return tr(`wind.${octant(windDir + Math.PI)}`);
}

export interface WeatherEvents {
  message: (text: string) => void;
  rumble: () => void;
}

/**
 * Sään näkyvä puoli: sade, taivaan tummuminen ja ennakkovaroitukset.
 * Sää itse lasketaan jaetusta suunnitelmasta kisa-ajan mukaan.
 */
export class WeatherView {
  readonly group = new THREE.Group();
  now: WeatherNow;
  private readonly drops: THREE.LineSegments;
  private readonly positions: Float32Array;
  /** Pisaroiden paikat suhteessa sadealueen keskipisteeseen. */
  private readonly offsets: Float32Array;
  private readonly warned = new Set<string>();
  private rumbleTimer = 6;
  private seed = 1;

  constructor(private readonly plan: WeatherPlan) {
    this.now = weatherAt(plan, 0);
    this.positions = new Float32Array(DROPS * 6);
    this.offsets = new Float32Array(DROPS * 3);
    for (let i = 0; i < DROPS; i++) {
      this.offsets[i * 3] = this.rand() * 2 - 1;
      this.offsets[i * 3 + 1] = this.rand() * TOP;
      this.offsets[i * 3 + 2] = this.rand() * 2 - 1;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.drops = new THREE.LineSegments(
      g,
      new THREE.LineBasicMaterial({ color: 0xb8c8d8, transparent: true, opacity: 0.7 }),
    );
    this.drops.frustumCulled = false;
    this.group.add(this.drops);
    this.group.name = 'weather';
  }

  /** Päivittää sään kisa-ajan t mukaan ja liikuttaa sadetta keskipisteen ympärillä. */
  /**
   * `topView` = ylhäältä-näkymän pikselikoko (m) ja leveys pikseleinä; null = POV.
   */
  update(
    dt: number,
    t: number,
    center: Vec2,
    topView: { metersPerPixel: number; width: number } | null,
    events: WeatherEvents,
  ): WeatherNow {
    const prev = this.now;
    const now = (this.now = weatherAt(this.plan, t));
    if (now.sky !== prev.sky && t > 0.5)
      events.message(tr('weather.change', { sky: skyName(now.sky) }));
    // Kukin varoitus kerran kutakin tulevaa muutosta kohden; samanaikaiset yhdessä.
    const fresh = now.warnings.filter((w) => {
      const key = `${Math.round(t + now.untilChange)}:${w}`;
      if (this.warned.has(key)) return false;
      this.warned.add(key);
      return true;
    });
    if (fresh.length > 0) events.message(fresh.map(warningText).join('\n'));
    if (fresh.includes('rumble')) events.rumble();
    // Ukkosella jyrisee silloin tällöin (salamat tulevat omana ominaisuutenaan).
    if (now.sky === 'thunder' || now.sky === 'storm') {
      this.rumbleTimer -= dt;
      if (this.rumbleTimer <= 0) {
        events.rumble();
        this.rumbleTimer = 8 + this.rand() * 14;
      }
    }
    this.updateRain(dt, center, topView);
    return now;
  }

  private updateRain(
    dt: number,
    center: Vec2,
    topView: { metersPerPixel: number; width: number } | null,
  ): void {
    const count = Math.round(DROPS * this.now.rain);
    this.drops.visible = count > 0;
    this.drops.geometry.setDrawRange(0, count * 2);
    if (count === 0) return;
    // Ylhäältä sade peittää näkyvän alueen; pisarat näkyvät vinoina viiruina.
    const r = topView ? topView.metersPerPixel * topView.width * 0.6 : POV_RADIUS;
    // Tuuli kallistaa pisaroita: vaakanopeus suhteessa putoamiseen.
    const drift = this.now.windSpeed * 0.6;
    const dx = Math.cos(this.now.windDir) * drift;
    const dy = Math.sin(this.now.windDir) * drift;
    const streak = topView ? topView.metersPerPixel * 3 : 0;
    const sx = (dx / FALL_SPEED) * DROP_LENGTH + streak;
    const sz = (-dy / FALL_SPEED) * DROP_LENGTH - streak;
    for (let i = 0; i < count; i++) {
      const o = i * 3;
      let h = this.offsets[o + 1]! - FALL_SPEED * dt;
      if (h < 0) {
        h += TOP;
        this.offsets[o] = this.rand() * 2 - 1;
        this.offsets[o + 2] = this.rand() * 2 - 1;
      }
      this.offsets[o + 1] = h;
      // Pisarat ajelehtivat tuulen mukana putoamisen aikana.
      const fall = (TOP - h) / FALL_SPEED;
      const x = center.x + this.offsets[o]! * r + dx * fall;
      const z = -(center.y + this.offsets[o + 2]! * r) - dy * fall;
      const p = i * 6;
      this.positions[p] = x;
      this.positions[p + 1] = h;
      this.positions[p + 2] = z;
      this.positions[p + 3] = x - sx;
      this.positions[p + 4] = h + DROP_LENGTH;
      this.positions[p + 5] = z - sz;
    }
    this.drops.geometry.getAttribute('position').needsUpdate = true;
  }

  private rand(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }
}
