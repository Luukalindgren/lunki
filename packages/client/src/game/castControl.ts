import type { FishingStage, Vec2 } from '@lunki/shared';

/** Näppäimistöheiton tähtäyspiste: näin kaukana katsesuunnassa (m). */
export const KEY_AIM_DISTANCE = 30;

export interface CastButtons {
  /** Hiiren vasen pohjassa. */
  mouse: boolean;
  /** Välilyönti pohjassa. */
  key: boolean;
}

/**
 * Heitto hiirellä tai pelkällä näppäimistöllä (#227). Välilyönti pohjassa
 * lataa heiton kuten hiiri, ja välilyönnillä aloitettu heitto lähtee
 * renkaan katsesuuntaan, koska erillistä tähtäystä ei ole. Vieheen ollessa
 * vedessä välilyönti kelaa kuten ennenkin.
 */
export class CastControl {
  private keyboard = false;

  /** Onko meneillään oleva lataus aloitettu näppäimistöltä. */
  get keyboardAim(): boolean {
    return this.keyboard;
  }

  /**
   * Heittonapin tila kalastuksen askeleelle. Kutsutaan ennen `stepFishing`ia;
   * `stage` on askelta edeltävä vaihe.
   */
  castHeld(stage: FishingStage, buttons: CastButtons): boolean {
    // Lataus alkaa vavan ollessa valmiina: se nappi, joka aloitti, valitsee tähtäyksen.
    if (stage === 'idle') this.keyboard = buttons.key && !buttons.mouse;
    else if (stage !== 'charging') this.keyboard = false;
    return buttons.mouse || buttons.key;
  }

  /** Tähtäyspiste: hiiren osoittama kohta tai näppäimistöheitossa katsesuunta. */
  aim(mouseAim: Vec2, tubePos: Vec2, heading: number): Vec2 {
    if (!this.keyboard) return mouseAim;
    return headingAim(tubePos, heading);
  }
}

/** Piste renkaan katsesuunnassa, johon näppäimistöheitto tähtää. */
export function headingAim(tubePos: Vec2, heading: number): Vec2 {
  return {
    x: tubePos.x + Math.cos(heading) * KEY_AIM_DISTANCE,
    y: tubePos.y + Math.sin(heading) * KEY_AIM_DISTANCE,
  };
}
