import type { Vec2 } from '@lunki/shared';

/** Paikanvaihdon siirtymä (s): hahmo liukuu vanhalta paikalta uudelle (#357). */
export const SEAT_SLIDE_SECONDS = 0.6;
/** Veneen keinahdus paikanvaihdossa: kesto (s) ja suurin kallistus (rad). */
export const SEAT_ROCK = { seconds: 1.4, angle: 0.07 } as const;

const ease = (k: number) => k * k * (3 - 2 * k);

/**
 * Paikanvaihdon pieni animaatio piirrossa (#357). Palvelin vaihtaa paikat
 * heti; piirrossa hahmo liukuu vanhalta paikalta uudelle, ja vene keinahtaa.
 * Pelaajat tunnistetaan avaimella (oma = '').
 */
export class SeatSlides {
  private readonly last = new Map<string, { boat: number; seat: number; pos: Vec2 }>();
  private readonly slides = new Map<string, { dx: number; dy: number; start: number }>();
  /** Veneen viimeisimmän paikanvaihdon alku (s). */
  private readonly rocks = new Map<number, number>();

  /**
   * Hahmon piirtopaikka: `pos` = paikka nyt veneessä `boat` (0 = rengas).
   * Kun paikka vaihtuu samassa veneessä, liu'utaan edellisestä piirtopaikasta.
   */
  place(id: string, boat: number, seat: number, pos: Vec2, now: number): Vec2 {
    const was = this.last.get(id);
    if (was && boat > 0 && was.boat === boat && was.seat !== seat) {
      this.slides.set(id, { dx: was.pos.x - pos.x, dy: was.pos.y - pos.y, start: now });
      this.rocks.set(boat, now);
    }
    let out = pos;
    const s = this.slides.get(id);
    if (s) {
      const k = (now - s.start) / SEAT_SLIDE_SECONDS;
      if (k >= 1 || boat === 0) this.slides.delete(id);
      else {
        const left = 1 - ease(Math.max(0, k));
        out = { x: pos.x + s.dx * left, y: pos.y + s.dy * left };
      }
    }
    this.last.set(id, { boat, seat, pos: out });
    return out;
  }

  /** Veneen keinahdus (rad) paikanvaihdon jälkeen: vaimeneva heilahdus. */
  rock(boat: number, now: number): number {
    const start = boat > 0 ? this.rocks.get(boat) : undefined;
    if (start === undefined) return 0;
    const k = (now - start) / SEAT_ROCK.seconds;
    if (k >= 1 || k < 0) return 0;
    return SEAT_ROCK.angle * Math.sin(k * Math.PI * 3) * (1 - k);
  }
}
