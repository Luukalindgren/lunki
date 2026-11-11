/**
 * Vavan nykäisy peliohjaimen oikealla tatilla (#595): nopea nykäisy taakse
 * (alas) ja takaisin keskelle on virvelin nykäisy ja ison kalan vastaisku,
 * sama kuin `twitch`-nappi. Hidas veto, sivuliike tai tatin kierto ei nykäise.
 */
export const STICK_FLICK = {
  /** Tatti on palannut keskelle tämän alla (kuolleen alueen jälkeen 0–1). */
  center: 0.15,
  /** Tatti käy alhaalla ja palaa keskelle tässä ajassa (s)… */
  time: 0.3,
  /** …vähintään näin syvällä… */
  down: 0.7,
  /** …eikä kierrä matkalla tätä enempää (rad). */
  turn: 0.6,
} as const;

const TAU = Math.PI * 2;
const wrap = (a: number) => a - TAU * Math.round(a / TAU);

export class StickFlick {
  /** Aika siitä, kun tatti lähti keskeltä (s), ja matkan huiput. */
  private out: { time: number; down: number; side: number; turned: number; angle: number } | null =
    null;

  /**
   * Askel tatin asennosta (-1…1, y kasvaa alas); tosi, kun nykäisy valmistui.
   * `allowed` on tosi, kun virvelin viehe on vedessä ja tatti on vapaa.
   */
  step(stick: { x: number; y: number }, dt: number, allowed: boolean): boolean {
    if (Math.hypot(stick.x, stick.y) < STICK_FLICK.center) {
      const o = this.out;
      this.out = null;
      return (
        allowed &&
        o !== null &&
        o.time <= STICK_FLICK.time &&
        o.down >= STICK_FLICK.down &&
        o.down > o.side &&
        o.turned <= STICK_FLICK.turn
      );
    }
    const angle = Math.atan2(stick.y, stick.x);
    const o = (this.out ??= { time: 0, down: 0, side: 0, turned: 0, angle });
    o.time += dt;
    o.down = Math.max(o.down, stick.y);
    o.side = Math.max(o.side, Math.abs(stick.x));
    o.turned += Math.abs(wrap(angle - o.angle));
    o.angle = angle;
    // Tatti ei ollut vapaa liikkeen aikana: ei nykäisyä tästä liikkeestä.
    if (!allowed) o.time = Infinity;
    return false;
  }
}
