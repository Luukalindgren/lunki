/** Valikon napit ympyrällä: säde osuutena valikon koosta. */
const RING = 0.38;

export interface RingItem {
  icon: HTMLElement;
  /** Nimi otsikkoon, vihjeeseen ja ruudunlukijalle. */
  label: string;
}

export interface RingMenuOptions {
  /** Lisäluokat juurelle, napeille ja otsikolle (esim. 'emote-menu'). */
  className: string;
  optionClass: string;
  captionClass: string;
  /** Näppäimet, jotka sulkevat valikon: avaava toiminto (CONTROLS) ja Esc. */
  closeKeys: readonly string[];
}

/**
 * Ympyrävalikko kisan aikana: käsimerkit (#228) ja viehepakki (#365).
 * Valinta hiirellä, kosketuksella, numeroilla tai nuolilla ja Enterillä.
 * Auki ollessa valikko ottaa näppäimet ensin, joten numerot eivät vaihda
 * kelausnopeutta eikä Esc avaa taukoa tai Enter chattia.
 */
export class RingMenu {
  readonly root: HTMLDivElement;
  /** Valittu kohta; valikko on jo suljettu. */
  onPick: ((index: number) => void) | null = null;
  private buttons: HTMLButtonElement[] = [];
  private items: RingItem[] = [];
  private readonly caption: HTMLDivElement;
  private selected = 0;

  constructor(
    parent: HTMLElement,
    private readonly opts: RingMenuOptions,
  ) {
    this.root = document.createElement('div');
    this.root.className = `ring-menu ${opts.className}`;
    this.root.hidden = true;
    this.root.setAttribute('role', 'menu');
    // Klikkaus valikossa ei tähtää eikä heitä pelissä.
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.caption = document.createElement('div');
    this.caption.className = `ring-caption ${opts.captionClass}`;
    this.root.appendChild(this.caption);
    parent.appendChild(this.root);
    window.addEventListener('keydown', this.onKey, true);
  }

  /** Valikon kohdat; vanhat napit korvataan. */
  setItems(items: RingItem[]): void {
    for (const b of this.buttons) b.remove();
    this.items = items;
    this.buttons = items.map((item, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `ring-option ${this.opts.optionClass}`;
      b.setAttribute('role', 'menuitem');
      const angle = -Math.PI / 2 + (i / items.length) * Math.PI * 2;
      b.style.left = `${50 + Math.cos(angle) * RING * 100}%`;
      b.style.top = `${50 + Math.sin(angle) * RING * 100}%`;
      const key = document.createElement('span');
      key.className = 'ring-key';
      key.textContent = String(i + 1);
      b.append(item.icon, key);
      b.title = item.label;
      b.setAttribute('aria-label', `${i + 1} ${item.label}`);
      b.addEventListener('click', () => this.pick(i));
      b.addEventListener('pointerenter', () => this.select(i));
      this.root.appendChild(b);
      return b;
    });
    this.select(Math.min(this.selected, Math.max(0, items.length - 1)));
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  /** Avaa valikon; `selected` korostaa kohdan (esim. käytössä oleva viehe). */
  show(selected = this.selected): void {
    this.root.hidden = false;
    this.select(selected);
  }

  close(): void {
    this.root.hidden = true;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey, true);
    this.root.remove();
  }

  private select(i: number): void {
    const n = this.items.length;
    if (n === 0) return;
    this.selected = (i + n) % n;
    this.buttons.forEach((b, k) => b.classList.toggle('selected', k === this.selected));
    this.caption.textContent = this.items[this.selected]!.label;
  }

  private pick(i: number): void {
    this.close();
    this.onPick?.(i);
  }

  private onKey = (e: KeyboardEvent) => {
    if (!this.open || e.altKey || e.ctrlKey || e.metaKey) return;
    const digit = /^(Digit|Numpad)([1-9])$/.exec(e.code);
    let handled = true;
    if (digit && Number(digit[2]) <= this.items.length) this.pick(Number(digit[2]) - 1);
    else if (e.code === 'ArrowRight' || e.code === 'ArrowDown') this.select(this.selected + 1);
    else if (e.code === 'ArrowLeft' || e.code === 'ArrowUp') this.select(this.selected - 1);
    else if (e.code === 'Enter' || e.code === 'NumpadEnter') this.pick(this.selected);
    // Pohjassa pidetty avausnäppäin (R avaa viehevalikon) toistuu: ei sulje.
    else if (this.opts.closeKeys.includes(e.code)) {
      if (!e.repeat) this.close();
    } else handled = false;
    if (!handled) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  };
}
