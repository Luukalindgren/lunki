/**
 * Siemennetty satunnaislukugeneraattori (mulberry32). Tila on yksi luku, joten
 * se voidaan tallentaa ja synkronoida palvelimen ja asiakkaan välillä.
 */
export class Rng {
  constructor(public state: number) {}

  /** Tasajakauma [0, 1). */
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Normaalijakauma (Box–Muller). */
  normal(mean = 0, sd = 1): number {
    const u = Math.max(1e-12, this.next());
    const v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** Tapahtuuko asia, jonka todennäköisyys sekunnissa on `perSecond`, tällä askeleella. */
  chance(perSecond: number, dt: number): boolean {
    return this.next() < 1 - Math.exp(-perSecond * dt);
  }
}
