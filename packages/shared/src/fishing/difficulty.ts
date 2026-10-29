import type { FlyCastAssist } from './flyCast';

/** Kalastuksen vaikeustaso valitaan peliä luodessa. */
export type Difficulty = 'easy' | 'normal' | 'realistic';

export interface DifficultyParams {
  /** Kalan vetovoiman kerroin. */
  fishStrength: number;
  /**
   * Kalan vastuksen kerroin kelattaessa: helpolla väsynyt isokin kala tulee
   * perässä oletusjarrulla, vaikka jarrua ei osaisi kiristää.
   */
  bodyDrag: number;
  /** Kalan väsymisnopeuden kerroin. */
  staminaDrain: number;
  /** Kiinnostuksen ja iskujen yleisyyden kerroin. */
  biteRate: number;
  /**
   * Kuinka paljon vieheen nopeus ja syvyys saavat poiketa kalan mieluisasta
   * (kerroin lajin toleransseille): helpolla kelpaa melkein mikä tahansa uitto.
   */
  appealTolerance: number;
  /**
   * Kalan havaintoetäisyyden kerroin: helpolla kalat tulevat vieheelle
   * kauempaa. Palvelin sallii saaliin sen mukaan kauempana kalan
   * kotipaikasta (catchRadius).
   */
  senseRange: number;
  /** Viehettä seuraavan kalan uintinopeuden kerroin. */
  chaseSpeed: number;
  /** Kuinka läheltä (m) seuraava kala voi iskeä vieheeseen. */
  strikeReach: number;
  /** Kuinka kauan kala jaksaa seurata viehettä (kerroin). */
  followTime: number;
  /** Arkailevatko suurkalat (varovaisuus, säikähtäminen kalastajasta). */
  wary: boolean;
  /** Pohjaan tarttumisen ja rikan keräämisen yleisyyden kerroin. */
  snagRate: number;
  /** Todennäköisyys, että pohjaan tarttunut viehe irtoaa vetämällä. */
  snagFreeChance: number;
  /** Tarttuuko kala aina iskiessään. */
  autoHook: boolean;
  /** Aika (s), jonka sisällä kelaus/vedon pitää alkaa iskun jälkeen. */
  hookWindow: number;
  /** Todennäköisyys, että vastaisku onnistuu. */
  hookChance: number;
  /**
   * Virvelin vastaisku (#402): suurin kokoluokka (`sizeClass`), johon pelkkä
   * kelaus pistää koukun. Isommat kalat tarttuvat vasta vavan nykäisyllä.
   */
  reelHookSize: number;
  /** Voiko siima katketa liian kireällä jarrulla. */
  lineCanBreak: boolean;
  /** Löysällä siimalla kala irtoaa näin monen sekunnin jälkeen (Infinity = ei koskaan). */
  slackEscape: number;
  /** Perhoheiton ajoitusikkunat ja avut (#235). */
  flyCast: FlyCastAssist;
  /** Nosto väsytyksen lopuksi (#366). */
  landing: {
    /** Riuhtaisuja sekunnissa täysin voimissaan olevalla kalalla (kerrotaan voimilla). */
    lungeRate: number;
    /** Todennäköisyys, että nosto riuhtaisun aikana päästää kalan irti. */
    lungeEscape: number;
  };
}

export const DIFFICULTIES: Record<Difficulty, DifficultyParams> = {
  easy: {
    fishStrength: 0.45,
    bodyDrag: 0.15,
    staminaDrain: 4,
    biteRate: 3,
    appealTolerance: 2.2,
    senseRange: 5,
    chaseSpeed: 1.8,
    strikeReach: 2.5,
    followTime: 3,
    wary: false,
    snagRate: 0.3,
    snagFreeChance: 1,
    autoHook: true,
    hookWindow: Infinity,
    hookChance: 1,
    reelHookSize: 4,
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
    // Helpolla anteeksiantava: harva riuhtaisu, eikä kala karkaa nostossa.
    landing: { lungeRate: 0.08, lungeEscape: 0 },
  },
  normal: {
    fishStrength: 1,
    bodyDrag: 0.6,
    staminaDrain: 1,
    biteRate: 1.2,
    appealTolerance: 1.3,
    senseRange: 2,
    chaseSpeed: 1.3,
    strikeReach: 1.2,
    followTime: 1.5,
    wary: true,
    snagRate: 0.7,
    snagFreeChance: 0.8,
    autoHook: false,
    hookWindow: 0.9,
    hookChance: 0.9,
    reelHookSize: 1,
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
    landing: { lungeRate: 0.5, lungeEscape: 0.5 },
  },
  realistic: {
    fishStrength: 1.3,
    bodyDrag: 1,
    staminaDrain: 0.7,
    biteRate: 0.7,
    appealTolerance: 1,
    senseRange: 1,
    chaseSpeed: 1,
    strikeReach: 1.2,
    followTime: 1,
    wary: true,
    snagRate: 1,
    snagFreeChance: 0.6,
    autoHook: false,
    hookWindow: 0.45,
    hookChance: 0.75,
    reelHookSize: 1,
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
    landing: { lungeRate: 0.8, lungeEscape: 0.8 },
  },
};

export const DIFFICULTY_NAMES: Record<Difficulty, string> = {
  easy: 'Helppo',
  normal: 'Normaali',
  realistic: 'Realistinen',
};
