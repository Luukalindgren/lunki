/**
 * Pelin rajattu väripaletti. Sävyt ovat Pro Pilkki -henkisiä: syvän ja matalan
 * veden siniset, rantojen vihreät ja ruskeat, lumi- ja taivassävyt sekä
 * HUD:n kirkkaat korostusvärit.
 */
export const PALETTE_HEX = [
  // tummat ja neutraalit
  0x0b0f14, 0x1c232b, 0x39424d, 0x5f6b78, 0x8e99a4, 0xc3cbd2, 0xeef2f3,
  // vesi: syvä → matala
  0x0d2238, 0x123a5c, 0x1b5a84, 0x2b7aa6, 0x4d9cc2, 0x83c2db,
  // kasvillisuus
  0x14301e, 0x24502c, 0x3b7337, 0x6a9a3e, 0xa3c45a,
  // maa, puu, kivi
  0x3b2a1e, 0x5e432b, 0x8a6a42, 0xb99a68, 0xe0cf9c,
  // korostukset: siima, viehe, HUD
  0x8c1c1c, 0xd23a2a, 0xf08a2c, 0xf6d04d, 0xfff3b0, 0x6b2d6e, 0xc05bb4, 0x2f9e8f, 0x9ef0d6,
] as const;

export type Rgb = readonly [number, number, number];

export const hexToRgb = (hex: number): Rgb => [
  ((hex >> 16) & 0xff) / 255,
  ((hex >> 8) & 0xff) / 255,
  (hex & 0xff) / 255,
];

export const PALETTE: readonly Rgb[] = PALETTE_HEX.map(hexToRgb);

/** Lähin palettiväri (sama logiikka kuin jälkikäsittelyshaderissa). */
export function nearestPaletteColor(color: Rgb, palette: readonly Rgb[] = PALETTE): Rgb {
  let best = palette[0]!;
  let bestDist = Infinity;
  for (const p of palette) {
    const dr = p[0] - color[0];
    const dg = p[1] - color[1];
    const db = p[2] - color[2];
    // Painotettu etäisyys: silmä on herkin vihreälle.
    const d = dr * dr * 0.299 + dg * dg * 0.587 + db * db * 0.114;
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return best;
}
