import type { FlyCastAssist } from './flyCast';

/** Kalastuksen vaikeustaso valitaan peliä luodessa. */
/**
 * `relaxed` (Rento, #638) on ensikertalaisen taso: Helpon kalat ja lisäksi
 * yksinkertaistettu ohjaus (`simple`).
 */
export type Difficulty = 'relaxed' | 'easy' | 'normal' | 'realistic';

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
  /**
   * Syöntijaksot (#510): parvet ja yksin elävät kalat vuorottelevat syöntiä
   * ja lepoa. Helpolla kaikki kalat syövät koko ajan tasaisesti.
   */
  feedingBouts: boolean;
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
  /**
   * Yksinkertaistettu ohjaus (#638): yksi nappi heittää ja kelaa, kelaus
   * nostaa pintaan väsyneen kalan, kelalla on yksi nopeus eikä jarrua
   * säädetä, ja kalastetaan vain virvelillä. Asiakas jättää pois näppäimet,
   * joita ei tarvita, ja ohje näyttää vain lyhyet rivit.
   */
  simple: boolean;
  /** Nosto väsytyksen lopuksi (#366). */
  landing: {
    /** Riuhtaisuja sekunnissa täysin voimissaan olevalla kalalla (kerrotaan voimilla). */
    lungeRate: number;
    /** Todennäköisyys, että nosto riuhtaisun aikana päästää kalan irti. */
    lungeEscape: number;
  };
}

export const DIFFICULTIES: Record<Difficulty, DifficultyParams> = {
  relaxed: {
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
    feedingBouts: false,
    snagRate: 0,
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
    // Kala ei riuhdo nostossa: kelaus tuo sen kyytiin.
    simple: true,
    landing: { lungeRate: 0, lungeEscape: 0 },
  },
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
    feedingBouts: false,
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
    simple: false,
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
    feedingBouts: true,
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
    simple: false,
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
    feedingBouts: true,
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
    simple: false,
    landing: { lungeRate: 0.8, lungeEscape: 0.8 },
  },
};

export const DIFFICULTY_NAMES: Record<Difficulty, string> = {
  relaxed: 'Rento',
  easy: 'Helppo',
  normal: 'Normaali',
  realistic: 'Realistinen',
};
