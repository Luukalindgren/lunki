/** Nimikylttien pino (#633): mitat CSS-pikseleinä. */
export const TAG_STACK = {
  /** Pinossa näkyy enintään näin monta kylttiä; loput lasketaan ylimmän perään ("+3"). */
  max: 4,
  /** Väli pinon kylttien välissä. */
  gap: 2,
} as const;

/** Kyltti näytöllä: ankkurin paikka (kyltin alareunan keskikohta), koko ja etäisyys kamerasta. */
export interface TagBox {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  dist: number;
}

/** Kyltin paikka pinossa: nosto ylöspäin, piilotus ja ylimmän kyltin perään tuleva määrä. */
export interface TagSlot {
  lift: number;
  hidden: boolean;
  more: number;
}

/**
 * Asettelee päällekkäin osuvat nimikyltit pinoksi (#633). Lähin kalastaja
 * pitää kylttinsä paikallaan, ja kauempana olevan kyltti nousee sen päälle.
 * Pinossa on enintään `TAG_STACK.max` kylttiä: loput piilotetaan, ja ylin
 * kyltti kertoo niiden määrän.
 */
export function stackTags(tags: readonly TagBox[]): Map<string, TagSlot> {
  const out = new Map<string, TagSlot>();
  const placed: { id: string; l: number; r: number; top: number; bottom: number; level: number }[] =
    [];
  const order = [...tags].sort((a, b) => a.dist - b.dist || (a.id < b.id ? -1 : 1));
  for (const t of order) {
    const l = t.x - t.w / 2;
    const r = t.x + t.w / 2;
    let bottom = t.y;
    let level = 0;
    let under: (typeof placed)[number] | undefined;
    // Nostetaan, kunnes kyltti ei osu yhteenkään jo asetettuun.
    for (;;) {
      const hit = placed.find(
        (p) => l < p.r && r > p.l && bottom - t.h < p.bottom && bottom > p.top,
      );
      if (!hit) break;
      bottom = hit.top - TAG_STACK.gap;
      level = Math.max(level, hit.level + 1);
      under = hit;
    }
    if (level >= TAG_STACK.max && under) {
      out.set(t.id, { lift: 0, hidden: true, more: 0 });
      out.get(under.id)!.more++;
      continue;
    }
    placed.push({ id: t.id, l, r, top: bottom - t.h, bottom, level });
    out.set(t.id, { lift: t.y - bottom, hidden: false, more: 0 });
  }
  return out;
}
