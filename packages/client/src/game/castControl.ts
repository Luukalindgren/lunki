import type { FishingStage, Vec2 } from '@lunki/shared';
import { PAD_STICK_PRESS } from '../engine/gamepad';

/** Näppäimistöheiton tähtäyspiste: näin kaukana katsesuunnassa (m). */
export const KEY_AIM_DISTANCE = 30;

/** Peliohjaimen oikea tatti heiton suuntana. */
export interface PadAim {
  /** Tatti, -1…1 (y kasvaa alas). */
  stick: { x: number; y: number };
  /** Kalastajan silmin: tatti ylös on katsesuunta. Ylhäältä tatti ylös on pohjoinen. */
  pov: boolean;
}

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
  /** Peliohjaimen tatilla valittu heiton suunta (rad), kunnes viehe lähtee. */
  private padAngle: number | null = null;

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
    if (stage !== 'idle' && stage !== 'charging') this.padAngle = null;
    return buttons.mouse || buttons.key;
  }

  /**
   * Tähtäyspiste: hiiren osoittama kohta tai näppäimistöheitossa katsesuunta.
   * Peliohjaimella (`pad`) katsesuunta, tai oikean tatin viimeksi osoittama
   * suunta ennen heittoa.
   */
  aim(mouseAim: Vec2, tubePos: Vec2, heading: number, pad?: PadAim): Vec2 {
    if (pad) {
      const { x, y } = pad.stick;
      if (Math.hypot(x, y) > PAD_STICK_PRESS)
        this.padAngle = pad.pov ? heading + Math.atan2(-x, -y) : Math.atan2(-y, x);
      return headingAim(tubePos, this.padAngle ?? heading);
    }
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
