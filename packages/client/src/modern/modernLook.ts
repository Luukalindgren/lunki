import type { LookLayer } from '../engine/lookLayer';
import { Birds } from './birds';
import { Gear } from './gear';
import { Landing } from './landing';
import { Marks } from './marks';
import { releaseScenery, SceneryLook } from './scenery';
import { ShadowRig } from './shadows';
import { Softener } from './soften';
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
      const scenery = new SceneryLook(scene);
      const gear = new Gear(scene, renderer);
      const softener = new Softener(scene);
      const landing = new Landing(scene);
      const birds = new Birds(scene);
      const marks = new Marks(scene);
      return {
        update(camera, quality) {
          scenery.update(camera, quality);
          // Varusteet ensin: valaistuksi vaihdettu osa pyöristyy samalla kierroksella.
          gear.update(camera);
          softener.update();
          landing.update(camera);
          birds.update();
          marks.update(camera);
          shadows.update(camera, quality);
        },
        dispose() {
          marks.dispose();
          birds.dispose();
          landing.dispose();
          softener.dispose();
          gear.dispose();
          scenery.dispose();
          shadows.dispose();
        },
      };
    },
    release: releaseScenery,
  };
}
