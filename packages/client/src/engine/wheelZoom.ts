/** Kosketuslevyn vieritys (px), joka vaihtaa yhden zoomitason. */
export const TOUCHPAD_STEP_PX = 150;
/** Nipistys tuottaa pieniä delta-arvoja: kerroin vierityksen tasolle. */
const PINCH_GAIN = 4;
/** Askeleen jälkeen kosketuslevyn liike ohitetaan hetken (hitausvieritys). */
export const TOUCHPAD_COOLDOWN_MS = 250;
/** Näin pitkä tauko nollaa kesken jääneen kertymän. */
const IDLE_RESET_MS = 300;

/** WheelEventin kentät, joita zoomaus tarvitsee. */
export interface WheelLike {
  deltaY: number;
  deltaMode: number;
  ctrlKey: boolean;
  /** Vanhentunut mutta Chromiumissa, Safarissa ja Firefoxissa yhä olemassa. */
  wheelDeltaY?: number;
}

/** Pikselitilan delta, jota pienempi ilman muuta tietoa on kosketuslevyltä. */
const NOTCH_MIN_PX = 50;

/**
 * Onko tapahtuma kosketuslevyltä. Kosketuslevyllä wheelDeltaY on tarkalleen
 * −3 × deltaY, hiiren rullalla 120:n monikerta. Nipistys tulee ctrl-rullana
 * murtolukuina. Rivi- ja sivutila (Firefox) on aina hiiren rulla.
 */
export function isTouchpad(e: WheelLike): boolean {
  if (e.deltaMode !== 0) return false;
  if (e.ctrlKey && !Number.isInteger(e.deltaY)) return true;
  if (e.wheelDeltaY) {
    if (e.wheelDeltaY === -3 * e.deltaY) return true;
    if (e.wheelDeltaY % 120 === 0) return false;
  }
  return !Number.isInteger(e.deltaY) || Math.abs(e.deltaY) < NOTCH_MIN_PX;
}

/**
 * Muuntaa rullatapahtumat zoomiaskeliksi. Hiiren rullan lovi on yksi askel,
 * kuten ennenkin. Kosketuslevy lähettää kymmeniä pieniä tapahtumia sekunnissa,
 * joten sen liike kerätään ja askel otetaan vasta kynnyksen ylittyessä.
 */
export class WheelZoom {
  private acc = 0;
  private lastEvent = -Infinity;
  private cooldownUntil = -Infinity;

  /** Palauttaa zoomiaskeleet (positiivinen loitontaa). */
  feed(e: WheelLike, now: number): number {
    // Firefox antaa rivitilan vain, jos deltaMode luetaan ennen deltaY:tä.
    const mode = e.deltaMode;
    const dy = e.deltaY;
    if (dy === 0) return 0;
    const idle = now - this.lastEvent > IDLE_RESET_MS;
    this.lastEvent = now;
    if (
      !isTouchpad({ deltaY: dy, deltaMode: mode, ctrlKey: e.ctrlKey, wheelDeltaY: e.wheelDeltaY })
    ) {
      this.acc = 0;
      return Math.sign(dy);
    }
    if (idle) this.acc = 0;
    if (now < this.cooldownUntil) return 0;
    this.acc += e.ctrlKey ? dy * PINCH_GAIN : dy;
    if (Math.abs(this.acc) < TOUCHPAD_STEP_PX) return 0;
    const step = Math.sign(this.acc);
    this.acc = 0;
    this.cooldownUntil = now + TOUCHPAD_COOLDOWN_MS;
    return step;
  }
}
