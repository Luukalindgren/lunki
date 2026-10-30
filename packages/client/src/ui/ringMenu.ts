/** Mittasuhteet valikon säteestä: keskireikä, lohkojen sisäreuna ja kuvien paikka. */
const HOLE = 0.36;
const INNER = 0.34;
const ICON = (INNER + 1) / 2;
const KEY = 0.9;
/** Lohkojen väli (viiva) puolikkaana, osuutena säteestä. */
const GAP = 0.012;
/** Valittu lohko nousee näin monta pikseliä ulospäin. */
const LIFT = 5;

/** Piste valikon laatikossa prosentteina: kulma ja etäisyys keskeltä (osuus säteestä). */
const at = (angle: number, r: number) =>
  `${(50 + Math.cos(angle) * r * 50).toFixed(2)}% ${(50 + Math.sin(angle) * r * 50).toFixed(2)}%`;

/**
 * Lohkon muoto (clip-path): rengaslohko kulmasta a0 kulmaan a1. Reunat
 * siirretään puoli väliä sisään, joten lohkojen väliin jää tasapaksu viiva.
 */
function sectorPath(a0: number, a1: number): string {
  const pts: string[] = [];
  const steps = 12;
  const outer = Math.asin(GAP);
  for (let k = 0; k <= steps; k++)
    pts.push(at(a0 + outer + ((a1 - a0 - 2 * outer) * k) / steps, 1));
  const inner = Math.asin(GAP / INNER);
  for (let k = steps; k >= 0; k--)
    pts.push(at(a0 + inner + ((a1 - a0 - 2 * inner) * k) / steps, INNER));
  return `polygon(${pts.join(', ')})`;
}

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
  private readonly hole: HTMLDivElement;
  private readonly caption: HTMLDivElement;
  private highlighted = 0;

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
    // Keskellä valitun kohdan nimi.
    this.hole = document.createElement('div');
    this.hole.className = 'ring-hole';
    this.hole.style.width = this.hole.style.height = `${HOLE * 100}%`;
    this.caption = document.createElement('div');
    this.caption.className = `ring-caption ${opts.captionClass}`;
    this.hole.appendChild(this.caption);
    this.root.appendChild(this.hole);
    parent.appendChild(this.root);
    window.addEventListener('keydown', this.onKey, true);
    // Hiiri tai avausnappia pitävä sormi osoittaa lohkoa suunnallaan (#387).
    window.addEventListener('pointermove', this.onPoint);
  }

  /** Valikon kohdat; vanhat lohkot korvataan. */
  setItems(items: RingItem[]): void {
    for (const b of this.buttons) b.remove();
    this.items = items;
    const n = items.length;
    this.buttons = items.map((item, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `ring-option ${this.opts.optionClass}`;
      b.setAttribute('role', 'menuitem');
      // Ensimmäinen lohko ylhäällä, sitten myötäpäivään.
      const mid = -Math.PI / 2 + (i / n) * Math.PI * 2;
      const half = Math.PI / n;
      b.style.clipPath = sectorPath(mid - half, mid + half);
      b.style.setProperty('--lx', `${(Math.cos(mid) * LIFT).toFixed(1)}px`);
      b.style.setProperty('--ly', `${(Math.sin(mid) * LIFT).toFixed(1)}px`);
      const place = (el: HTMLElement, r: number) => {
        const [x, y] = at(mid, r).split(' ');
        el.style.left = x!;
        el.style.top = y!;
        return el;
      };
      const cell = document.createElement('span');
      cell.className = 'ring-cell';
      cell.append(item.icon);
      const key = document.createElement('span');
      key.className = 'ring-key';
      key.textContent = String(i + 1);
      b.append(place(cell, ICON), place(key, KEY));
      b.title = item.label;
      b.setAttribute('aria-label', `${i + 1} ${item.label}`);
      b.addEventListener('click', () => this.pick(i));
      b.addEventListener('pointerenter', () => this.select(i));
      this.root.insertBefore(b, this.hole);
      return b;
    });
    this.select(Math.min(this.highlighted, Math.max(0, n - 1)));
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  /** Avaa valikon; `selected` korostaa kohdan (esim. käytössä oleva viehe). */
  show(selected = this.highlighted): void {
    this.root.hidden = false;
    this.select(selected);
  }

  close(): void {
    this.root.hidden = true;
  }

  /** Valitsee korostetun kohdan: avausnäppäimen irrotus (#387). */
  /** Korostettu kohta. */
  get selected(): number {
    return this.highlighted;
  }

  pickSelected(): void {
    if (this.open) this.pick(this.highlighted);
  }

  /** Korostaa lohkon suunnasta keskeltä (hiiri tai peliohjaimen tatti, y kasvaa alas). */
  point(dx: number, dy: number): void {
    const n = this.items.length;
    if (!this.open || n === 0) return;
    // Ensimmäinen lohko ylhäällä, sitten myötäpäivään.
    const turn = (Math.atan2(dy, dx) + Math.PI / 2) / (Math.PI * 2);
    this.select(Math.round(turn * n));
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('pointermove', this.onPoint);
    this.root.remove();
  }

  private select(i: number): void {
    const n = this.items.length;
    if (n === 0) return;
    this.highlighted = (i + n) % n;
    this.buttons.forEach((b, k) => b.classList.toggle('selected', k === this.highlighted));
    this.caption.textContent = this.items[this.highlighted]!.label;
  }

  private pick(i: number): void {
    this.close();
    this.onPick?.(i);
  }

  /** Osoitin keskireiän ulkopuolella korostaa sen suunnassa olevan lohkon. */
  private onPoint = (e: PointerEvent) => {
    if (!this.open) return;
    const r = this.root.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    if (Math.hypot(dx, dy) < (HOLE * r.width) / 2) return;
    this.point(dx, dy);
  };

  private onKey = (e: KeyboardEvent) => {
    if (!this.open || e.altKey || e.ctrlKey || e.metaKey) return;
    const digit = /^(Digit|Numpad)([1-9])$/.exec(e.code);
    let handled = true;
    if (digit && Number(digit[2]) <= this.items.length) this.pick(Number(digit[2]) - 1);
    else if (e.code === 'ArrowRight' || e.code === 'ArrowDown') this.select(this.highlighted + 1);
    else if (e.code === 'ArrowLeft' || e.code === 'ArrowUp') this.select(this.highlighted - 1);
    else if (e.code === 'Enter' || e.code === 'NumpadEnter') this.pick(this.highlighted);
    // Pohjassa pidetty avausnäppäin (R avaa viehevalikon) toistuu: ei sulje.
    else if (this.opts.closeKeys.includes(e.code)) {
      if (!e.repeat) this.close();
    } else handled = false;
    if (!handled) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  };
}
