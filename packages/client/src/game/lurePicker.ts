import { METHODS, isFly, type Difficulty, type Method, type Tackle } from '@lunki/shared';
import { t } from '../i18n';
import { baitName, methodName } from '../i18n/names';
import type { Hud } from '../ui/hud';
import { lureImage, rodImage } from '../ui/lureArt';
import { RingMenu } from '../ui/ringMenu';
import { CONTROLS, type Controls } from './controls';
import { HeldMenu } from './heldMenu';
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
 * Kalastustapa vaihdetaan omasta pikavalikosta (M tai VAPA): virveli tai perho.
 */
export class LurePicker {
  box: TackleBox = loadTackleBox();
  private menu: RingMenu | null = null;
  /** Kalastustavan pikavalikko: virveli tai perho. */
  private methodMenu: RingMenu | null = null;
  /** Pohjassa pidetty R tai M valitsee irrotettaessa osoitetun kohdan (#387). */
  private readonly lureHold = new HeldMenu(() => this.menu, 'lure');
  private readonly methodHold = new HeldMenu(() => this.methodMenu, 'method', LURE_HOLD);
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
    if (c.wasPressed('method')) {
      if (this.methodMenu?.open) this.methodMenu.close();
      else {
        this.openMethodMenu();
        this.methodHold.opened(c);
      }
    }
    this.methodHold.step(c);
    this.lureHold.step(c);
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
      this.lureHold.opened(c);
    }
  }

  private cycle(): void {
    this.host.setTackle(nextInBox(this.host.tackle, this.box));
  }

  private openMenu(): void {
    this.methodMenu?.close();
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
      // Irrotus ilman osoitusta valitsee käytössä olevan: ei vaihtoa.
      if (next && i !== currentSlot(this.host.tackle, this.box)) this.host.setTackle(next);
    };
    this.menu.setItems(
      all.map((v) => ({
        icon: lureImage(isFly(v) ? v.fly : v.lure, '2px'),
        label: baitName(v),
      })),
    );
    this.menu.show(Math.max(0, currentSlot(tk, this.box)));
  }

  private openMethodMenu(): void {
    this.menu?.close();
    this.methodMenu ??= new RingMenu(this.host.hud.root, {
      className: 'method-menu',
      optionClass: 'method-option',
      captionClass: 'method-caption',
      closeKeys: [...CONTROLS.method.keys, ...CONTROLS.pause.keys],
    });
    const methods = Object.keys(METHODS) as Method[];
    this.methodMenu.onPick = (i) => {
      const next = this.withMethod(methods[i]!);
      if (next.method !== this.host.tackle.method) this.host.setTackle(next);
    };
    this.methodMenu.setItems(methods.map((m) => ({ icon: rodImage(m), label: methodName(m) })));
    this.methodMenu.show(Math.max(0, methods.indexOf(this.host.tackle.method)));
  }

  /** Varusteet toisella kalastustavalla: viehe tai perho pakista, jos nykyinen ei ole siellä. */
  private withMethod(m: Method): Tackle {
    const tk = { ...this.host.tackle, method: m };
    const first = boxTackles(tk, this.box)[0];
    return currentSlot(tk, this.box) >= 0 || !first ? tk : first;
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
    this.methodMenu?.dispose();
  }
}
