import { EMOTES, type EmoteId } from '@lunki/shared';
import { t, type MsgKey } from '../i18n';
import { emoteIcon } from './emoteIcons';

/** Valikon napit ympyrällä: säde osuutena valikon koosta. */
const RING = 0.38;

/**
 * Käsimerkkien ympyrävalikko (#228). G avaa; valinta hiirellä,
 * kosketuksella, numeroilla 1–6 tai nuolilla ja Enterillä. G tai Esc sulkee.
 * Auki ollessa valikko ottaa näppäimet ensin, joten numerot eivät vaihda
 * kelausnopeutta eikä Esc avaa taukoa tai Enter chattia.
 */
export class EmoteMenu {
  readonly root: HTMLDivElement;
  /** Valittu ele; valikko on jo suljettu. */
  onPick: ((emote: EmoteId) => void) | null = null;
  private readonly buttons: HTMLButtonElement[] = [];
  private readonly caption: HTMLDivElement;
  private selected = 0;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'emote-menu';
    this.root.hidden = true;
    this.root.setAttribute('role', 'menu');
    // Klikkaus valikossa ei tähtää eikä heitä pelissä.
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.caption = document.createElement('div');
    this.caption.className = 'emote-caption';
    this.root.appendChild(this.caption);
    EMOTES.forEach((id, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'emote-option';
      b.setAttribute('role', 'menuitem');
      const angle = -Math.PI / 2 + (i / EMOTES.length) * Math.PI * 2;
      b.style.left = `${50 + Math.cos(angle) * RING * 100}%`;
      b.style.top = `${50 + Math.sin(angle) * RING * 100}%`;
      const key = document.createElement('span');
      key.className = 'emote-key';
      key.textContent = String(i + 1);
      b.append(emoteIcon(id), key);
      b.addEventListener('click', () => this.pick(i));
      b.addEventListener('pointerenter', () => this.select(i));
      this.buttons.push(b);
      this.root.appendChild(b);
    });
    parent.appendChild(this.root);
    window.addEventListener('keydown', this.onKey, true);
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  toggle(): void {
    if (this.open) this.close();
    else this.show();
  }

  show(): void {
    this.relabel();
    this.root.hidden = false;
    this.select(this.selected);
  }

  close(): void {
    this.root.hidden = true;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey, true);
    this.root.remove();
  }

  private relabel(): void {
    EMOTES.forEach((id, i) => {
      const name = t(`emote.${id}` as MsgKey);
      this.buttons[i]!.title = name;
      this.buttons[i]!.setAttribute('aria-label', `${i + 1} ${name}`);
    });
  }

  private select(i: number): void {
    this.selected = (i + EMOTES.length) % EMOTES.length;
    this.buttons.forEach((b, k) => b.classList.toggle('selected', k === this.selected));
    this.caption.textContent = t(`emote.${EMOTES[this.selected]!}` as MsgKey);
  }

  private pick(i: number): void {
    this.close();
    this.onPick?.(EMOTES[i]!);
  }

  private onKey = (e: KeyboardEvent) => {
    if (!this.open || e.altKey || e.ctrlKey || e.metaKey) return;
    const digit = /^(Digit|Numpad)([1-9])$/.exec(e.code);
    let handled = true;
    if (digit && Number(digit[2]) <= EMOTES.length) this.pick(Number(digit[2]) - 1);
    else if (e.code === 'ArrowRight' || e.code === 'ArrowDown') this.select(this.selected + 1);
    else if (e.code === 'ArrowLeft' || e.code === 'ArrowUp') this.select(this.selected - 1);
    else if (e.code === 'Enter' || e.code === 'NumpadEnter') this.pick(this.selected);
    else if (e.code === 'KeyG' || e.code === 'Escape') this.close();
    else handled = false;
    if (!handled) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  };
}
