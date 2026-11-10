import { REEL } from '@lunki/shared';

/**
 * Kelaus peliohjaimen oikeaa tattia pyörittämällä (#595): tatti on kelan
 * kampi, ja pyöritysnopeus valitsee vaihteen. Nopea nykäisy taakse ja
 * takaisin keskelle on vavan nykäisy (ison kalan vastaisku).
 *
 * Ele painaa toimintoja kuten kosketusnapit: `reel` pohjaan pyörityksen
 * ajaksi ja `twitch` nykäisystä. A/RT-kelaus toimii rinnalla ennallaan.
 */
export const STICK_REEL = {
  /** Tatin kulmaa seurataan tästä taipumasta (kuolleen alueen jälkeen 0–1). */
  track: 0.4,
  /** Tatti on palannut keskelle tämän alla. */
  center: 0.15,
  /**
   * Kelaus alkaa, kun tatti on kiertänyt näin monta kierrosta samaan
   * suuntaan. Kalastajan silmin tatti myös kääntää, joten siellä vaaditaan
   * täysi kierros.
   */
  startTurns: { top: 0.5, pov: 1 },
  /** Kelaus loppuu, kun tatti ei ole kiertänyt näin pitkään (s). */
  stopAfter: 0.25,
  /** Suunnan vaihto tunnistetaan näin pitkästä vastaliikkeestä (rad). */
  reverse: 0.35,
  /** Vaihteiden rajat (kierrosta/s): hidas, normaali, nopea ja pikakelaus. */
  gears: [1.4, 2.4, 3.6],
  /** Vaihde ei vaihdu rajalla edestakaisin (kierrosta/s). */
  hysteresis: 0.2,
  /** Pyöritysnopeuden tasoitus (1/s). */
  smooth: 5,
  /** Nykäisy: tatti käy alhaalla ja palaa keskelle tässä ajassa (s)… */
  flickTime: 0.3,
  /** …vähintään näin syvällä… */
  flickDown: 0.7,
  /** …eikä kierrä matkalla tätä enempää (rad). */
  flickTurn: 0.6,
} as const;

export interface StickReelOut {
  /** Tatti pyörii: kelaus päällä. */
  reel: boolean;
  /** Pyöritysnopeuden vaihde kelauksen aikana. */
  gear: number;
  /** Nykäisy tällä askeleella. */
  twitch: boolean;
  /** Tatti on kelauksen käytössä, kunnes se palaa keskelle: ei käännä eikä tähtää. */
  busy: boolean;
}

const TAU = Math.PI * 2;
const wrap = (a: number) => a - TAU * Math.round(a / TAU);

export class StickReel {
  private angle: number | null = null;
  /** Yhtenäinen kierto samaan suuntaan (rad, etumerkki = suunta). */
  private run = 0;
  private back = 0;
  private idle = 0;
  /** Aika edellisestä tatin liikkeestä (s). */
  private gap = 0;
  private speed = 0;
  private gear = 0;
  private reeling = false;
  private busy = false;
  /** Aika siitä, kun tatti lähti keskeltä (s), ja matkan huiput nykäisyä varten. */
  private out: { time: number; down: number; side: number; turned: number } | null = null;

  /**
   * Askel tatin asennosta (-1…1, y kasvaa alas). `allowed` on tosi, kun
   * virvelin viehe on vedessä ja tatti on vapaa; muuten ele nollautuu.
   */
  step(stick: { x: number; y: number }, dt: number, allowed: boolean, pov: boolean): StickReelOut {
    const mag = Math.hypot(stick.x, stick.y);
    if (mag < STICK_REEL.center) {
      const o = this.out;
      const twitch =
        allowed &&
        !this.busy &&
        o !== null &&
        o.time <= STICK_REEL.flickTime &&
        o.down >= STICK_REEL.flickDown &&
        o.down > o.side &&
        o.turned <= STICK_REEL.flickTurn;
      this.stop();
      this.busy = false;
      this.out = null;
      this.angle = null;
      return { reel: false, gear: this.gear, twitch, busy: false };
    }
    const o = (this.out ??= { time: 0, down: 0, side: 0, turned: 0 });
    o.time += dt;
    o.down = Math.max(o.down, stick.y);
    o.side = Math.max(o.side, Math.abs(stick.x));
    if (!allowed) {
      this.stop();
      this.angle = null;
      return { reel: false, gear: this.gear, twitch: false, busy: this.busy };
    }
    if (mag < STICK_REEL.track) {
      this.rest(dt);
      return this.result();
    }
    const angle = Math.atan2(stick.y, stick.x);
    const d = this.angle === null ? 0 : wrap(angle - this.angle);
    this.angle = angle;
    o.turned += Math.abs(d);
    if (Math.abs(d) < 0.02) {
      this.rest(dt);
      return this.result();
    }
    this.idle = 0;
    if (this.run === 0 || Math.sign(d) === Math.sign(this.run)) {
      this.run += d;
      this.back = 0;
    } else if ((this.back += Math.abs(d)) > STICK_REEL.reverse) {
      // Suunta vaihtui: kelaus alkaa alusta toiseen suuntaan.
      this.stop();
      this.run = d;
    }
    // Nopeus edellisestä liikkeestä: hitaalla ruudunpäivityksellä tatti luetaan
    // harvemmin kuin askelia on, eikä yksi hyppy saa näyttää nopealta.
    const span = this.gap + dt;
    this.gap = 0;
    const inst = Math.abs(d) / TAU / Math.max(span, 1e-3);
    this.speed += (inst - this.speed) * Math.min(1, span * STICK_REEL.smooth);
    const start = (pov ? STICK_REEL.startTurns.pov : STICK_REEL.startTurns.top) * TAU;
    if (!this.reeling && Math.abs(this.run) >= start) {
      this.reeling = true;
      this.busy = true;
      this.gear = gearFor(this.speed, null);
    } else if (this.reeling) this.gear = gearFor(this.speed, this.gear);
    return this.result();
  }

  private rest(dt: number): void {
    this.gap += dt;
    if ((this.idle += dt) > STICK_REEL.stopAfter) this.stop();
  }

  private stop(): void {
    this.run = this.back = this.idle = this.speed = this.gap = 0;
    this.reeling = false;
  }

  private result(): StickReelOut {
    return { reel: this.reeling, gear: this.gear, twitch: false, busy: this.busy };
  }
}

/** Pyöritysnopeuden (kierrosta/s) vaihde; nykyinen vaihde pysyy rajan tuntumassa. */
export function gearFor(speed: number, current: number | null): number {
  const { gears, hysteresis } = STICK_REEL;
  let gear = 0;
  for (const limit of gears) if (speed >= limit) gear++;
  gear = Math.min(gear, REEL.fastGear);
  if (current === null || gear === current) return gear;
  // Vaihto vasta, kun raja on ylitetty selvästi.
  const limit = gears[Math.min(gear, current)]!;
  return Math.abs(speed - limit) >= hysteresis ? gear : current;
}
