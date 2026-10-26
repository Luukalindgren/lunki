import { FLY } from '@lunki/shared';

/** Perhon veto: koko ruudun korkuinen hiiren liike vetää näin monta metriä siimaa. */
export const STRIP_PER_SCREEN = 5;
/** Nopea hiiren nosto (osuus ruudun korkeudesta askeleessa) on vavan nosto. */
export const ROD_LIFT_FLICK = 0.03;
/** Vedosta jää enintään näin paljon (m) vetämättä odottamaan, kun käsi on nopeampi kuin siima. */
const MAX_PENDING = FLY.maxStripSpeed;

/**
 * Perhon siimakäsi hiirellä (#234). Hiiren veto alas vetää siimaa liikkeen
 * verran, nopea nosto ylös on vavan nosto. Nopea veto ei hukkaa siimaa: se
 * osa, joka ylittää suurimman vetonopeuden, vedetään seuraavilla askelilla.
 * Näin kosketuslevyn lyhyt ja nopea pyyhkäisy tuo yhtä paljon siimaa kuin
 * rauhallinen veto.
 */
export class FlyStrip {
  /** Hiiren edellinen pystysijainti (null = nappi ylhäällä). */
  private lastY: number | null = null;
  /** Vetämättä oleva osa vedoista (m). */
  private pending = 0;

  /**
   * `held` = siimakäsi pitää hiirellä, `y` = hiiren pystysijainti ja `screen`
   * = ruudun korkeus (px). Palauttaa tällä askeleella vedetyn siiman (m).
   */
  read(held: boolean, y: number, screen: number, dt: number): { strip: number; rodLift: boolean } {
    let rodLift = false;
    if (held && this.lastY !== null) {
      const dy = (y - this.lastY) / Math.max(1, screen);
      if (dy > 0) this.pending = Math.min(MAX_PENDING, this.pending + dy * STRIP_PER_SCREEN);
      else if (dy < -ROD_LIFT_FLICK) rodLift = true;
    }
    this.lastY = held ? y : null;
    // Kun käsi päästää irti, vetokin loppuu.
    if (!held) this.pending = 0;
    const strip = Math.min(this.pending, FLY.maxStripSpeed * dt);
    this.pending -= strip;
    return { strip, rodLift };
  }

  /** Siima pois kädestä: seuraava painallus aloittaa uuden vedon. */
  reset(): void {
    this.lastY = null;
    this.pending = 0;
  }
}
