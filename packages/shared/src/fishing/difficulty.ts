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
  },
};

export const DIFFICULTY_NAMES: Record<Difficulty, string> = {
  easy: 'Helppo',
  normal: 'Normaali',
  realistic: 'Realistinen',
};
