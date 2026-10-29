import type { Action, Controls } from './controls';

/** Ympyrävalikko, jonka voi valita avausnäppäimen irrotuksella. */
export interface HoldableMenu {
  readonly open: boolean;
  /** Korostettu kohta. */
  readonly selected: number;
  /** Valitsee osoitetun (korostetun) kohdan ja sulkee valikon. */
  pickSelected(): void;
}

/**
 * Pikavalikon pito (#387): valikko on auki niin kauan kuin avausnäppäin tai
 * -nappi on pohjassa, ja irrotus valitsee kohdan, jota hiiri, sormi tai nuoli
 * osoittaa. Lyhyt napautus (alle `minHold` s) osoittamatta jättää valikon
 * auki valintaa varten; nopeakin pito, jonka aikana osoitettiin toista kohtaa, valitsee.
 * Pito mitataan seinäkellolla: hitaalla koneella pelin aika etenee ruutua
 * kohden enintään neljännessekunnin, jolloin pitkäkin pito näyttäisi napautukselta.
 */
export class HeldMenu {
  /** Avaushetki (ms), kun avausnäppäin on yhä pohjassa; null kun ei pidetä. */
  private since: number | null = null;
  /** Avattaessa korostettu kohta. */
  private first = 0;

  constructor(
    private readonly menu: () => HoldableMenu | null,
    private readonly action: Action,
    private readonly minHold = 0,
    private readonly now = () => performance.now(),
  ) {}

  /** Valikko avattiin juuri: jos näppäin on yhä pohjassa, irrotus valitsee. */
  opened(c: Controls): void {
    this.since = c.isDown(this.action) ? this.now() : null;
    this.first = this.menu()?.selected ?? 0;
  }

  step(c: Controls): void {
    if (this.since === null) return;
    const menu = this.menu();
    if (!menu?.open) {
      this.since = null;
      return;
    }
    if (c.isDown(this.action)) return;
    const long = this.now() - this.since >= this.minHold * 1000;
    if (long || menu.selected !== this.first) menu.pickSelected();
    this.since = null;
  }
}
