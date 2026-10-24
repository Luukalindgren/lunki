import type { Vec2 } from '../vec2';

/**
 * Siima pistejonona (Verlet). Päät kiinnitetään vavan kärkeen ja vieheeseen;
 * välipisteet saavat löystyä, mutta pisteiden väli ei voi ylittää siiman
 * pituutta jaettuna osien määrällä. Ylhäältä katsottuna siima lepää pinnalla.
 */
export const LINE_POINTS = 24;

export interface VerletLine {
  points: Vec2[];
  prev: Vec2[];
}

const VERLET = {
  /** Nopeuden vaimennus askeleessa (vesi hidastaa siimaa). */
  damping: 0.85,
  /** Rajoitteiden iteraatiot. Enemmän = jäykempi siima. */
  iterations: 10,
} as const;

export function createLine(from: Vec2, to: Vec2): VerletLine {
  const points: Vec2[] = [];
  for (let i = 0; i < LINE_POINTS; i++) {
    const t = i / (LINE_POINTS - 1);
    points.push({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
  }
  return { points, prev: points.map((p) => ({ ...p })) };
}

/** Asettaa siiman suoraksi (esim. lennon aikana). */
export function straightenLine(line: VerletLine, from: Vec2, to: Vec2): void {
  for (let i = 0; i < LINE_POINTS; i++) {
    const t = i / (LINE_POINTS - 1);
    const p = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
    line.points[i] = p;
    line.prev[i] = { ...p };
  }
}

/**
 * Etenee yhden askeleen. `length` on ulkona olevan siiman pituus, `drift` hidas
 * pintavirtaus/tuuli (m/s²), joka näyttää löysän siiman kaartumisen.
 */
export function stepLine(
  line: VerletLine,
  from: Vec2,
  to: Vec2,
  length: number,
  dt: number,
  drift: Vec2 = { x: 0, y: 0 },
): void {
  const { points, prev } = line;
  const n = points.length;
  const dt2 = dt * dt;
  for (let i = 1; i < n - 1; i++) {
    const p = points[i]!;
    const q = prev[i]!;
    const vx = (p.x - q.x) * VERLET.damping;
    const vy = (p.y - q.y) * VERLET.damping;
    prev[i] = { x: p.x, y: p.y };
    points[i] = { x: p.x + vx + drift.x * dt2, y: p.y + vy + drift.y * dt2 };
  }
  points[0] = { ...from };
  points[n - 1] = { ...to };

  const rest = Math.max(length, 0.01) / (n - 1);
  for (let k = 0; k < VERLET.iterations; k++) {
    for (let i = 0; i < n - 1; i++) {
      const a = points[i]!;
      const b = points[i + 1]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d <= rest || d === 0) continue;
      // Vain venymistä vastustetaan: siima voi löystyä mutta ei venyä.
      const diff = (d - rest) / d;
      const aPinned = i === 0;
      const bPinned = i + 1 === n - 1;
      if (aPinned && bPinned) continue;
      const wa = aPinned ? 0 : bPinned ? 1 : 0.5;
      const wb = 1 - wa;
      points[i] = { x: a.x + dx * diff * wa, y: a.y + dy * diff * wa };
      points[i + 1] = { x: b.x - dx * diff * wb, y: b.y - dy * diff * wb };
    }
  }
}

/** Siiman piirretty pituus (testejä ja jännityksen näyttöä varten). */
export function lineLength(line: VerletLine): number {
  let len = 0;
  for (let i = 0; i < line.points.length - 1; i++) {
    const a = line.points[i]!;
    const b = line.points[i + 1]!;
    len += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return len;
}
