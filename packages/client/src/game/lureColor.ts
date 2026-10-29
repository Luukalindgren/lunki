/** Syvyys (m), jota syvemmällä viehe näkyy vaalean liilana ja tummana violettina. */
export const LURE_SHALLOW = 0.2;
export const LURE_DEEP = 1.2;

/**
 * Vieheen väri syvyyden mukaan: oranssi pinnassa (ja maalla), vaalea liila
 * uppoamassa ja tumma violetti syvällä. Sama väri järvellä ja vieheluotaimessa.
 */
export function lureColor(depth: number, onLand = false): number {
  if (onLand || depth <= LURE_SHALLOW) return 0xf08a2c;
  return depth > LURE_DEEP ? 0x6b2d6e : 0xc05bb4;
}

/** Pohjan tuntumassa (m pohjasta) viehe näkyy pohjan ruskeana. */
export const LURE_NEAR_BOTTOM = 0.3;

export const LURE_LOOK = {
  snag: 0xd23a2a,
  fouled: 0x6a9a3e,
  bottom: 0x8a6a42,
  /** Syvällä merkki pienenee: tällä syvyydellä (m) pienimmillään. */
  smallDepth: 2.5,
  smallScale: 0.6,
} as const;

/**
 * Vieheen merkki järvellä (väri ja koko), jotta tilan näkee katsomatta
 * vieheluotainta: syvyys värinä ja kokona (syvempi on pienempi), pohjan
 * tuntuma ruskeana, rikkaa keränneenä vihreänä ja pohjaan tarttuneena
 * punaisena kuten luotaimessa.
 */
export function lureLook(l: {
  depth: number;
  bottom: number;
  onLand?: boolean;
  snag?: boolean;
  fouled?: boolean;
}): { color: number; scale: number } {
  const k = Math.min(1, Math.max(0, l.depth) / LURE_LOOK.smallDepth);
  const scale = l.onLand ? 1 : 1 - (1 - LURE_LOOK.smallScale) * k;
  const near = l.depth > LURE_SHALLOW && l.bottom - l.depth <= LURE_NEAR_BOTTOM;
  const color = l.onLand
    ? lureColor(l.depth, true)
    : l.snag
      ? LURE_LOOK.snag
      : l.fouled
        ? LURE_LOOK.fouled
        : near
          ? LURE_LOOK.bottom
          : lureColor(l.depth);
  return { color, scale };
}
