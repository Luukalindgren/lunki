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
} as const;

/**
 * Vieheen tilan väri järvellä, jotta tilan näkee katsomatta vieheluotainta:
 * syvyys värinä, pohjan tuntuma ruskeana, rikkaa keränneenä vihreänä ja
 * pohjaan tarttuneena punaisena kuten luotaimessa.
 */
export function lureLook(l: {
  depth: number;
  bottom: number;
  onLand?: boolean;
  snag?: boolean;
  fouled?: boolean;
}): number {
  if (l.onLand) return lureColor(l.depth, true);
  if (l.snag) return LURE_LOOK.snag;
  if (l.fouled) return LURE_LOOK.fouled;
  const near = l.depth > LURE_SHALLOW && l.bottom - l.depth <= LURE_NEAR_BOTTOM;
  return near ? LURE_LOOK.bottom : lureColor(l.depth);
}
