import type { LookLayer } from '../engine/lookLayer';
import { ShadowRig } from './shadows';
import './theme.css';

/**
 * Moderni ilme (#650): tämä tiedosto ja kaikki, mitä se tuo, ladataan vasta
 * kun pelaaja valitsee Modernin (`engine/modernHost.ts`). Kerros lisää pelin
 * kohtaukseen modernin piirron osat; säännöt, HUDin rakenne ja ohjaus ovat
 * samat kuin muissa ilmeissä.
 */
export function createModernLook(): LookLayer {
  return {
    attach(scene, renderer) {
      const shadows = new ShadowRig(scene, renderer);
      return {
        update: (camera, quality) => shadows.update(camera, quality),
        dispose: () => shadows.dispose(),
      };
    },
  };
}
