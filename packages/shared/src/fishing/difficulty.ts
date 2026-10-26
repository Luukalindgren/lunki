import type { FlyCastAssist } from './flyCast';

/** Kalastuksen vaikeustaso valitaan peliä luodessa. */
export type Difficulty = 'easy' | 'normal' | 'realistic';

export interface DifficultyParams {
  /** Kalan vetovoiman kerroin. */
  fishStrength: number;
  /** Kalan väsymisnopeuden kerroin. */
  staminaDrain: number;
  /** Kiinnostuksen ja iskujen yleisyyden kerroin. */
  biteRate: number;
  /** Tarttuuko kala aina iskiessään. */
  autoHook: boolean;
  /** Aika (s), jonka sisällä kelaus/vedon pitää alkaa iskun jälkeen. */
  hookWindow: number;
  /** Todennäköisyys, että vastaisku onnistuu. */
  hookChance: number;
  /** Voiko siima katketa liian kireällä jarrulla. */
  lineCanBreak: boolean;
  /** Löysällä siimalla kala irtoaa näin monen sekunnin jälkeen (Infinity = ei koskaan). */
  slackEscape: number;
  /** Perhoheiton ajoitusikkunat ja avut (#235). */
  flyCast: FlyCastAssist;
}

export const DIFFICULTIES: Record<Difficulty, DifficultyParams> = {
  easy: {
    fishStrength: 0.45,
    staminaDrain: 2.5,
    biteRate: 1.8,
    autoHook: true,
    hookWindow: Infinity,
    hookChance: 1,
    lineCanBreak: false,
    slackEscape: Infinity,
    flyCast: {
      early: 0.35,
      late: 1.5,
      lateMin: 0.8,
      marker: true,
      autoSlip: true,
      harsh: false,
      errors: false,
    },
  },
  normal: {
    fishStrength: 1,
    staminaDrain: 1,
    biteRate: 1,
    autoHook: false,
    hookWindow: 0.9,
    hookChance: 0.9,
    lineCanBreak: true,
    slackEscape: 3,
    flyCast: {
      early: 0.65,
      late: 0.6,
      lateMin: 0.35,
      marker: true,
      autoSlip: false,
      harsh: false,
      errors: true,
    },
  },
  realistic: {
    fishStrength: 1.3,
    staminaDrain: 0.7,
    biteRate: 0.7,
    autoHook: false,
    hookWindow: 0.45,
    hookChance: 0.75,
    lineCanBreak: true,
    slackEscape: 1.5,
    flyCast: {
      early: 0.8,
      late: 0.35,
      lateMin: 0.2,
      marker: false,
      autoSlip: false,
      harsh: true,
      errors: true,
    },
  },
};

export const DIFFICULTY_NAMES: Record<Difficulty, string> = {
  easy: 'Helppo',
  normal: 'Normaali',
  realistic: 'Realistinen',
};
