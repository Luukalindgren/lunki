import { isFly, type Difficulty, type Tackle } from '@lunki/shared';
import { t } from '../i18n';
import { baitName } from '../i18n/names';
import type { Hud } from '../ui/hud';
import { lureImage } from '../ui/lureArt';
import { RingMenu } from '../ui/ringMenu';
import { CONTROLS, type Controls } from './controls';
import {
  boxTackles,
  currentSlot,
  loadTackleBox,
  loseFromBox,
  nextInBox,
  type TackleBox,
} from './tackleBox';

/** Näin kauan pohjassa pidetty R (tai VIEHE-nappi) avaa pikavalikon napautuksen sijaan. */
export const LURE_HOLD = 0.35;

/** Mitä viehevalitsin tarvitsee pelistä. */
export interface LurePickerHost {
  readonly hud: Hud;
  readonly controls: Controls;
  readonly difficulty: Difficulty;
  readonly spectating: boolean;
  readonly tackle: Tackle;
  setTackle(tk: Tackle): void;
}

/**
 * Kisan viehepakki (#365): R:n tai VIEHE-napin napautus vaihtaa pakin
 * seuraavaan lokeroon, pohjassa pitäminen avaa pikavalikon vieheiden
 * kuvin. Realistisella menetetty viehe poistuu kisan pakista; muilla
 * vaikeustasoilla pakki on sama kuin Varusteet-näkymässä tallennettu.
 * Kisassa pakkia ei muokata; se laitetaan kuntoon päävalikon Varusteissa (#383).
 */
export class LurePicker {
  box: TackleBox = loadTackleBox();
  private menu: RingMenu | null = null;
  /** Kuinka kauan R on ollut pohjassa, tai -1 kun ei odoteta. */
  private held = -1;

  constructor(private readonly host: LurePickerHost) {
    // Kisa alkaa pakin vieheellä: muuten R:n kierto alkaisi pakin ulkopuolelta.
    const tk = host.tackle;
    const first = boxTackles(tk, this.box)[0];
    if (!host.spectating && first && currentSlot(tk, this.box) < 0) host.setTackle(first);
  }

  /** Realistisella menetetty viehe on poissa loppukisan. */
  private get realistic(): boolean {
    return this.host.difficulty === 'realistic';
  }

  step(dt: number): void {
    const { controls: c, spectating } = this.host;
    if (spectating) return;
    if (c.wasPressed('lure')) {
      // Kosketusnappi auki olevan valikon päällä sulkee sen.
      if (this.menu?.open) {
        this.menu.close();
        this.held = -1;
      } else if (c.isDown('lure')) this.held = 0;
      else this.cycle();
      return;
    }
    if (this.held < 0) return;
    if (!c.isDown('lure')) {
      this.held = -1;
      this.cycle();
    } else if ((this.held += dt) >= LURE_HOLD) {
      this.held = -1;
      this.openMenu();
    }
  }

  private cycle(): void {
    this.host.setTackle(nextInBox(this.host.tackle, this.box));
  }

  private openMenu(): void {
    const tk = this.host.tackle;
    const all = boxTackles(tk, this.box);
    if (!this.menu) {
      this.menu = new RingMenu(this.host.hud.root, {
        className: 'lure-menu',
        optionClass: 'lure-option',
        captionClass: 'lure-caption',
        closeKeys: [...CONTROLS.lure.keys, ...CONTROLS.pause.keys],
      });
    }
    this.menu.onPick = (i) => {
      const next = boxTackles(this.host.tackle, this.box)[i];
      if (next) this.host.setTackle(next);
    };
    this.menu.setItems(
      all.map((v) => ({
        icon: lureImage(isFly(v) ? v.fly : v.lure, '2px'),
        label: baitName(v),
      })),
    );
    this.menu.show(Math.max(0, currentSlot(tk, this.box)));
  }

  /**
   * Viehe jäi järveen. Realistisella se poistuu kisan pakista ja seuraava
   * otetaan käyttöön; palauttaa ilmoitukseen lisättävän rivin tai null.
   */
  lost(tk: Tackle): string | null {
    if (!this.realistic) return null;
    const { box, next, left } = loseFromBox(tk, this.box);
    if (!next) return currentSlot(tk, this.box) >= 0 ? t('box.lastLure') : null;
    this.box = box;
    this.host.setTackle(next);
    return t('box.lost', { n: left });
  }

  dispose(): void {
    this.menu?.dispose();
  }
}
