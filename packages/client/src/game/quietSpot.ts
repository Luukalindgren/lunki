import type { Vec2 } from '@lunki/shared';

/** Montako tyhjää heittoa samalta paikalta ennen vinkkiä. */
export const QUIET_CASTS = 3;
/** Näin kauas siirtynyt rengas on uudella paikalla (m). */
export const QUIET_MOVE = 40;

/**
 * Seuraa, tuleeko samalta paikalta heitettäessä yhtään kiinnostusta. Kertoo
 * kerran paikkaa kohden, kun heitot ovat menneet tyhjiin, jotta uusi pelaaja
 * tietää vaihtaa paikkaa eikä luule tekevänsä jotain väärin.
 */
export class QuietSpot {
  private anchor: Vec2 | null = null;
  private casts = 0;
  /** Kala seurasi tai iski nykyisellä heitolla. */
  private interest = false;
  private told = false;

  /** Viehe lähti heitolle renkaan ollessa kohdassa `pos`. */
  cast(pos: Vec2): void {
    if (!this.anchor || Math.hypot(pos.x - this.anchor.x, pos.y - this.anchor.y) > QUIET_MOVE) {
      this.anchor = { ...pos };
      this.casts = 0;
      this.told = false;
    }
    this.interest = false;
  }

  /** Kala seurasi viehettä tai iski. */
  noticed(): void {
    this.interest = true;
    this.casts = 0;
  }

  /** Viehe palasi kelalle. Palauttaa true, kun vinkki kannattaa näyttää. */
  home(): boolean {
    if (!this.anchor || this.interest) return false;
    this.casts++;
    if (this.told || this.casts < QUIET_CASTS) return false;
    this.told = true;
    return true;
  }
}
