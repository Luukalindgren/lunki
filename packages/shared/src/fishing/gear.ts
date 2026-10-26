import type { SpeciesId } from './fish';

/** Vieheet: uppoaminen, uinti, heitettävyys ja houkuttelevuus lajeittain. */
export type LureId = 'spoon' | 'wobbler' | 'jig' | 'spinner';

export interface Lure {
  id: LureId;
  name: string;
  /** Uppoamisnopeus löysällä siimalla (m/s); negatiivinen = kelluu pintaan. */
  sinkRate: number;
  /** Nousu (m/s) vieheen vauhtia (m/s) kohden; negatiivinen = sukeltaa (vaapun lippa). */
  lift: number;
  /** Syvin uintisyvyys kelattaessa (m). */
  maxDepth: number;
  /** Heittomatkan kerroin (paino ja ilmanvastus). */
  castFactor: number;
  /** Houkuttelevuus lajeittain (kerroin, 1 = tavallinen). */
  appeal: Record<SpeciesId, number>;
  /** Paikallaan olevan tai vajoavan vieheen houkuttelevuus (0–1). */
  stillAppeal: number;
  /**
   * Tartuntariskin kerroin kivissä, oksissa ja risukoissa: jigi laahaa
   * pohjaa, vaapun lippa kimmottaa sen kivestä irti.
   */
  snagRisk: number;
  /** Lyhyt kuvaus valikkoon. */
  hint: string;
}

export const LURES: Record<LureId, Lure> = {
  spoon: {
    id: 'spoon',
    name: 'Lusikka',
    sinkRate: 0.45,
    lift: 0.5,
    maxDepth: Infinity,
    castFactor: 1.1,
    appeal: { perch: 1, pike: 1.15, roach: 0.3, zander: 0.6, trout: 1.15 },
    stillAppeal: 0.2,
    snagRisk: 1,
    hint: 'Heittyy pitkälle ja uppoaa, monipuolinen',
  },
  wobbler: {
    id: 'wobbler',
    name: 'Vaappu',
    sinkRate: -0.1,
    lift: -1.1,
    maxDepth: 2.5,
    castFactor: 0.85,
    appeal: { perch: 0.8, pike: 1.4, roach: 0.2, zander: 1, trout: 1 },
    stillAppeal: 0.1,
    snagRisk: 0.45,
    hint: 'Kelluu, sukeltaa kelatessa n. 2,5 m:iin, hauen herkku',
  },
  jig: {
    id: 'jig',
    name: 'Jigi',
    sinkRate: 0.8,
    lift: 0.7,
    maxDepth: Infinity,
    castFactor: 1.15,
    appeal: { perch: 1.2, pike: 0.6, roach: 0.5, zander: 1.5, trout: 0.5 },
    stillAppeal: 0.7,
    snagRisk: 1.4,
    hint: 'Painuu pohjaan, toimii nykien ja tauottaen',
  },
  spinner: {
    id: 'spinner',
    name: 'Lippa',
    sinkRate: 0.25,
    lift: 0.6,
    maxDepth: Infinity,
    castFactor: 0.9,
    appeal: { perch: 1.3, pike: 0.7, roach: 0.9, zander: 0.4, trout: 1.3 },
    stillAppeal: 0.1,
    snagRisk: 0.9,
    hint: 'Pieni lippa, ahvenen ja särjen suosikki',
  },
};

export const LURE_IDS = Object.keys(LURES) as LureId[];

/** Siimat: paksumpi kestää enemmän, mutta heittyy lyhyemmälle ja näkyy kaloille. */
export type LineId = 'thin' | 'medium' | 'thick';

export interface Line {
  id: LineId;
  name: string;
  /** Kestävyys (kg). */
  strength: number;
  castFactor: number;
  appeal: number;
}

export const LINES: Record<LineId, Line> = {
  thin: { id: 'thin', name: '0,20 mm', strength: 3.5, castFactor: 1.07, appeal: 1.1 },
  medium: { id: 'medium', name: '0,25 mm', strength: 5, castFactor: 1, appeal: 1 },
  thick: { id: 'thick', name: '0,30 mm', strength: 7, castFactor: 0.92, appeal: 0.85 },
};

export const LINE_IDS = Object.keys(LINES) as LineId[];

/**
 * Vavat: kevyt joustaa ja suojaa siimaa nykäyksiltä mutta väsyttää kalaa
 * hitaasti; järeä väsyttää nopeasti, mutta kova veto katkaisee siiman
 * helpommin.
 */
export type RodId = 'light' | 'medium' | 'heavy';

export interface Rod {
  id: RodId;
  name: string;
  castFactor: number;
  /** Siiman kestävyyden kerroin: vapa joustaa ja vaimentaa piikit. */
  flex: number;
  /** Kalan väsymisen kerroin. */
  power: number;
  hint: string;
}

export const RODS: Record<RodId, Rod> = {
  light: {
    id: 'light',
    name: 'Kevyt vapa',
    castFactor: 1.05,
    flex: 1.15,
    power: 0.8,
    hint: 'Pitkä heitto ja armollinen siimalle, mutta väsytys kestää kauan',
  },
  medium: {
    id: 'medium',
    name: 'Perusvapa',
    castFactor: 1,
    flex: 1,
    power: 1,
    hint: 'Tasapainoinen kaikkeen kalastukseen',
  },
  heavy: {
    id: 'heavy',
    name: 'Järeä vapa',
    castFactor: 0.94,
    flex: 0.9,
    power: 1.3,
    hint: 'Väsyttää isonkin kalan nopeasti, mutta siima katkeaa helpommin',
  },
};

export const ROD_IDS = Object.keys(RODS) as RodId[];

/** Pelaajan varusteet. Vaihdetaan vieheen ollessa kelalla. */
export interface Tackle {
  rod: RodId;
  lure: LureId;
  line: LineId;
  /** Teräsperuke: hauki ei katkaise siimaa, mutta muut lajit arkailevat. */
  leader: boolean;
}

/** Aloittelijan varusteet: monipuolinen lusikka, keskipaksu siima ja perusvapa. */
export const DEFAULT_TACKLE: Tackle = {
  rod: 'medium',
  lure: 'spoon',
  line: 'medium',
  leader: false,
};

/** Siiman todellinen kestävyys (kg) vavan jousto huomioiden. */
export const breakingStrength = (t: Tackle) => LINES[t.line].strength * RODS[t.rod].flex;

/** Teräsperuke karkottaa muita kuin haukea hieman. */
export const LEADER_SHYNESS = 0.85;

/**
 * Hauen hampaat: ilman peruketta siima katkeaa väsytyksessä tällä
 * todennäköisyydellä sekunnissa (kun siima voi katketa).
 */
export const PIKE_BITE_OFF_RATE = 0.03;

/** Varusteiden houkuttelevuuskerroin lajille. */
export function tackleAppeal(t: Tackle, species: SpeciesId): number {
  const leader = t.leader && species !== 'pike' ? LEADER_SHYNESS : 1;
  return LURES[t.lure].appeal[species] * LINES[t.line].appeal * leader;
}

export function tackleCastFactor(t: Tackle): number {
  return LURES[t.lure].castFactor * LINES[t.line].castFactor * RODS[t.rod].castFactor;
}

/** Suurin mahdollinen heittokerroin millä tahansa varusteilla (palvelimen tarkistus). */
export const MAX_CAST_FACTOR =
  Math.max(...LURE_IDS.map((l) => LURES[l].castFactor)) *
  Math.max(...LINE_IDS.map((l) => LINES[l].castFactor)) *
  Math.max(...ROD_IDS.map((r) => RODS[r].castFactor));

export function isTackle(v: unknown): v is Tackle {
  if (!v || typeof v !== 'object') return false;
  const t = v as Record<string, unknown>;
  return (
    typeof t.rod === 'string' &&
    Object.hasOwn(RODS, t.rod) &&
    typeof t.lure === 'string' &&
    Object.hasOwn(LURES, t.lure) &&
    typeof t.line === 'string' &&
    Object.hasOwn(LINES, t.line) &&
    typeof t.leader === 'boolean'
  );
}

/**
 * Tallennetut tai verkosta tulleet varusteet: puuttuvat kentät (esim. vanha
 * tallennus ilman vapaa) täytetään oletuksilla. Kelvoton arvo antaa null.
 */
export function parseTackle(v: unknown): Tackle | null {
  if (!v || typeof v !== 'object') return null;
  const t = { ...DEFAULT_TACKLE, ...(v as Partial<Tackle>) };
  return isTackle(t) ? { rod: t.rod, lure: t.lure, line: t.line, leader: t.leader } : null;
}

/** Varusteet lyhyesti HUD:iin. */
export function describeTackle(t: Tackle): string {
  return `${LURES[t.lure].name} · ${LINES[t.line].name}${t.leader ? ' · peruke' : ''}`;
}

/** Varusteet kokonaan, vapa mukaan lukien (aula ja tulostaulu). */
export function describeFullTackle(t: Tackle): string {
  return `${RODS[t.rod].name} · ${describeTackle(t)}`;
}
