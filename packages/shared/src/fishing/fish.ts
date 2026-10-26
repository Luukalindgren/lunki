import type { Structure } from '../map/bottom';
import { wrapAngle } from '../physics/tube';
import { Rng } from '../rng';
import { distance, type Vec2 } from '../vec2';
import type { WeatherNow } from '../weather/weather';
import type { DifficultyParams } from './difficulty';
import { baitOf, tackleAppeal, type Tackle } from './gear';

export type SpeciesId =
  | 'perch'
  | 'pike'
  | 'roach'
  | 'zander'
  | 'trout'
  | 'bream'
  | 'ruffe'
  | 'burbot'
  | 'ide'
  | 'rainbow'
  | 'carp';

/** Lajin ominaisuudet: koko, voima, elinalue ja käytös. */
export interface Species {
  id: SpeciesId;
  name: string;
  /** Elääkö laji oikeasti Lunkinjärvessä (muut ovat valinnaisia lisälajeja). */
  native: boolean;
  /** Suhteellinen runsaus: osuus järven kaloista, kun laji on mukana. */
  abundance: number;
  /** Parven koko ja levinneisyys parven keskipisteestä (m). */
  schoolSize: number;
  schoolSpread: number;
  /** Mieluisa pohjan syvyys parven paikalle (m). */
  habitat: { minDepth: number; maxDepth: number };
  /** Osuus parvista, jotka partioivat missä syvyydessä tahansa. */
  wanderShare: number;
  /** Pohjan rakenteet, joiden luona laji viihtyy, ja osuus parvista siellä. */
  structures: Structure['kind'][];
  structureShare: number;
  /** Painon mediaani (kg) ja lognormaalin hajonta. */
  medianWeight: number;
  weightSpread: number;
  minWeight: number;
  maxWeight: number;
  /** Harvinainen iso yksilö: todennäköisyys ja painon mediaani (kg). */
  trophyChance: number;
  trophyWeight: number;
  /**
   * Kokoluokkien alarajat (kg): iso, tosi iso, suurkala ja jättikala (#231).
   * Luotaimet näyttävät kaiun luokan mukaan.
   */
  sizes: readonly [number, number, number, number];
  /** Jättikaloja ja suurkaloja järvessä aina vähintään näin monta. */
  giants: { giant: number; huge: number };
  /** Vetovoima (kg) = weight · pullPerKg + pullBase. */
  pullPerKg: number;
  pullBase: number;
  /** Kestävyys: kuinka monta kg·s vetoa kala jaksaa painokiloa kohden. */
  endurancePerKg: number;
  /** Vieheen havaitsemisetäisyys (m). */
  senseRadius: number;
  /** Kuinka herkästi laji kiinnostuu vieheestä (kerroin). */
  lureInterest: number;
  /** Mieluisin vieheen nopeus (m/s) ja sallittu poikkeama. */
  preferredSpeed: number;
  speedTolerance: number;
  /** Vaellusnopeus (m/s) ja kuinka kauas kotipaikasta kala vaeltaa (m). */
  roamSpeed: number;
  homeRange: number;
  /** Uintinopeus seuratessa ja paetessa (m/s). */
  chaseSpeed: number;
  runSpeed: number;
  /** Kuinka lähellä pohjaa laji viihtyy (m pohjasta). */
  bottomOffset: number;
  /** Käytös: vuorokausirytmi, sää, parvi ja saalistustapa. */
  behavior: Behavior;
}

/** Lajin käytös oikeiden kalojen tapaan. */
export interface Behavior {
  /** Syöntiaktiivisuus yöllä, hämärässä ja päivällä (1 = tavallinen). */
  night: number;
  twilight: number;
  day: number;
  /** Pilvisyyden ja tuulen vaikutus aktiivisuuteen (osuus täydellä pilvellä / tuulella). */
  cloud: number;
  wind: number;
  /** Tuulen puoleisen rannan lisäaktiivisuus: aallot tuovat sinne ravintoa. */
  windShore: number;
  /** Saalistaa näön varassa: havaitsee vieheen pimeällä huonommin. */
  visual: boolean;
  /** Väijyjä: seisoo paikallaan, ei jahtaa kauas ja päättää iskun nopeasti. */
  ambush: boolean;
  /** Parvi kilpailee ruoasta: kun yksi seuraa viehettä, muutkin innostuvat. */
  competes: boolean;
  /** Saaliskala: parvi tiivistyy ja pakenee lähelle tulevaa haukea. */
  prey: boolean;
  /** Pohjan syvyys (m), jolle parvi hakeutuu valoisalla ja hämärässä tai pimeällä. */
  dayDepth: [number, number];
  dimDepth: [number, number];
  /**
   * Uintisyvyys osuutena vesipatsaasta (0 pinta, 1 pohja) valoisalla ja
   * pimeällä. Puuttuu, jos laji pysyy pohjan tuntumassa (bottomOffset).
   */
  column?: { day: number; dark: number };
  /**
   * Vastaiskun ikkunan kerroin (1 = tavallinen): kuhan varovainen "napsu"
   * pitää viehettä suussaan vain hetken.
   */
  strikeWindow?: number;
  /**
   * Seuraa viehettä pitkään ennen iskua (kerroin seuraamisen kestolle; isku
   * on vastaavasti harvempi sekunnissa). Taimen.
   */
  follows?: number;
  /** Hyppyjä sekunnissa paon aikana; löysällä siimalla kala irtoaa hypyssä. */
  jumps?: number;
  /** Pakojen pituuden kerroin väsytyksessä (karppi: pitkät pakoretket). */
  runs?: number;
}

export const SPECIES: Record<SpeciesId, Species> = {
  perch: {
    id: 'perch',
    name: 'Ahven',
    native: true,
    abundance: 6,
    schoolSize: 12,
    schoolSpread: 9,
    // Rantojen tuntuma ja syvänteiden reunat.
    habitat: { minDepth: 1, maxDepth: 4.5 },
    wanderShare: 0.25,
    structures: ['rocks', 'dropoff', 'weed', 'brush'],
    structureShare: 0.3,
    medianWeight: 0.14,
    weightSpread: 0.65,
    minWeight: 0.03,
    maxWeight: 1.6,
    trophyChance: 0.01,
    trophyWeight: 0.7,
    sizes: [0.2, 0.4, 0.8, 1.2],
    giants: { giant: 1, huge: 2 },
    pullPerKg: 2.6,
    pullBase: 0.25,
    endurancePerKg: 14,
    senseRadius: 9,
    lureInterest: 1,
    preferredSpeed: 0.6,
    speedTolerance: 0.5,
    roamSpeed: 0.25,
    homeRange: 25,
    chaseSpeed: 1.3,
    runSpeed: 1.8,
    bottomOffset: 0.8,
    // Päiväsaalistaja: syö aamulla ja illalla, lepää yöllä pohjassa.
    // Parvi kilpailee vieheestä, joten samasta paikasta saa usein monta.
    behavior: {
      night: 0.2,
      twilight: 1.35,
      day: 1,
      cloud: 0,
      wind: 0.15,
      windShore: 0.3,
      visual: true,
      ambush: false,
      competes: true,
      prey: false,
      dayDepth: [2, 5],
      dimDepth: [0.8, 3],
    },
  },
  pike: {
    id: 'pike',
    name: 'Hauki',
    native: true,
    abundance: 0.6,
    // Yksin vaaniva: kaislikon ja matalan rantaveden reunat.
    schoolSize: 1,
    schoolSpread: 0,
    habitat: { minDepth: 0.6, maxDepth: 2.2 },
    wanderShare: 0.1,
    structures: ['reeds', 'tree', 'rocks', 'weed', 'brush'],
    structureShare: 0.35,
    medianWeight: 1.3,
    weightSpread: 0.6,
    minWeight: 0.35,
    maxWeight: 12,
    trophyChance: 0.03,
    trophyWeight: 5,
    sizes: [1, 2.5, 5, 8],
    giants: { giant: 2, huge: 2 },
    pullPerKg: 1.2,
    pullBase: 0.8,
    endurancePerKg: 7,
    senseRadius: 12,
    lureInterest: 0.9,
    preferredSpeed: 1,
    speedTolerance: 0.7,
    roamSpeed: 0.06,
    homeRange: 8,
    chaseSpeed: 2.4,
    runSpeed: 2.6,
    bottomOffset: 0.4,
    // Väijyjä: seisoo kaislikon reunassa ja iskee ohi kulkevaan.
    // Parhaimmillaan hämärässä ja pilvisellä tuulisella säällä.
    behavior: {
      night: 0.3,
      twilight: 1.4,
      day: 0.9,
      cloud: 0.35,
      wind: 0.25,
      windShore: 0.25,
      visual: true,
      ambush: true,
      competes: false,
      prey: false,
      dayDepth: [0.6, 2.2],
      dimDepth: [0.6, 2.2],
    },
  },
  roach: {
    id: 'roach',
    name: 'Särki',
    native: true,
    abundance: 4,
    // Isot parvet matalassa ja välivedessä, liikkuvat paljon.
    schoolSize: 24,
    schoolSpread: 12,
    habitat: { minDepth: 0.5, maxDepth: 3 },
    wanderShare: 0.3,
    structures: ['reeds', 'weed'],
    structureShare: 0.2,
    medianWeight: 0.11,
    weightSpread: 0.5,
    minWeight: 0.02,
    maxWeight: 1,
    trophyChance: 0.01,
    trophyWeight: 0.45,
    sizes: [0.15, 0.3, 0.5, 0.7],
    giants: { giant: 1, huge: 2 },
    pullPerKg: 2.2,
    pullBase: 0.15,
    endurancePerKg: 12,
    senseRadius: 5,
    // Ei petokala: tarttuu uistimeen harvoin ja vain hitaaseen.
    lureInterest: 0.35,
    preferredSpeed: 0.25,
    speedTolerance: 0.3,
    roamSpeed: 0.35,
    homeRange: 40,
    chaseSpeed: 0.9,
    runSpeed: 1.4,
    bottomOffset: 1.2,
    // Päivällä parvi välivedessä ulompana, hämärässä matalikoilla ruokailemassa,
    // yöllä hajallaan pohjan tuntumassa. Kulkee aaltojen mukana tuulen alle.
    behavior: {
      night: 0.5,
      twilight: 1.3,
      day: 1,
      cloud: 0,
      wind: 0,
      windShore: 0,
      visual: true,
      ambush: false,
      competes: false,
      prey: true,
      dayDepth: [1.5, 4],
      dimDepth: [0.4, 1.5],
      column: { day: 0.55, dark: 0.85 },
    },
  },
  zander: {
    id: 'zander',
    name: 'Kuha',
    native: false,
    abundance: 0.8,
    // Pienet parvet syvänteissä.
    schoolSize: 5,
    schoolSpread: 6,
    habitat: { minDepth: 4, maxDepth: 99 },
    wanderShare: 0.15,
    structures: ['dropoff', 'rocks'],
    structureShare: 0.4,
    medianWeight: 1,
    weightSpread: 0.55,
    minWeight: 0.3,
    maxWeight: 9,
    trophyChance: 0.03,
    trophyWeight: 4,
    sizes: [1, 2, 4, 6],
    giants: { giant: 1, huge: 2 },
    pullPerKg: 1.6,
    pullBase: 0.6,
    endurancePerKg: 9,
    senseRadius: 8,
    lureInterest: 0.8,
    preferredSpeed: 0.45,
    speedTolerance: 0.35,
    roamSpeed: 0.18,
    homeRange: 30,
    chaseSpeed: 1.6,
    runSpeed: 2,
    bottomOffset: 0.3,
    // Hämäräsaalistaja: päivällä syvänteen pohjassa, yöllä nousee matalammalle.
    // Näkee hämärässä hyvin, joten pimeä ei haittaa.
    behavior: {
      night: 1.5,
      twilight: 1.6,
      day: 0.45,
      cloud: 0.5,
      wind: 0.3,
      windShore: 0.2,
      visual: false,
      ambush: false,
      competes: false,
      prey: false,
      dayDepth: [4, 99],
      dimDepth: [1.5, 4],
      column: { day: 0.95, dark: 0.6 },
      // Isku on usein varovainen napsu: vastaiskun ikkuna on lyhyempi.
      strikeWindow: 0.6,
    },
  },
  trout: {
    id: 'trout',
    name: 'Taimen',
    native: false,
    abundance: 0.5,
    // Istutettu taimen partioi avovedessä pintakerroksessa.
    schoolSize: 3,
    schoolSpread: 15,
    habitat: { minDepth: 2, maxDepth: 99 },
    wanderShare: 0.5,
    structures: [],
    structureShare: 0,
    medianWeight: 0.9,
    weightSpread: 0.5,
    minWeight: 0.3,
    maxWeight: 6,
    trophyChance: 0.03,
    trophyWeight: 3,
    sizes: [1, 2, 3, 4.5],
    giants: { giant: 1, huge: 2 },
    pullPerKg: 3,
    pullBase: 0.5,
    endurancePerKg: 16,
    senseRadius: 11,
    lureInterest: 1,
    preferredSpeed: 1.2,
    speedTolerance: 0.6,
    roamSpeed: 0.5,
    homeRange: 60,
    chaseSpeed: 2.8,
    runSpeed: 3.2,
    bottomOffset: 2,
    // Viileän veden kala: aktiivisin hämärässä ja pilvisellä, kirkkaalla syvemmällä.
    behavior: {
      night: 0.4,
      twilight: 1.4,
      day: 0.8,
      cloud: 0.5,
      wind: 0.2,
      windShore: 0,
      visual: true,
      ambush: false,
      competes: false,
      prey: false,
      dayDepth: [2, 99],
      dimDepth: [1, 99],
      column: { day: 0.45, dark: 0.25 },
      // Seuraa viehettä pitkään ennen iskua ja hyppii väsytyksessä.
      follows: 1.8,
      jumps: 0.3,
    },
  },
  bream: {
    id: 'bream',
    name: 'Lahna',
    native: true,
    abundance: 1.6,
    // Parvet mutapohjaisissa lahdissa ja syvänteen reunoilla.
    schoolSize: 16,
    schoolSpread: 10,
    habitat: { minDepth: 2, maxDepth: 6 },
    wanderShare: 0.2,
    structures: ['weed', 'dropoff'],
    structureShare: 0.2,
    medianWeight: 0.8,
    weightSpread: 0.55,
    minWeight: 0.15,
    maxWeight: 6,
    trophyChance: 0.03,
    trophyWeight: 2.5,
    sizes: [1, 2, 3.5, 5],
    giants: { giant: 1, huge: 2 },
    // Raskas, kylki virtaa vasten, mutta ei nopeita pakoja.
    pullPerKg: 1.4,
    pullBase: 0.3,
    endurancePerKg: 8,
    senseRadius: 5,
    // Pohjasta ruokaileva, ei petokala: tarttuu harvoin ja vain hitaaseen,
    // pohjaa laahaavaan jigiin.
    lureInterest: 0.25,
    preferredSpeed: 0.15,
    speedTolerance: 0.2,
    roamSpeed: 0.2,
    homeRange: 30,
    chaseSpeed: 0.7,
    runSpeed: 1.1,
    bottomOffset: 0.3,
    // Hämärässä ja yöllä parvi nousee ruokailemaan matalikoille.
    behavior: {
      night: 0.9,
      twilight: 1.3,
      day: 0.6,
      cloud: 0.2,
      wind: 0,
      windShore: 0.15,
      visual: false,
      ambush: false,
      competes: false,
      prey: false,
      dayDepth: [2.5, 6],
      dimDepth: [1, 3],
    },
  },
  ruffe: {
    id: 'ruffe',
    name: 'Kiiski',
    native: true,
    // Harvinainen: yllätys eikä riesa.
    abundance: 0.5,
    schoolSize: 12,
    schoolSpread: 6,
    habitat: { minDepth: 2, maxDepth: 8 },
    wanderShare: 0.2,
    structures: ['dropoff', 'rocks'],
    structureShare: 0.25,
    medianWeight: 0.04,
    weightSpread: 0.45,
    minWeight: 0.012,
    maxWeight: 0.25,
    trophyChance: 0.02,
    trophyWeight: 0.12,
    sizes: [0.06, 0.1, 0.15, 0.2],
    giants: { giant: 1, huge: 1 },
    // Ei juuri vastusta.
    pullPerKg: 2,
    pullBase: 0.08,
    endurancePerKg: 8,
    senseRadius: 4,
    // Tarttuu herkästi pohjan tuntumassa uitettuun jigiin ja pieneen lippaan.
    lureInterest: 1.1,
    preferredSpeed: 0.2,
    speedTolerance: 0.3,
    roamSpeed: 0.15,
    homeRange: 25,
    chaseSpeed: 0.8,
    runSpeed: 1,
    bottomOffset: 0.2,
    // Pimeän ja hämärän kala, päivälläkin aktiivinen syvällä.
    behavior: {
      night: 1.2,
      twilight: 1.3,
      day: 0.8,
      cloud: 0.1,
      wind: 0,
      windShore: 0,
      visual: false,
      ambush: false,
      competes: false,
      prey: false,
      dayDepth: [3, 99],
      dimDepth: [2, 6],
    },
  },
  burbot: {
    id: 'burbot',
    name: 'Made',
    native: true,
    abundance: 0.35,
    // Yksin syvänteessä ja jyrkänteen alla kylmässä pohjavedessä.
    schoolSize: 1,
    schoolSpread: 0,
    habitat: { minDepth: 4, maxDepth: 99 },
    wanderShare: 0.15,
    structures: ['dropoff', 'rocks', 'tree'],
    structureShare: 0.4,
    medianWeight: 0.6,
    weightSpread: 0.55,
    minWeight: 0.15,
    maxWeight: 4,
    trophyChance: 0.03,
    trophyWeight: 1.5,
    sizes: [0.8, 1.5, 2.5, 3.2],
    giants: { giant: 1, huge: 2 },
    // Kiemurteleva, ei pitkiä pakoja.
    pullPerKg: 1.3,
    pullBase: 0.3,
    endurancePerKg: 6,
    senseRadius: 6,
    // Tarttuu yöllä pohjaan lasketun, paikallaan tai hitaasti nytkytetyn jigin perään.
    lureInterest: 0.8,
    preferredSpeed: 0.1,
    speedTolerance: 0.25,
    roamSpeed: 0.08,
    homeRange: 15,
    chaseSpeed: 0.8,
    runSpeed: 1.2,
    bottomOffset: 0.15,
    // Lähes vain yöllä aktiivinen, kesällä hidas.
    behavior: {
      night: 1.8,
      twilight: 0.9,
      day: 0.08,
      cloud: 0.2,
      wind: 0,
      windShore: 0,
      visual: false,
      ambush: false,
      competes: false,
      prey: false,
      dayDepth: [4, 99],
      dimDepth: [2, 99],
    },
  },
  ide: {
    id: 'ide',
    name: 'Säyne',
    native: false,
    abundance: 0.7,
    // Välivesi ja pinta, salmet ja syvänteen reunat.
    schoolSize: 8,
    schoolSpread: 8,
    habitat: { minDepth: 1.5, maxDepth: 5 },
    wanderShare: 0.35,
    structures: ['dropoff', 'reeds'],
    structureShare: 0.2,
    medianWeight: 0.7,
    weightSpread: 0.5,
    minWeight: 0.2,
    maxWeight: 4,
    trophyChance: 0.03,
    trophyWeight: 1.8,
    sizes: [0.8, 1.5, 2.5, 3.2],
    giants: { giant: 1, huge: 2 },
    // Hyppivä, sitkeä taistelija.
    pullPerKg: 2.4,
    pullBase: 0.4,
    endurancePerKg: 13,
    senseRadius: 8,
    // Tarttuu lippaan ja pieneen lusikkaan.
    lureInterest: 0.75,
    preferredSpeed: 0.5,
    speedTolerance: 0.4,
    roamSpeed: 0.35,
    homeRange: 45,
    chaseSpeed: 1.6,
    runSpeed: 2.2,
    bottomOffset: 1.5,
    // Iltaisin pinnassa hyönteisten perässä.
    behavior: {
      night: 0.4,
      twilight: 1.6,
      day: 0.8,
      cloud: 0.2,
      wind: 0.1,
      windShore: 0.2,
      visual: true,
      ambush: false,
      competes: false,
      prey: false,
      dayDepth: [2, 5],
      dimDepth: [0.5, 3],
      column: { day: 0.5, dark: 0.15 },
      jumps: 0.25,
    },
  },
  rainbow: {
    id: 'rainbow',
    name: 'Kirjolohi',
    native: false,
    abundance: 0.6,
    // Istutettu: partioi laajasti ja nopeasti avovedessä.
    schoolSize: 4,
    schoolSpread: 12,
    habitat: { minDepth: 2, maxDepth: 99 },
    wanderShare: 0.6,
    structures: [],
    structureShare: 0,
    medianWeight: 1.2,
    weightSpread: 0.45,
    minWeight: 0.4,
    maxWeight: 7,
    trophyChance: 0.03,
    trophyWeight: 3,
    sizes: [1.5, 2.5, 4, 5.5],
    giants: { giant: 1, huge: 2 },
    pullPerKg: 2.8,
    pullBase: 0.5,
    endurancePerKg: 14,
    senseRadius: 11,
    // Ahne: tarttuu hyvin lusikkaan ja lippaan.
    lureInterest: 1.25,
    preferredSpeed: 1.1,
    speedTolerance: 0.6,
    roamSpeed: 0.6,
    homeRange: 70,
    chaseSpeed: 2.6,
    runSpeed: 3,
    bottomOffset: 2,
    // Viihtyy viileässä: kirkkaalla syvemmällä, hämärässä pinnassa. Hyppii väsytyksessä.
    behavior: {
      night: 0.4,
      twilight: 1.3,
      day: 0.9,
      cloud: 0.3,
      wind: 0.2,
      windShore: 0.1,
      visual: true,
      ambush: false,
      competes: false,
      prey: false,
      dayDepth: [3, 99],
      dimDepth: [1, 99],
      column: { day: 0.55, dark: 0.2 },
      jumps: 0.6,
    },
  },
  carp: {
    id: 'carp',
    name: 'Karppi',
    native: false,
    abundance: 0.3,
    // Istutettu: lämmin, matala ja kasvillisuuden reunustama mutapohja.
    schoolSize: 4,
    schoolSpread: 6,
    habitat: { minDepth: 0.8, maxDepth: 3 },
    wanderShare: 0.1,
    structures: ['weed', 'reeds'],
    structureShare: 0.5,
    medianWeight: 3,
    weightSpread: 0.5,
    minWeight: 0.8,
    maxWeight: 18,
    trophyChance: 0.04,
    trophyWeight: 8,
    sizes: [4, 7, 10, 14],
    giants: { giant: 1, huge: 2 },
    // Erittäin voimakas, pitkät pakoretket: jarru pitää säätää.
    pullPerKg: 1.5,
    pullBase: 1,
    endurancePerKg: 10,
    senseRadius: 5,
    // Hyvin varovainen pohjasta ruokailija: tarttuu harvoin, lähinnä hitaasti
    // pohjaa pitkin uitettuun jigiin.
    lureInterest: 0.12,
    preferredSpeed: 0.12,
    speedTolerance: 0.15,
    roamSpeed: 0.15,
    homeRange: 30,
    chaseSpeed: 0.6,
    runSpeed: 2.2,
    bottomOffset: 0.2,
    // Aktiivisin hämärässä ja yöllä.
    behavior: {
      night: 1.3,
      twilight: 1.4,
      day: 0.6,
      cloud: 0.1,
      wind: 0,
      windShore: 0.2,
      visual: false,
      ambush: false,
      competes: false,
      prey: false,
      dayDepth: [1, 3],
      dimDepth: [0.6, 2],
      runs: 2,
    },
  },
};

export const SPECIES_IDS = Object.keys(SPECIES) as SpeciesId[];

/** Lunkinjärven oikeat lajit: oletuslajisto. */
export const NATIVE_SPECIES: SpeciesId[] = SPECIES_IDS.filter((id) => SPECIES[id].native);

export function isSpeciesId(v: unknown): v is SpeciesId {
  return typeof v === 'string' && Object.hasOwn(SPECIES, v);
}

export type FishMode = 'roam' | 'follow' | 'struck' | 'hooked' | 'gone';

export interface Fish {
  id: number;
  /**
   * Sukupolvi paikallaan kalakannassa: kasvaa, kun saatu kala korvautuu
   * uudella. Paikka ja sukupolvi yksilöivät kalan moninpelissä, jossa
   * jokaisella on oma kopio samasta kalakannasta.
   */
  gen: number;
  species: SpeciesId;
  weight: number;
  pos: Vec2;
  /** Parven kotipaikka: kala palaa sen lähelle vaeltaessaan. */
  home: Vec2;
  depth: number;
  heading: number;
  mode: FishMode;
  /** Seuraamisen tai iskun ajastin (s). */
  timer: number;
  /** Jäljellä oleva voima 0–1 väsytyksessä. */
  stamina: number;
  /** Väsytyksessä: pakeneeko kala (true) vai lepääkö. */
  running: boolean;
  /** Kuinka kauan siima on ollut löysällä (s). */
  slack: number;
  /** Kiinnostumisen viive: kala ei kiinnostu samasta vieheestä heti uudelleen. */
  cooldown: number;
  /** Parvi (indeksi kalakannan parviin) tai -1, jos kala elää yksin. */
  school: number;
  /** Kalan paikka parvessa suhteessa parven keskipisteeseen (m). */
  offset: Vec2;
  /** Väijyjän seuraava väijypaikka, kun se vaihtaa paikkaa. */
  goal: Vec2 | null;
}

/** Parvi ui yhtenä joukkona: kalat seuraavat yhteistä keskipistettä. */
export interface School {
  species: SpeciesId;
  /** Parven kotipaikka, jonka ympärillä se kiertelee (homeRange). */
  home: Vec2;
  center: Vec2;
  heading: number;
  /** Tiiviys: kalojen etäisyys keskipisteestä suhteessa alkuperäiseen. */
  spread: number;
  /** Ruokintainto 0–1: nousee, kun parven kala seuraa viehettä. */
  excitement: number;
  /** Pako hauen luota: jäljellä oleva aika (s). */
  flee: number;
}

export interface FishPopulation {
  fish: Fish[];
  nextId: number;
  /** Askellaskuri kaukaisten kalojen harvennettua päivitystä varten. */
  tick: number;
  /**
   * Kalakannan siemen: kalan paino ja uuden kalan kotipaikka lasketaan siitä,
   * paikasta ja sukupolvesta. Palvelin laskee samat arvot, joten asiakas ei
   * voi keksiä saaliin painoa. Puuttuu käsin kootuista kannoista (testit).
   */
  seed?: number;
  /** Ensimmäisen sukupolven kotipaikat paikoittain (parvien paikat). */
  homes?: Vec2[];
  /**
   * Taatut suurkalat (3) ja jättikalat (4) paikoittain (#231); muilla 0.
   * Paikan kala on samaa kokoluokkaa myös seuraavissa sukupolvissa.
   */
  sizes?: SizeClass[];
  /** Parvet ja ensimmäisen sukupolven parvi paikoittain (-1 = yksin). */
  schools?: School[];
  schoolOf?: number[];
  /** Järven keskipiste ja puolikas koko (m) tuulen puoleisen rannan laskuun. */
  area?: { center: Vec2; half: Vec2 };
}

/** Kalojen määrä järvessä (sama asiakkaalla ja palvelimella). Saatujen tilalle syntyy uusia. */
export const FISH_COUNT = 1800;

/** Siemen paikalle ja sukupolvelle. */
const fishSeed = (seed: number, slot: number, gen: number, salt: number) =>
  (Math.imul(seed ^ salt, 0x85ebca6b) ^
    Math.imul(slot + 1, 0xc2b2ae35) ^
    Math.imul(gen + 1, 0x27d4eb2f)) |
  0;

/**
 * Kalan paino paikasta ja sukupolvesta: sama kaikilla koneilla ja
 * palvelimella. Taattu suurkala tai jättikala (`size` 3 tai 4) saa painon
 * luokkansa rajoista.
 */
export function fishWeight(
  seed: number,
  species: SpeciesId,
  slot: number,
  gen: number,
  size: SizeClass = 0,
): number {
  const sp = SPECIES[species];
  const rng = new Rng(fishSeed(seed, slot, gen, 0x3c6ef372));
  if (size < 3) return randomWeight(sp, rng);
  const lo = sp.sizes[size - 1]!;
  const hi = size === 4 ? sp.maxWeight : sp.sizes[3];
  const w = lo + (hi - lo) * rng.next() ** 1.5;
  return Math.min(Math.round(w * 1000) / 1000, size === 4 ? hi : hi - 0.001);
}

/** Kalakannan kalan paino paikasta ja sukupolvesta (taatut suurkalat mukana). */
export function stockWeight(pop: FishPopulation, slot: number, gen: number): number {
  return fishWeight(pop.seed!, pop.fish[slot]!.species, slot, gen, pop.sizes?.[slot] ?? 0);
}

/**
 * Kokoluokka lajin rajoista: 0 pieni, 1 iso, 2 tosi iso, 3 suurkala,
 * 4 jättikala. Luotaimen kaiku ja ison kalan varovaisuus riippuvat siitä.
 */
export type SizeClass = 0 | 1 | 2 | 3 | 4;

export function sizeClass(species: SpeciesId, weight: number): SizeClass {
  const limits = SPECIES[species].sizes;
  let c = 0;
  while (c < 4 && weight >= limits[c]!) c++;
  return c as SizeClass;
}

/**
 * Iskuherkkyys kokoluokittain: iso kala on vanha ja kokenut, seuraa
 * viehettä mutta iskee harvoin (#231).
 */
export const WARINESS: readonly number[] = [1, 0.9, 0.7, 0.4, 0.25];

/**
 * Iskuherkkyyden kerroin kokoluokalle ja lajin aktiivisuudelle: hämärässä,
 * tuulella ja ukkosen edellä suurkalat innostuvat selvemmin kuin pienet.
 */
export function wariness(size: SizeClass, activity: number): number {
  const w = WARINESS[size]!;
  return size >= 3 ? Math.min(1, w * Math.max(1, activity) ** 1.5) : w;
}

/** Vedon jälkeinen tauko (s), jonka aikana hauki ja suurkala iskevät herkimmin. */
const PAUSE_WINDOW = { from: 0.2, to: 4 } as const;

/**
 * Kalan kotipaikka: ensimmäinen sukupolvi parvessaan, myöhemmät saman lajin
 * toisen paikan parven luona (valinta siemenestä). Null, jos paikkaa ei ole.
 */
export function fishHome(pop: FishPopulation, slot: number, gen: number): Vec2 | null {
  const host = fishHomeSlot(pop, slot, gen);
  return host === null ? null : pop.homes![host]!;
}

/** Paikka, jonka kotipaikan (ja parven) kala saa; null, jos paikkaa ei ole. */
function fishHomeSlot(pop: FishPopulation, slot: number, gen: number): number | null {
  const homes = pop.homes;
  const species = pop.fish[slot]?.species;
  if (!homes || pop.seed === undefined || !species || !homes[slot]) return null;
  if (gen === 0) return slot;
  const same: number[] = [];
  pop.fish.forEach((f, i) => {
    if (i !== slot && f.species === species && homes[i]) same.push(i);
  });
  if (same.length === 0) return slot;
  const pick = new Rng(fishSeed(pop.seed, slot, gen, 0x5bd1e995)).next();
  return same[Math.floor(pick * same.length)]!;
}

/** Kauempana kuin tämä vieheestä olevat kalat päivitetään harvemmin. */
const FAR_DISTANCE = 60;
/** Kaukaiset kalat päivitetään joka N:nnellä askeleella (N-kertaisella dt:llä). */
const FAR_STRIDE = 20;

export interface FishWorld {
  isWater(p: Vec2): boolean;
  depthAt(p: Vec2): number;
  /** Pohjan rakenteet (kivikot, puut, jyrkänteet), joille kalat hakeutuvat. */
  structures?: readonly Structure[];
}

/** Vieheen tiedot kaloille. */
export interface LureInfo {
  pos: Vec2;
  depth: number;
  speed: number;
  /** Onko viehe vedessä ja vapaana (ei kalaa kiinni). */
  fishable: boolean;
  /** Vavan kärki: kala kääntyy pois, jos viehe tulee liian lähelle kalastajaa. */
  tip: Vec2;
  /** Kalastajan varusteet (viehe, siima, peruke). */
  tackle?: Tackle;
  /** Viehe on kerännyt rikkaa uposkasvustosta (#226). */
  fouled?: boolean;
  /** Viehe on tarttunut pohjaan: suurkala säikähtää. */
  snagged?: boolean;
  /** Kuinka kauan viehe on ollut paikallaan (s): perhon tauko houkuttaa haukea. */
  pause?: number;
}

export interface FishEvents {
  /** Kala seuraa viehettä (tuntuma). */
  follow?: number;
  /** Kala iski vieheeseen. */
  strike?: number;
  /** Suurkala seurasi viehettä kalastajan lähelle ja kääntyi pois ("iso varjo"). */
  shadow?: number;
}

export function randomWeight(sp: Species, rng: Rng): number {
  const median = rng.next() < sp.trophyChance ? sp.trophyWeight : sp.medianWeight;
  const w = median * Math.exp(rng.normal(0, sp.weightSpread));
  return Math.round(Math.max(sp.minWeight, Math.min(sp.maxWeight, w)) * 1000) / 1000;
}

/**
 * Sijoittaa kalat parviin järven vesialueelle. Kalamäärä jaetaan valittujen
 * lajien kesken runsauden mukaan, ja parvien keskipisteet painottuvat lajin
 * mieluisaan syvyyteen.
 */
export function createFishPopulation(
  world: FishWorld,
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  rng: Rng,
  count: number,
  species: readonly SpeciesId[] = NATIVE_SPECIES,
): FishPopulation {
  const pop: FishPopulation = {
    fish: [],
    nextId: 1,
    tick: 0,
    seed: (rng.next() * 2 ** 32) >>> 0,
    homes: [],
    schools: [],
    schoolOf: [],
    area: {
      center: { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 },
      half: { x: (bounds.maxX - bounds.minX) / 2, y: (bounds.maxY - bounds.minY) / 2 },
    },
  };
  const list = species.filter(isSpeciesId);
  const ids = list.length > 0 ? [...new Set(list)] : NATIVE_SPECIES;
  const total = ids.reduce((sum, id) => sum + SPECIES[id].abundance, 0);
  for (const id of ids) {
    const sp = SPECIES[id];
    const target = pop.fish.length + Math.round((count * sp.abundance) / total);
    while (pop.fish.length < target) {
      const center = randomWaterPoint(world, bounds, sp, rng);
      // Yksin elävät (hauki) eivät muodosta parvea. Parvi ei kuluta arpoja,
      // joten kalakanta on sama kuin palvelimella.
      const school = sp.schoolSize > 1 ? pop.schools!.length : -1;
      if (school >= 0) {
        pop.schools!.push({
          species: id,
          home: { ...center },
          center: { ...center },
          heading: Math.atan2(center.y, center.x),
          spread: 1,
          excitement: 0,
          flee: 0,
        });
      }
      let placed = 0;
      for (let i = 0; i < sp.schoolSize * 3 && placed < sp.schoolSize; i++) {
        if (pop.fish.length >= target) break;
        const p = {
          x: center.x + rng.normal(0, sp.schoolSpread),
          y: center.y + rng.normal(0, sp.schoolSpread),
        };
        if (!world.isWater(p)) continue;
        pop.homes!.push(p);
        pop.schoolOf!.push(school);
        pop.fish.push(spawnFish(pop, id, p, world, rng, pop.fish.length));
        placed++;
      }
    }
  }
  assignGiants(pop, ids);
  return pop;
}

/**
 * Taatut suurkalat ja jättikalat lajeittain (#231). Paikat valitaan kannan
 * siemenestä omalla arpojallaan, joten kalakannan muut arvat eivät muutu.
 */
function assignGiants(pop: FishPopulation, ids: readonly SpeciesId[]): void {
  const pick = new Rng(fishSeed(pop.seed!, 0, 0, 0x7f4a7c15));
  pop.sizes = pop.fish.map(() => 0);
  for (const id of ids) {
    const free: number[] = [];
    pop.fish.forEach((f, i) => f.species === id && free.push(i));
    const { giant, huge } = SPECIES[id].giants;
    const want: SizeClass[] = [
      ...Array<SizeClass>(giant).fill(4),
      ...Array<SizeClass>(huge).fill(3),
    ];
    for (const size of want) {
      if (free.length === 0) break;
      const slot = free.splice(Math.floor(pick.next() * free.length), 1)[0]!;
      pop.sizes[slot] = size;
      pop.fish[slot]!.weight = stockWeight(pop, slot, 0);
    }
  }
}

export function spawnFish(
  pop: FishPopulation,
  species: SpeciesId,
  pos: Vec2,
  world: FishWorld,
  rng: Rng,
  /** Paikka kalakannassa: paino lasketaan kannan siemenestä, jos se on. */
  slot?: number,
  gen = 0,
): Fish {
  const sp = SPECIES[species];
  // Uusi kala liittyy sen parveen, jonka kotipaikan se sai.
  const host = slot === undefined ? null : gen === 0 ? slot : fishHomeSlot(pop, slot, gen);
  const school = host === null ? -1 : (pop.schoolOf?.[host] ?? -1);
  const schoolHome = pop.schools?.[school]?.home;
  const offset = schoolHome ? { x: pos.x - schoolHome.x, y: pos.y - schoolHome.y } : { x: 0, y: 0 };
  return {
    id: pop.nextId++,
    gen,
    species,
    weight:
      pop.seed !== undefined && slot !== undefined
        ? fishWeight(pop.seed, species, slot, gen, pop.sizes?.[slot] ?? 0)
        : randomWeight(sp, rng),
    pos,
    home: { ...pos },
    depth: Math.max(0.3, world.depthAt(pos) - sp.bottomOffset),
    heading: rng.range(-Math.PI, Math.PI),
    mode: 'roam',
    timer: 0,
    stamina: 1,
    running: false,
    slack: 0,
    cooldown: 0,
    school: schoolHome ? school : -1,
    offset,
    goal: null,
  };
}

/**
 * Rakenteen paino parven paikkaa arvottaessa: siroteltuja kasvustoja ja
 * risukoita on paljon, joten yksittäinen niistä painaa vähemmän kuin käsin
 * merkitty kivikko tai kaislikko.
 */
const SPOT_WEIGHT: Partial<Record<Structure['kind'], number>> = {
  boulder: 0.05,
  weed: 0.25,
  brush: 0.5,
};

/** Rikkaisen vieheen houkuttelevuus tavalliseen verrattuna (#226). */
export const FOULED_APPEAL = 0.05;

/** Kaislikon reunalle asettuvien kalojen hajonta (m). */
const REED_EDGE_SPREAD = 4;

/** Painotettu valinta yhdellä satunnaisluvulla (kalakannan arvontajärjestys pysyy). */
function pickSpot(spots: readonly Structure[], u: number): Structure {
  const weight = (st: Structure) => SPOT_WEIGHT[st.kind] ?? 1;
  let left = u * spots.reduce((sum, st) => sum + weight(st), 0);
  for (const st of spots) {
    left -= weight(st);
    if (left < 0) return st;
  }
  return spots[spots.length - 1]!;
}

function randomWaterPoint(
  world: FishWorld,
  b: { minX: number; minY: number; maxX: number; maxY: number },
  sp: Species,
  rng: Rng,
): Vec2 {
  // Osa parvista asettuu lajille mieluisan rakenteen luo.
  const spots = (world.structures ?? []).filter((s) => sp.structures.includes(s.kind));
  if (spots.length > 0 && rng.next() < sp.structureShare) {
    const s = pickSpot(spots, rng.next());
    for (let i = 0; i < 20; i++) {
      // Kaislikossa kalat vaanivat reunalla, muualla rakenteen ympärillä.
      const c = s.ring ? s.ring[Math.floor(rng.next() * s.ring.length)]! : s.pos;
      const spread = s.ring ? REED_EDGE_SPREAD : s.radius / 2;
      const p = {
        x: c.x + rng.normal(0, spread),
        y: c.y + rng.normal(0, spread),
      };
      if (world.isWater(p)) return p;
    }
  }
  let fallback: Vec2 | null = null;
  // Osa parvista partioi missä syvyydessä tahansa.
  const anyDepth = rng.next() < sp.wanderShare;
  for (let i = 0; i < 1000; i++) {
    const p = { x: rng.range(b.minX, b.maxX), y: rng.range(b.minY, b.maxY) };
    if (!world.isWater(p)) continue;
    const depth = world.depthAt(p);
    if (anyDepth || (depth >= sp.habitat.minDepth && depth <= sp.habitat.maxDepth)) return p;
    fallback ??= p;
  }
  if (fallback) return fallback;
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
}

/**
 * Kuinka houkutteleva viehe on kalalle: nopeus lähellä mieluisaa, syvyys
 * lähellä kalan syvyyttä, kertoimena vieheen ja siiman sopivuus lajille.
 */
export function lureAppeal(fish: Fish, lure: LureInfo): number {
  const sp = SPECIES[fish.species];
  const dv = Math.abs(lure.speed - sp.preferredSpeed) / sp.speedTolerance;
  // Pysähtynytkin viehe kiinnostaa vähän (vajoava viehe; jigi eniten).
  const bait = lure.tackle ? baitOf(lure.tackle) : null;
  const big = !!bait && sizeClass(fish.species, fish.weight) >= 3;
  // Hauki ja suurkala iskevät usein juuri vedon jälkeisellä tauolla (perho).
  const pause =
    bait &&
    (fish.species === 'pike' || big) &&
    lure.pause !== undefined &&
    lure.pause >= PAUSE_WINDOW.from &&
    lure.pause <= PAUSE_WINDOW.to;
  const still = bait ? (pause ? bait.pauseAppeal : bait.stillAppeal) : 0.25;
  const speedScore = Math.max(lure.speed < 0.05 ? still : 0, 1 - dv * dv * 0.5);
  const dd = Math.abs(lure.depth - fish.depth);
  const depthScore = Math.max(0, 1 - dd / 2.5);
  const gear = lure.tackle ? tackleAppeal(lure.tackle, fish.species) : 1;
  const clean = lure.fouled ? FOULED_APPEAL : 1;
  const taste = big && bait ? bait.bigFish : 1;
  return speedScore * depthScore * gear * clean * taste;
}

/** Valo, sää ja tuuli, jotka ohjaavat kalojen syöntiä ja liikkeitä. */
export interface FishConditions {
  /** Valon määrä 0 (yö) – 1 (kirkas päivä), pilvisyys mukana. */
  light: number;
  /** Aamu- tai iltahämärä 0–1: petokalojen paras syöntiaika. */
  twilight: number;
  /** Pilvisyys 0–1. */
  cloud: number;
  /** Tuuli (m/s, x itään, y pohjoiseen). */
  wind: Vec2;
  /** Ukkonen tai myrsky: kalat painuvat pohjaan eivätkä juuri syö. */
  storm: boolean;
  /** Ukkosrintama lähestyy: syönti kiihtyy ennen ilmanpaineen laskua. */
  preStorm: boolean;
}

/** Tyyni, valoisa päivä: kalat käyttäytyvät tavallisesti. */
export const DAYTIME: FishConditions = {
  light: 1,
  twilight: 0,
  cloud: 0,
  wind: { x: 0, y: 0 },
  storm: false,
  preStorm: false,
};

/** Rintaman lähestyminen tuntuu kaloissa näin kauan ennen ukkosta (s). */
const PRE_STORM = 240;

/**
 * Kalojen olosuhteet säästä ja vuorokaudenajasta (`sun`: valo ja hämäryys
 * 0–1; oletuksena päivä).
 */
export function fishConditions(
  weather: WeatherNow | null,
  sun: { light: number; twilight: number } = DAYTIME,
): FishConditions {
  if (!weather) return { ...DAYTIME, light: sun.light, twilight: sun.twilight };
  const stormy = (sky: WeatherNow['sky'] | null) => sky === 'thunder' || sky === 'storm';
  return {
    light: sun.light * (1 - 0.6 * weather.darkness),
    twilight: sun.twilight,
    cloud: Math.min(1, weather.darkness * 1.6),
    wind: {
      x: Math.cos(weather.windDir) * weather.windSpeed,
      y: Math.sin(weather.windDir) * weather.windSpeed,
    },
    storm: stormy(weather.sky),
    preStorm: !stormy(weather.sky) && stormy(weather.next) && weather.untilChange < PRE_STORM,
  };
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
/** Tuulen voimakkuus 0–1 (8 m/s = täysi). */
const windStrength = (c: FishConditions) => Math.min(1, Math.hypot(c.wind.x, c.wind.y) / 8);

/** Lajin syöntiaktiivisuus olosuhteissa (1 = tavallinen päivä). */
export function speciesActivity(id: SpeciesId, c: FishConditions): number {
  const b = SPECIES[id].behavior;
  let a = b.night + (b.day - b.night) * clamp01(c.light);
  a += (b.twilight - a) * clamp01(c.twilight);
  a *= 1 + b.cloud * clamp01(c.cloud);
  a *= 1 + b.wind * windStrength(c);
  if (c.storm) a *= 0.4;
  else if (c.preStorm) a *= 1.4;
  return Math.max(0.05, Math.min(2.5, a));
}

/** Tuulen puoleinen ranta (aallot tuovat ruokaa): kerroin aktiivisuudelle. */
function shoreFactor(pop: FishPopulation, pos: Vec2, sp: Species, c: FishConditions): number {
  const w = Math.hypot(c.wind.x, c.wind.y);
  if (!pop.area || sp.behavior.windShore === 0 || w < 1) return 1;
  const ux = c.wind.x / w;
  const uy = c.wind.y / w;
  const { center, half } = pop.area;
  const reach = Math.abs(ux) * half.x + Math.abs(uy) * half.y;
  const side = ((pos.x - center.x) * ux + (pos.y - center.y) * uy) / reach;
  return 1 + sp.behavior.windShore * Math.max(-1, Math.min(1, side)) * windStrength(c);
}

/** Havaintoetäisyys: näön varassa saalistava näkee pimeällä huonommin. */
function senseRadius(sp: Species, c: FishConditions): number {
  return sp.senseRadius * (sp.behavior.visual ? 0.45 + 0.55 * clamp01(c.light) : 1);
}

/** Uintisyvyys pohjan syvyydestä: laji, valo ja myrsky. */
function swimDepth(sp: Species, bottom: number, c: FishConditions): number {
  const col = sp.behavior.column;
  let d = bottom - sp.bottomOffset;
  if (c.storm) d = bottom - 0.3;
  else if (col) {
    const dark = 1 - clamp01(c.light);
    d = Math.min(bottom - 0.2, bottom * (col.day + (col.dark - col.day) * dark));
  }
  return Math.max(0.3, d);
}

/** Vapaana olevien kalojen tekoäly yhdelle askeleelle. */
export function stepFishPopulation(
  pop: FishPopulation,
  lure: LureInfo | null,
  world: FishWorld,
  diff: DifficultyParams,
  rng: Rng,
  dt: number,
  cond: FishConditions = DAYTIME,
): FishEvents {
  const events: FishEvents = {};
  pop.tick++;
  const act = {} as Record<SpeciesId, number>;
  for (const id of SPECIES_IDS) act[id] = speciesActivity(id, cond);
  stepSchools(pop, lure, world, cond, act, rng, dt);
  for (const f of pop.fish) {
    if (f.mode === 'hooked' || f.mode === 'gone') continue;
    const sp = SPECIES[f.species];
    const near = lure?.fishable ? distance(f.pos, lure.pos) : Infinity;
    const school = f.school >= 0 ? pop.schools?.[f.school] : undefined;

    if (f.mode === 'roam' && near > FAR_DISTANCE) {
      // Kaukana vieheestä riittää harva päivitys.
      if ((f.id + pop.tick) % FAR_STRIDE !== 0) continue;
      f.cooldown = Math.max(0, f.cooldown - dt * FAR_STRIDE);
      move(f, school, world, cond, act[f.species], rng, dt * FAR_STRIDE);
      continue;
    }
    f.cooldown = Math.max(0, f.cooldown - dt);
    // Kilpaileva parvi: kun yksi seuraa viehettä, muutkin kiinnostuvat herkemmin.
    const excite = sp.behavior.competes && school ? school.excitement : 0;
    const sense = senseRadius(sp, cond) * (1 + 0.5 * excite);

    if (f.mode === 'roam') {
      move(f, school, world, cond, act[f.species], rng, dt);
      if (lure && near < sense && f.cooldown === 0) {
        const a = act[f.species] * shoreFactor(pop, f.pos, sp, cond) * (1 + 1.5 * excite);
        const appeal = lureAppeal(f, lure);
        if (rng.chance(0.6 * appeal * sp.lureInterest * diff.biteRate * a, dt)) {
          f.mode = 'follow';
          f.timer = 0;
          f.goal = null;
          events.follow = f.id;
          if (sp.behavior.competes && school) school.excitement = 1;
        }
      }
      continue;
    }

    if (!lure || !lure.fishable || near > sense * 1.5) {
      loseInterest(f, rng);
      continue;
    }

    if (f.mode === 'follow') {
      const size = sizeClass(f.species, f.weight);
      // Suurkala säikähtää pohjaan tarttunutta viehettä ja kalastajan läheisyyttä.
      if (size >= 3 && (lure.snagged || distance(lure.pos, lure.tip) < BIG_FISH_SHY)) {
        if (!lure.snagged) events.shadow = f.id;
        spook(f, world, rng);
        continue;
      }
      f.timer += dt;
      // Uidaan vieheen perään ja syvyyteen.
      swimToward(f, lure.pos, sp.chaseSpeed, 0.6, dt);
      f.depth += (lure.depth - f.depth) * Math.min(1, dt * 1.5);
      const appeal = lureAppeal(f, lure);
      const ambush = sp.behavior.ambush;
      // Taimen seuraa pitkään ja iskee vasta harkittuaan.
      const follows = sp.behavior.follows ?? 1;
      // Viehe liian lähellä kalastajaa: kala kääntyy pois. Väijyjä ei lähde
      // kauas paikaltaan ja ratkaisee nopeasti, iskeekö.
      if (
        distance(lure.pos, lure.tip) < 3.5 ||
        f.timer > (ambush ? 4 : 8 * follows) ||
        (ambush && distance(f.pos, f.home) > sp.homeRange + sp.senseRadius)
      ) {
        loseInterest(f, rng);
        continue;
      }
      const a =
        (Math.sqrt(act[f.species]) *
          (ambush ? 1.6 : 1) *
          (1 + excite) *
          wariness(size, act[f.species])) /
        follows;
      if (
        near < 1.2 &&
        rng.chance((0.35 + appeal * 0.9) * sp.lureInterest * diff.biteRate * a, dt)
      ) {
        f.mode = 'struck';
        f.timer = 0;
        events.strike = f.id;
      }
    } else if (f.mode === 'struck') {
      // Isku: kala pitää viehettä suussaan hetken. Kalastajan tilakone päättää tarttumisen.
      f.timer += dt;
      f.pos = { ...lure.pos };
      f.depth = lure.depth;
    }
  }
  return events;
}

/** Saaliskalaparvi huomaa hauen näin kaukaa (m). */
const PREDATOR_RADIUS = 10;

/**
 * Parvien liike: keskipiste kiertelee kotipaikan ympärillä ja hakeutuu
 * valon mukaiseen syvyyteen, särkiparvi pakenee haukea ja kulkee tuulen
 * alle, innostunut ahvenparvi kääntyy vieheen perään.
 */
function stepSchools(
  pop: FishPopulation,
  lure: LureInfo | null,
  world: FishWorld,
  cond: FishConditions,
  act: Record<SpeciesId, number>,
  rng: Rng,
  dt: number,
) {
  if (!pop.schools) return;
  let pikes: Fish[] | null = null;
  const dim = cond.light < 0.7 || cond.twilight > 0.5;
  for (const s of pop.schools) {
    const sp = SPECIES[s.species];
    const b = sp.behavior;
    s.excitement = Math.max(0, s.excitement - dt / 20);
    // Pimeällä parvi hajoaa, pakeneva parvi tiivistyy palloksi.
    const spread =
      s.flee > 0 ? 0.45 : s.excitement > 0.2 ? 0.8 : 1 + (1 - clamp01(cond.light)) * 0.6;
    s.spread += (spread - s.spread) * Math.min(1, dt * 0.5);

    if (b.prey && s.flee <= 0 && rng.next() < dt * 2) {
      pikes ??= pop.fish.filter((f) => SPECIES[f.species].behavior.ambush && f.mode !== 'gone');
      const reach = PREDATOR_RADIUS + sp.schoolSpread * s.spread;
      for (const p of pikes) {
        if (Math.abs(p.pos.x - s.center.x) > reach || Math.abs(p.pos.y - s.center.y) > reach)
          continue;
        if (distance(p.pos, s.center) < reach && rng.next() < 0.5 * act[p.species]) {
          s.flee = rng.range(3, 6);
          s.heading = Math.atan2(s.center.y - p.pos.y, s.center.x - p.pos.x);
          break;
        }
      }
    }

    let speed: number;
    if (s.flee > 0) {
      s.flee -= dt;
      speed = sp.runSpeed * 0.6;
    } else {
      s.heading += rng.normal(0, 0.35) * Math.sqrt(dt);
      if (rng.next() < dt * 0.25) steerSchool(s, sp, lure, world, cond, dim);
      speed = sp.roamSpeed * (0.3 + 0.7 * Math.min(1.5, act[s.species]));
    }
    // Parvi pysyy kotipaikkansa lähellä (palvelin tarkistaa saaliin paikan siitä).
    if (distance(s.center, s.home) > sp.homeRange) {
      const back = Math.atan2(s.home.y - s.center.y, s.home.x - s.center.x);
      s.heading += wrapAngle(back - s.heading) * Math.min(1, dt * 2);
    }
    const next = {
      x: s.center.x + Math.cos(s.heading) * speed * dt,
      y: s.center.y + Math.sin(s.heading) * speed * dt,
    };
    if (world.isWater(next)) s.center = next;
    else s.heading += Math.PI * (0.5 + rng.next());
  }
}

/** Parven suunnan valinta: mieluisa syvyys, tuuli ja innostus vieheestä. */
function steerSchool(
  s: School,
  sp: Species,
  lure: LureInfo | null,
  world: FishWorld,
  cond: FishConditions,
  dim: boolean,
) {
  const b = sp.behavior;
  const [lo, hi] = dim ? b.dimDepth : b.dayDepth;
  let best = s.heading;
  let bestScore = Infinity;
  for (const turn of [0, -0.8, 0.8]) {
    const h = s.heading + turn;
    const p = { x: s.center.x + Math.cos(h) * 8, y: s.center.y + Math.sin(h) * 8 };
    if (!world.isWater(p)) continue;
    const d = world.depthAt(p);
    const score = Math.max(0, lo - d, d - hi) + Math.abs(turn) * 0.1;
    if (score < bestScore) {
      bestScore = score;
      best = h;
    }
  }
  s.heading = best;
  // Saaliskalat kulkevat aaltojen ja planktonin mukana tuulen alle.
  const w = windStrength(cond);
  if (b.prey && w > 0.25) {
    s.heading += wrapAngle(Math.atan2(cond.wind.y, cond.wind.x) - s.heading) * 0.3 * w;
  }
  if (lure?.fishable && s.excitement > 0.2 && distance(lure.pos, s.center) < 30) {
    s.heading = Math.atan2(lure.pos.y - s.center.y, lure.pos.x - s.center.x);
  }
}

/** Suurkala kääntyy pois näin kaukana (m) kalastajasta: iso varjo vieheen perässä. */
const BIG_FISH_SHY = 6;

/** Säikähtänyt suurkala painuu syvemmälle eikä kiinnostu vieheestä vähään aikaan. */
function spook(f: Fish, world: FishWorld, rng: Rng) {
  loseInterest(f, rng);
  f.cooldown = rng.range(30, 60);
  f.depth = Math.min(Math.max(0.3, world.depthAt(f.pos) - 0.2), f.depth + 1.5);
}

function loseInterest(f: Fish, rng: Rng) {
  f.mode = 'roam';
  f.timer = 0;
  f.cooldown = rng.range(6, 15);
  // Väijyjä palaa paikalleen.
  if (SPECIES[f.species].behavior.ambush) f.goal = { ...f.home };
}

/** Vapaan kalan liike: parven mukana, väijyen tai yksin vaellellen. */
function move(
  f: Fish,
  school: School | undefined,
  world: FishWorld,
  cond: FishConditions,
  activity: number,
  rng: Rng,
  dt: number,
) {
  const sp = SPECIES[f.species];
  if (school) followSchool(f, school, sp, world, activity, dt);
  else if (sp.behavior.ambush) lurk(f, sp, world, activity, rng, dt);
  else roam(f, world, activity, rng, dt);
  // Syvyys hakeutuu lajin ja valon mukaiseen kerrokseen harvakseltaan (kallis kysely).
  if (rng.next() < dt * 0.5) {
    const target = swimDepth(sp, world.depthAt(f.pos), cond);
    f.depth += (target - f.depth) * 0.5;
  }
}

/** Parven kala pysyy paikallaan parvessa ja kääntyy parven suuntaan. */
function followSchool(
  f: Fish,
  s: School,
  sp: Species,
  world: FishWorld,
  activity: number,
  dt: number,
) {
  const target = {
    x: s.center.x + f.offset.x * s.spread,
    y: s.center.y + f.offset.y * s.spread,
  };
  const dx = target.x - f.pos.x;
  const dy = target.y - f.pos.y;
  const d = Math.hypot(dx, dy);
  if (d < 0.3) {
    f.heading = s.heading;
    return;
  }
  const pace = s.flee > 0 ? sp.runSpeed : sp.roamSpeed * (1 + Math.min(1.5, activity)) + 0.15;
  const step = Math.min(d, pace * dt);
  const next = { x: f.pos.x + (dx / d) * step, y: f.pos.y + (dy / d) * step };
  f.heading = Math.atan2(dy, dx);
  if (world.isWater(next)) f.pos = next;
}

/** Väijyjä seisoo paikallaan ja vaihtaa väijypaikkaa harvoin. */
function lurk(f: Fish, sp: Species, world: FishWorld, activity: number, rng: Rng, dt: number) {
  if (f.goal) {
    const before = f.pos;
    swimToward(f, f.goal, sp.roamSpeed * 5, 0.3, dt);
    if (!world.isWater(f.pos)) {
      f.pos = before;
      f.goal = null;
    } else if (distance(f.pos, f.goal) < 0.5) f.goal = null;
    return;
  }
  // Aktiivinen hauki (hämärä, pilvi) vaihtaa paikkaa useammin.
  if (rng.chance(activity / 400, dt)) {
    const a = rng.range(-Math.PI, Math.PI);
    const r = rng.range(0, sp.homeRange);
    const p = { x: f.home.x + Math.cos(a) * r, y: f.home.y + Math.sin(a) * r };
    if (world.isWater(p)) f.goal = p;
  }
}

function roam(f: Fish, world: FishWorld, activity: number, rng: Rng, dt: number) {
  const sp = SPECIES[f.species];
  f.heading += rng.normal(0, 0.6) * Math.sqrt(dt);
  if (distance(f.pos, f.home) > sp.homeRange) {
    const back = Math.atan2(f.home.y - f.pos.y, f.home.x - f.pos.x);
    f.heading += wrapAngle(back - f.heading) * Math.min(1, dt);
  }
  const speed = sp.roamSpeed * (0.3 + 0.7 * Math.min(1.5, activity));
  const next = {
    x: f.pos.x + Math.cos(f.heading) * speed * dt,
    y: f.pos.y + Math.sin(f.heading) * speed * dt,
  };
  if (world.isWater(next)) f.pos = next;
  else f.heading += Math.PI * (0.5 + rng.next());
}

function swimToward(f: Fish, target: Vec2, maxSpeed: number, keep: number, dt: number) {
  const dx = target.x - f.pos.x;
  const dy = target.y - f.pos.y;
  const d = Math.hypot(dx, dy);
  if (d <= keep) return;
  const step = Math.min(d - keep, maxSpeed * dt);
  f.pos = { x: f.pos.x + (dx / d) * step, y: f.pos.y + (dy / d) * step };
  f.heading = Math.atan2(dy, dx);
}

/** Kalan vetovoima väsytyksessä (kg) ennen siiman rajoitusta. */
export function fishPull(f: Fish, diff: DifficultyParams): number {
  const sp = SPECIES[f.species];
  const max = (f.weight * sp.pullPerKg + sp.pullBase) * diff.fishStrength;
  const stamina = 0.15 + 0.85 * f.stamina;
  return max * stamina * (f.running ? 1 : 0.35);
}

export interface FightResult {
  /** Jännitys (kg) ennen jarrun rajoitusta. */
  pull: number;
  /** Kalan uintinopeus poispäin vavan kärjestä (m/s). */
  outSpeed: number;
}

/**
 * Väsytyksen kalan puoli: kala vuorottelee pakoja ja lepoa, väsyy vedon
 * mukaan ja hakeutuu pohjaan niin kauan kuin jaksaa. Palauttaa vedon.
 */
export function stepHookedFish(
  f: Fish,
  tip: Vec2,
  tension: number,
  world: FishWorld,
  diff: DifficultyParams,
  rng: Rng,
  dt: number,
  /** Vavan voima: järeä vapa väsyttää kalaa nopeammin. */
  power = 1,
): FightResult {
  const sp = SPECIES[f.species];
  // Vuorottelu: väsynyt kala pakenee harvemmin ja lyhyemmin.
  f.timer -= dt;
  if (f.timer <= 0) {
    f.running = !f.running && rng.next() < 0.3 + 0.7 * f.stamina;
    f.timer = f.running
      ? rng.range(0.8, 2.5) * (0.4 + f.stamina) * (sp.behavior.runs ?? 1)
      : rng.range(0.6, 1.8);
    if (f.running) {
      // Pakosuunta: pääosin poispäin kalastajasta, välillä sivulle.
      const away = Math.atan2(f.pos.y - tip.y, f.pos.x - tip.x);
      f.heading = away + rng.normal(0, 0.9);
    }
  }
  const pull = fishPull(f, diff);
  // Väsyminen: vetäminen kireää siimaa vastaan kuluttaa voimia.
  const effort = Math.min(pull, Math.max(tension, pull * 0.2));
  f.stamina = Math.max(
    0,
    f.stamina - (effort * power * dt * diff.staminaDrain) / (sp.endurancePerKg * f.weight + 1),
  );
  if (!f.running) f.stamina = Math.min(1, f.stamina + dt * 0.01);

  // Syvyys: jaksava kala sukeltaa pohjaan, väsynyt nousee.
  const bottom = world.depthAt(f.pos);
  const targetDepth = f.stamina > 0.25 ? bottom - 0.3 : bottom * f.stamina;
  f.depth += (Math.max(0, targetDepth) - f.depth) * Math.min(1, dt * 0.8);

  const speed = f.running ? sp.runSpeed * (0.3 + 0.7 * f.stamina) : 0.2;
  const away = Math.atan2(f.pos.y - tip.y, f.pos.x - tip.x);
  return { pull, outSpeed: speed * Math.cos(f.heading - away) };
}

/** Paino suomalaisittain: alle kilon grammoina, muuten kiloina. */
export function formatWeight(kg: number): string {
  return kg < 1 ? `${Math.round(kg * 1000)} g` : `${kg.toFixed(2).replace('.', ',')} kg`;
}
