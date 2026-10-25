/**
 * Näkyvän kaistaleen leveys HUD-pikseleinä (--u) ja montako astetta yksi
 * pikseli on: 200° näkyy kerralla ja jokainen viiva osuu kokonaiseen pikseliin.
 */
const WIDTH = 80;
const DEG_PER_U = 2.5;
/** Pieni väliviiva näin monen asteen välein. */
const TICK_DEG = 15;

/** Ilmansuunnat lyhenteinä: pää- ja väli-ilmansuunnat. */
const POINTS: [number, string][] = [
  [0, 'P'],
  [45, 'KO'],
  [90, 'I'],
  [135, 'KA'],
  [180, 'E'],
  [225, 'LO'],
  [270, 'L'],
  [315, 'LU'],
];

/** Katsesuunta (rad, 0 = itä, π/2 = pohjoinen) kompassisuunnaksi asteina 0–360, myötäpäivään pohjoisesta. */
export function bearingDeg(heading: number): number {
  const deg = 90 - (heading * 180) / Math.PI;
  return ((deg % 360) + 360) % 360;
}

/**
 * Kaistaleen siirto (u), jolla `bearing` osuu keskelle. Kaistaleella on
 * suunnat -180…540°, joten näkyvä ±90° löytyy aina ilman saumaa. Siirto on
 * kokonaisia pikseleitä, kuten muukin retrografiikka.
 */
export function stripOffset(bearing: number): number {
  return Math.round(WIDTH / 2 - (bearing + 180) / DEG_PER_U);
}

/**
 * Kompassinauha HUD:n yläreunassa: kaistale ilmansuunnista liukuu sen mukaan,
 * mihin kalastaja katsoo, ja keskimerkki näyttää katsesuunnan.
 */
export class CompassDisplay {
  readonly root: HTMLDivElement;
  private readonly strip: HTMLDivElement;
  private offset = NaN;

  constructor(parent: HTMLElement) {
    this.root = div('hud-compass hud-panel');
    this.root.style.width = `calc(var(--u) * ${WIDTH})`;
    this.strip = div('hud-compass-strip');
    for (let deg = -180; deg <= 540; deg += TICK_DEG) {
      const x = (deg + 180) / DEG_PER_U;
      const name = POINTS.find(([d]) => d === ((deg % 360) + 360) % 360)?.[1];
      const tick = div(name ? 'hud-compass-tick major' : 'hud-compass-tick');
      tick.style.left = `calc(var(--u) * ${x})`;
      this.strip.appendChild(tick);
      if (name) {
        const label = div(name.length === 1 ? 'hud-compass-label main' : 'hud-compass-label');
        label.textContent = name;
        // Viivan keskelle (viiva on pikselin levyinen).
        label.style.left = `calc(var(--u) * ${x + 0.5})`;
        this.strip.appendChild(label);
      }
    }
    this.root.append(this.strip, div('hud-compass-needle'));
    parent.appendChild(this.root);
  }

  /** `heading` = katsesuunta radiaaneina (TubeState.heading). */
  update(heading: number): void {
    const offset = stripOffset(bearingDeg(heading));
    if (offset === this.offset) return;
    this.offset = offset;
    this.strip.style.transform = `translateX(calc(var(--u) * ${offset}))`;
  }
}

function div(className: string): HTMLDivElement {
  const e = document.createElement('div');
  e.className = className;
  return e;
}
