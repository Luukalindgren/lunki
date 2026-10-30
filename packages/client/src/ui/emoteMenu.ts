import { EMOTES, type EmoteId } from '@lunki/shared';
import { t, type MsgKey } from '../i18n';
import { CONTROLS } from '../game/controls';
import { emoteIcon } from './emoteIcons';
import { RingMenu } from './ringMenu';

/**
 * Käsimerkkien ympyrävalikko (#228). G avaa; valinta hiirellä,
 * kosketuksella, numeroilla 1–6 tai nuolilla ja Enterillä. G tai Esc sulkee.
 */
export class EmoteMenu {
  /** Valittu ele; valikko on jo suljettu. */
  onPick: ((emote: EmoteId) => void) | null = null;
  private readonly menu: RingMenu;

  constructor(parent: HTMLElement) {
    this.menu = new RingMenu(parent, {
      className: 'emote-menu',
      optionClass: 'emote-option',
      captionClass: 'emote-caption',
      closeKeys: [...CONTROLS.emote.keys, ...CONTROLS.pause.keys],
    });
    this.menu.onPick = (i) => this.onPick?.(EMOTES[i]!);
  }

  get root(): HTMLDivElement {
    return this.menu.root;
  }

  get open(): boolean {
    return this.menu.open;
  }

  get selected(): number {
    return this.menu.selected;
  }

  pickSelected(): void {
    this.menu.pickSelected();
  }

  point(dx: number, dy: number): void {
    this.menu.point(dx, dy);
  }

  toggle(): void {
    if (this.open) this.close();
    else this.show();
  }

  show(): void {
    // Nimet pelaajan kielellä joka avauksella.
    this.menu.setItems(
      EMOTES.map((id) => ({ icon: emoteIcon(id), label: t(`emote.${id}` as MsgKey) })),
    );
    this.menu.show();
  }

  close(): void {
    this.menu.close();
  }

  dispose(): void {
    this.menu.dispose();
  }
}
