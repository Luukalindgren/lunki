/**
 * Valikoiden näppäimistöohjaus peliohjaimen tapaan (#237): ylös/alas liikkuu
 * rivien välillä, vasen/oikea rivin sisällä, Enter tai välilyönti valitsee ja
 * Esc tai Backspace palaa edelliseen näkymään.
 *
 * Rivit päätellään paneelin rakenteesta, joten näkymien ei tarvitse tehdä
 * omaa käsittelyä: valintarivin painikkeet (`.choice-options`), painikerivi
 * (`.buttons`), liukusäädin ja kartan zoomausnapit ovat kukin yksi rivi,
 * muut kohdistettavat (päävalikon napit, tekstikentät) omia rivejään.
 * Peliohjaimen voi myöhemmin kytkeä samaan `handle`-kutsuun.
 */
export type NavAction = 'up' | 'down' | 'left' | 'right' | 'select' | 'back';

const FOCUSABLE = 'button, input, textarea, select, a[href], [tabindex]:not([tabindex="-1"])';
/** Rivin muodostavat ryhmät; muut kohdistettavat ovat omia rivejään. */
const ROW_GROUP = '.choice-options, .buttons:not(.main-menu), .hud-size-track, .lake-map-zoom';

const KEY_ACTIONS: Record<string, NavAction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Enter: 'select',
  NumpadEnter: 'select',
  Space: 'select',
  Escape: 'back',
  Backspace: 'back',
};

const isTextField = (e: Element | null): e is HTMLInputElement | HTMLTextAreaElement =>
  e instanceof HTMLTextAreaElement ||
  (e instanceof HTMLInputElement && e.type !== 'range' && e.type !== 'checkbox');

export class MenuNav {
  /** Näkymän paluutoiminto (Esc / Backspace); null = ei paluuta. */
  back: (() => void) | null = null;
  /** Viimeksi klikattu kohde: Safari ei kohdista nappeja klikatessa. */
  private lastActive: Element | null = null;
  /** Oliko näppäinkohdistuksen merkki näkyvissä ennen tätä painallusta. */
  private keyboardBefore = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly isOpen: () => boolean,
  ) {
    // Merkki näkyviin jo ennen kohteiden omaa käsittelyä (järvikartan tähtäin).
    window.addEventListener('keydown', this.onKeyCapture, true);
    window.addEventListener('keydown', this.onKey);
    // Hiiri tai kosketus piilottaa näppäinkohdistuksen merkin.
    root.addEventListener('pointermove', this.pointer);
    root.addEventListener('pointerdown', this.pointer);
    root.addEventListener('click', (e) => (this.lastActive = e.target as Element), true);
  }

  /** Paneelin näkyvät ja käytössä olevat kohdistettavat dokumentin järjestyksessä. */
  items(): HTMLElement[] {
    return [...this.scope().querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (e) =>
        !(e as HTMLButtonElement).disabled &&
        !e.closest('[hidden]') &&
        e.getClientRects().length > 0,
    );
  }

  private indexItems(): HTMLElement[] {
    return this.items().filter((e) => !e.closest('.chat'));
  }

  /** Päällimmäinen kerros: avoin ikkuna (esim. punnituskortti) tai koko valikko. */
  private scope(): HTMLElement {
    const modals = this.root.querySelectorAll<HTMLElement>('.screen-modal');
    return modals[modals.length - 1] ?? this.root;
  }

  /** Kohdistettavat riveittäin. */
  rows(): HTMLElement[][] {
    const rows: HTMLElement[][] = [];
    let group: Element | null = null;
    for (const item of this.items()) {
      const g = item.closest(ROW_GROUP);
      if (g && g === group) rows[rows.length - 1]!.push(item);
      else rows.push([item]);
      group = g;
    }
    return rows;
  }

  /** Kohdistettu kohde paneelissa, tai viimeksi klikattu, jos kohdistus on muualla. */
  current(): HTMLElement | null {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body && this.root.contains(active))
      return active;
    const last = this.lastActive?.closest(FOCUSABLE);
    return last instanceof HTMLElement && this.root.contains(last) ? last : null;
  }

  /**
   * Kohdistetun kohteen järjestysnumero (muistiin näkymää vaihdettaessa).
   * Chat ei ole mukana: se siirtyy uudelleenpiirrossa paneelista toiseen ja
   * palauttaa kentän kohdistuksen itse.
   */
  currentIndex(): number {
    const c = this.current();
    return c ? this.indexItems().indexOf(c) : -1;
  }

  /** Kohdistaa n:nnen kohteen (`currentIndex`); false, jos sellaista ei ole. */
  focusIndex(index: number, preventScroll = false): boolean {
    const item = this.indexItems()[index];
    if (!item) return false;
    item.focus({ preventScroll });
    return true;
  }

  /** Näppäinkohdistuksen merkki näkyviin (true) tai piiloon. */
  setKeyboard(on: boolean): void {
    this.root.classList.toggle('kb', on);
  }

  /** Suorittaa valikkotoiminnon. Palauttaa true, jos toiminto käsiteltiin. */
  handle(action: NavAction, target: Element | null = document.activeElement): boolean {
    if (!this.isOpen()) return false;
    if (action === 'back') {
      if (!this.back) return false;
      this.back();
      return true;
    }
    const current = this.current();
    // Ei kohdistusta paneelissa: ensimmäinen painallus vain kohdistaa.
    if (!current || target === document.body || !this.root.contains(target)) {
      const fallback =
        this.root.querySelector<HTMLElement>('button.primary') ?? this.items()[0] ?? null;
      (current ?? fallback)?.focus();
      return true;
    }
    if (action === 'select') return false; // napin oma Enter/välilyönti
    const rows = this.rows();
    const r = rows.findIndex((row) => row.includes(current));
    if (r < 0) return false;
    const row = rows[r]!;
    const i = row.indexOf(current);
    if (action === 'left' || action === 'right') {
      const next = row[i + (action === 'left' ? -1 : 1)];
      if (!next) return true;
      next.focus();
      // Valintarivillä liike myös valitsee, kuten peliohjaimella.
      const group = next.closest('.choice-options');
      if (group && !group.matches('.swatches, [data-nav="focus"]')) next.click();
      return true;
    }
    const down = action === 'down';
    // Monirivinen ryhmä (värit ruudukkona, kapealla näytöllä rivitetyt valinnat).
    const inside = lineNeighbour(row, current, down);
    if (inside) {
      inside.focus();
      return true;
    }
    const next = rows[(r + (down ? 1 : -1) + rows.length) % rows.length]!;
    (next.find((e) => e.matches('.selected, [aria-pressed="true"]')) ?? next[0]!).focus();
    return true;
  }

  private onKeyCapture = () => {
    if (!this.isOpen()) return;
    this.keyboardBefore = this.root.classList.contains('kb');
    this.setKeyboard(true);
  };

  private onKey = (e: KeyboardEvent) => {
    if (!this.isOpen() || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const action = KEY_ACTIONS[e.code];
    if (!action) return;
    const target = e.target instanceof Element ? e.target : null;
    if (isTextField(target)) {
      // Tekstikentässä nuolet ja Backspace toimivat normaalisti; ylös/alas
      // siirtää pois kentästä (monirivisessä vasta tekstin alussa tai lopussa).
      if (action === 'up' || action === 'down') {
        if (target instanceof HTMLTextAreaElement) {
          const atEdge =
            action === 'up'
              ? target.selectionStart === 0
              : target.selectionEnd === target.value.length;
          if (!atEdge) return;
        }
      } else if (e.code !== 'Escape') return;
    }
    // Liukusäädin muuttuu vasemmalla ja oikealla itse.
    if (
      target instanceof HTMLInputElement &&
      target.type === 'range' &&
      (action === 'left' || action === 'right')
    )
      return;
    // Hiirellä käytön jälkeen ensimmäinen nuoli vain näyttää, missä kohdistus on.
    const arrow = action !== 'select' && action !== 'back';
    if (arrow && !this.keyboardBefore && this.current() === target) {
      e.preventDefault();
      return;
    }
    if (this.handle(action, target)) e.preventDefault();
  };

  private pointer = (e: PointerEvent) => {
    if (e.type === 'pointermove' && e.movementX === 0 && e.movementY === 0) return;
    this.setKeyboard(false);
  };
}

/**
 * Samaan ryhmään kuuluva kohde viereiseltä näkyvältä riviltä (ylös tai alas),
 * vaakasuunnassa lähin. Null, jos ryhmä on yhdellä rivillä tai reunassa.
 */
function lineNeighbour(
  row: HTMLElement[],
  current: HTMLElement,
  down: boolean,
): HTMLElement | null {
  if (row.length < 2) return null;
  const c = current.getBoundingClientRect();
  const cx = c.left + c.width / 2;
  let best: HTMLElement | null = null;
  let bestLine = Infinity;
  let bestDx = Infinity;
  for (const item of row) {
    if (item === current) continue;
    const r = item.getBoundingClientRect();
    // Eri rivillä: kokonaan alla tai yllä (pieni limitys sallitaan).
    const gap = down ? r.top - (c.bottom - 2) : c.top + 2 - r.bottom;
    if (gap < 0) continue;
    const dx = Math.abs(r.left + r.width / 2 - cx);
    if (gap < bestLine - 1 || (Math.abs(gap - bestLine) <= 1 && dx < bestDx)) {
      best = item;
      bestLine = gap;
      bestDx = dx;
    }
  }
  return best;
}
