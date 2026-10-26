import type { Structure } from '../map/bottom';
import type { BottomType } from '../map/scatter';
import { distance, type Vec2 } from '../vec2';
import type { Fish } from './fish';

/** Kaikuluotaimen keila: säde (m) = base + syvyys · spread. */
export const SONAR = {
  base: 1.5,
  spread: 0.35,
} as const;

export interface SonarEcho {
  depth: number;
  weight: number;
}

export interface SonarPing {
  /** Pohjan syvyys renkaan alla (m). */
  bottom: number;
  /** Keilaan osuvat kalat syvyysjärjestyksessä. */
  echoes: SonarEcho[];
  /** Pohjan laatu: kova pohja kaikuu vahvemmin. */
  floor?: BottomType;
  /** Pohjasta kohoava kivi, kasvusto tai risukko ja sen korkeus (m). */
  cover?: { kind: 'boulder' | 'weed' | 'brush'; height: number };
}

/** Pohjan tiedot renkaan alta (pohjan laatu ja rakenne). */
export interface SonarGround {
  floor?: BottomType;
  structure?: Structure | null;
}

/**
 * Yksi luotaus renkaan alta: pohja ja keilan sisällä uivat kalat. Keila
 * levenee syvemmälle mentäessä, kuten oikeassa luotaimessa.
 */
export function sonarPing(
  pos: Vec2,
  fish: readonly Fish[],
  bottom: number,
  ground: SonarGround = {},
): SonarPing {
  const echoes: SonarEcho[] = [];
  for (const f of fish) {
    if (f.mode === 'gone' || f.depth > bottom) continue;
    const radius = SONAR.base + f.depth * SONAR.spread;
    if (Math.abs(f.pos.x - pos.x) > radius || Math.abs(f.pos.y - pos.y) > radius) continue;
    if (distance(f.pos, pos) <= radius) echoes.push({ depth: f.depth, weight: f.weight });
  }
  echoes.sort((a, b) => a.depth - b.depth);
  const ping: SonarPing = { bottom, echoes };
  if (ground.floor) ping.floor = ground.floor;
  const st = ground.structure;
  if (st && (st.kind === 'boulder' || st.kind === 'weed' || st.kind === 'brush'))
    ping.cover = { kind: st.kind, height: st.height ?? 0 };
  return ping;
}

/** Näytön syvyysalue (m): pienin porras, johon pohja mahtuu. */
export function sonarRange(bottom: number): number {
  return [3, 5, 8, 12, 20].find((r) => r >= bottom + 0.5) ?? Math.ceil(bottom + 1);
}
