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
