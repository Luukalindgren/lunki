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
   * pohjaa, vaapun kaksi kolmihaarakoukkua jäävät esteeseen helposti ja
   * lipan pyörivä siipi suojaa koukkua.
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
    appeal: {
      perch: 1,
      pike: 1.15,
      roach: 0.3,
      zander: 0.6,
      trout: 1.15,
      bream: 0.15,
      ruffe: 0.4,
      burbot: 0.3,
      ide: 1.1,
      rainbow: 1.3,
      carp: 0.1,
    },
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
    appeal: {
      perch: 0.8,
      pike: 1.4,
      roach: 0.2,
      zander: 1,
      trout: 1,
      bream: 0.1,
      ruffe: 0.15,
      burbot: 0.3,
      ide: 0.7,
      rainbow: 1,
      carp: 0.1,
    },
    stillAppeal: 0.1,
    snagRisk: 0.7,
    hint: 'Kelluu, sukeltaa kelatessa n. 2,5 m:iin, hauen herkku',
  },
  jig: {
    id: 'jig',
    name: 'Jigi',
    sinkRate: 0.8,
    lift: 0.7,
    maxDepth: Infinity,
    castFactor: 1.15,
    appeal: {
      perch: 1.2,
      pike: 0.6,
      roach: 0.5,
      zander: 1.5,
      trout: 0.5,
      bream: 1.3,
      ruffe: 1.4,
      burbot: 1.5,
      ide: 0.5,
      rainbow: 0.6,
      carp: 1.2,
    },
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
    appeal: {
      perch: 1.3,
      pike: 0.7,
      roach: 0.9,
      zander: 0.4,
      trout: 1.3,
      bream: 0.4,
      ruffe: 1.2,
      burbot: 0.4,
      ide: 1.4,
      rainbow: 1.3,
      carp: 0.2,
    },
    stillAppeal: 0.1,
    snagRisk: 0.5,
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

/** Kalastustapa: virveli (heittovapa ja viehe) tai perho (#234). */
export type Method = 'spin' | 'fly';

export const METHODS: Record<Method, string> = { spin: 'Virveli', fly: 'Perho' };

/**
 * Perhovavat luokittain: luokka määrää, kuinka isoa perhoa vapa kääntää ja
 * kuinka nopeasti kala väsyy. Perhovapa on virvelivapaa pehmeämpi.
 */
export type FlyRodId = 'fly6' | 'fly8' | 'fly10';

export interface FlyRod {
  id: FlyRodId;
  name: string;
  castFactor: number;
  /** Tippetin kestävyyden kerroin: pehmeä vapa vaimentaa nykäykset. */
  flex: number;
  /** Kalan väsymisen kerroin. */
  power: number;
  /** Suurin perho (cm), jonka vapa kääntää; isompi lyhentää heittoa. */
  maxFly: number;
}

export const FLY_RODS: Record<FlyRodId, FlyRod> = {
  fly6: { id: 'fly6', name: 'Perhovapa #6', castFactor: 1.05, flex: 1.25, power: 0.75, maxFly: 10 },
  fly8: { id: 'fly8', name: 'Perhovapa #8', castFactor: 1, flex: 1.1, power: 1, maxFly: 20 },
  fly10: { id: 'fly10', name: 'Perhovapa #10', castFactor: 0.95, flex: 1, power: 1.3, maxFly: 30 },
};

export const FLY_ROD_IDS = Object.keys(FLY_RODS) as FlyRodId[];

/** Perhosiimat: kelluva pitää perhon pinnan tuntumassa, uppoava vie sen syvälle. */
export type FlyLineId = 'floating' | 'intermediate' | 'sinking';

export interface FlyLine {
  id: FlyLineId;
  name: string;
  /** Siiman vajoaminen (m/s), lisätään perhon omaan vajoamiseen. */
  sinkRate: number;
  /** Vedon nosto (m/s per m/s): uppoava siima pitää perhon syvällä vedossakin. */
  lift: number;
  /** Syvin perhon syvyys (m): kelluvalla siimalla perukkeen mitta. */
  maxDepth: number;
  castFactor: number;
}

export const FLY_LINES: Record<FlyLineId, FlyLine> = {
  floating: {
    id: 'floating',
    name: 'Kelluva',
    sinkRate: 0,
    lift: 0,
    maxDepth: 1.2,
    castFactor: 1,
  },
  intermediate: {
    id: 'intermediate',
    name: 'Intermediate',
    sinkRate: 0.05,
    lift: 0,
    maxDepth: Infinity,
    castFactor: 1.03,
  },
  sinking: {
    id: 'sinking',
    name: 'Uppoava',
    sinkRate: 0.12,
    lift: -0.1,
    maxDepth: Infinity,
    castFactor: 0.97,
  },
};

export const FLY_LINE_IDS = Object.keys(FLY_LINES) as FlyLineId[];

/** Perhon peruke: tavallinen, näkymätön fluorohiili tai hauen hampaat kestävä teräs. */
export type FlyLeaderId = 'mono' | 'fluoro' | 'steel';

export interface FlyLeader {
  id: FlyLeaderId;
  name: string;
  /** Perukkeen kestävyys (kg). */
  strength: number;
  /** Hauen hampaiden puraisun kerroin (1 = katkeaa kuten ilman peruketta). */
  biteOff: number;
  /** Houkuttelevuus muille kuin hauelle (hauki ei arkaile). */
  appeal: number;
}

export const FLY_LEADERS: Record<FlyLeaderId, FlyLeader> = {
  mono: { id: 'mono', name: 'Tavallinen', strength: 7, biteOff: 1, appeal: 1 },
  fluoro: { id: 'fluoro', name: 'Fluorohiili', strength: 9, biteOff: 0.35, appeal: 1.08 },
  steel: { id: 'steel', name: 'Teräs', strength: 11, biteOff: 0, appeal: 0.85 },
};

export const FLY_LEADER_IDS = Object.keys(FLY_LEADERS) as FlyLeaderId[];

/** Perhot. */
export type FlyId = 'pikeStreamer' | 'popper' | 'perchStreamer' | 'nymph';

export interface Fly {
  id: FlyId;
  name: string;
  /** Pituus (cm). */
  size: number;
  /** Vajoaminen (m/s) kelluvalla siimalla; negatiivinen kelluu pinnassa. */
  sinkRate: number;
  /** Nousu vedettäessä (m/s per m/s). */
  lift: number;
  /** Syvin uintisyvyys (m); popperi pysyy pinnassa. */
  maxDepth: number;
  castFactor: number;
  appeal: Record<SpeciesId, number>;
  /** Paikallaan leijuvan perhon houkuttelevuus (0–1). */
  stillAppeal: number;
  /** Vedon jälkeisen tauon houkuttelevuus hauelle ja suurkaloille (0–1). */
  pauseAppeal: number;
  snagRisk: number;
  /** Suurkalojen mieltymys. */
  bigFish: number;
  /** Pintaperho roiskii vedettäessä. */
  surface: boolean;
}

export const FLIES: Record<FlyId, Fly> = {
  pikeStreamer: {
    id: 'pikeStreamer',
    name: 'Hauki-streameri',
    size: 20,
    sinkRate: 0.04,
    lift: 0.15,
    maxDepth: Infinity,
    castFactor: 0.92,
    appeal: {
      perch: 0.45,
      pike: 1.6,
      roach: 0.1,
      zander: 0.7,
      trout: 0.8,
      bream: 0.05,
      ruffe: 0.1,
      burbot: 0.5,
      ide: 0.4,
      rainbow: 0.9,
      carp: 0.05,
    },
    stillAppeal: 0.45,
    pauseAppeal: 0.95,
    snagRisk: 0.6,
    bigFish: 1.5,
    surface: false,
  },
  popper: {
    id: 'popper',
    name: 'Pintapopperi',
    size: 8,
    sinkRate: -0.5,
    lift: 0,
    maxDepth: 0,
    castFactor: 0.9,
    appeal: {
      perch: 1,
      pike: 1.3,
      roach: 0.3,
      zander: 0.2,
      trout: 0.9,
      bream: 0.1,
      ruffe: 0.05,
      burbot: 0.05,
      ide: 1.2,
      rainbow: 1,
      carp: 0.1,
    },
    stillAppeal: 0.2,
    pauseAppeal: 0.6,
    snagRisk: 0.15,
    bigFish: 1.1,
    surface: true,
  },
  perchStreamer: {
    id: 'perchStreamer',
    name: 'Ahven-streameri',
    size: 6,
    sinkRate: 0.07,
    lift: 0.2,
    maxDepth: Infinity,
    castFactor: 1,
    appeal: {
      perch: 1.4,
      pike: 0.8,
      roach: 0.4,
      zander: 1,
      trout: 1.3,
      bream: 0.3,
      ruffe: 0.8,
      burbot: 0.8,
      ide: 1.1,
      rainbow: 1.3,
      carp: 0.2,
    },
    stillAppeal: 0.3,
    pauseAppeal: 0.6,
    snagRisk: 0.8,
    bigFish: 0.8,
    surface: false,
  },
  nymph: {
    id: 'nymph',
    name: 'Nymfi',
    size: 1.5,
    sinkRate: 0.12,
    lift: 0.25,
    maxDepth: Infinity,
    castFactor: 1.05,
    appeal: {
      perch: 1,
      pike: 0.2,
      roach: 1.5,
      zander: 0.6,
      trout: 1.4,
      bream: 1.2,
      ruffe: 1.2,
      burbot: 0.6,
      ide: 1.3,
      rainbow: 1.4,
      carp: 1.3,
    },
    stillAppeal: 0.7,
    pauseAppeal: 0.7,
    snagRisk: 1.1,
    bigFish: 0.6,
    surface: false,
  },
};

export const FLY_IDS = Object.keys(FLIES) as FlyId[];

/**
 * Perhoheiton kantama suhteessa vieheeseen: painoton perho lentää siiman
 * varassa, joten renkaasta heitto jää noin 12–24 metriin.
 */
export const FLY_CAST_FACTOR = 0.5;

/**
 * Pelaajan varusteet. Vaihdetaan vieheen ollessa kelalla. Kalastajalla on
 * mukana sekä virveli- että perhovälineet; `method` kertoo, kumpi on käytössä.
 */
export interface Tackle {
  rod: RodId;
  lure: LureId;
  line: LineId;
  /** Teräsperuke: hauki ei katkaise siimaa, mutta muut lajit arkailevat. */
  leader: boolean;
  method: Method;
  flyRod: FlyRodId;
  flyLine: FlyLineId;
  flyLeader: FlyLeaderId;
  fly: FlyId;
}

/**
 * Aloittelijan varusteet: monipuolinen lusikka, keskipaksu siima ja
 * perusvapa; perhona #8, kelluva siima, teräsperuke ja hauki-streameri.
 */
export const DEFAULT_TACKLE: Tackle = {
  rod: 'medium',
  lure: 'spoon',
  line: 'medium',
  leader: false,
  method: 'spin',
  flyRod: 'fly8',
  flyLine: 'floating',
  flyLeader: 'steel',
  fly: 'pikeStreamer',
};

export const isFly = (t: Tackle) => t.method === 'fly';

/** Siiman (perhossa perukkeen) todellinen kestävyys (kg) vavan jousto huomioiden. */
export const breakingStrength = (t: Tackle) =>
  isFly(t)
    ? FLY_LEADERS[t.flyLeader].strength * FLY_RODS[t.flyRod].flex
    : LINES[t.line].strength * RODS[t.rod].flex;

/** Vavan väsytysvoima. */
export const rodPower = (t: Tackle) => (isFly(t) ? FLY_RODS[t.flyRod] : RODS[t.rod]).power;

/** Teräsperuke karkottaa muita kuin haukea hieman. */
export const LEADER_SHYNESS = 0.85;

/**
 * Hauen hampaat: ilman peruketta siima katkeaa väsytyksessä tällä
 * todennäköisyydellä sekunnissa (kun siima voi katketa).
 */
export const PIKE_BITE_OFF_RATE = 0.03;

/** Hauen puraisun todennäköisyys sekunnissa näillä varusteilla. */
export const biteOffRate = (t: Tackle) =>
  PIKE_BITE_OFF_RATE * (isFly(t) ? FLY_LEADERS[t.flyLeader].biteOff : t.leader ? 0 : 1);

/** Suurkalat pitävät isosta ja hitaasta vieheestä. */
const BIG_FISH_LURE: Record<LureId, number> = {
  wobbler: 1.3,
  spoon: 1.2,
  jig: 0.8,
  spinner: 0.6,
};

/** Vieheen tai perhon ominaisuudet vedessä ja kaloille (siima ja vapa mukana). */
export interface Bait {
  sinkRate: number;
  lift: number;
  maxDepth: number;
  castFactor: number;
  stillAppeal: number;
  /** Vedon jälkeisen tauon houkuttelevuus hauelle ja suurkaloille. */
  pauseAppeal: number;
  snagRisk: number;
  bigFish: number;
  /** Pintaperho (popperi). */
  surface: boolean;
}

/** Käytössä olevan vieheen tai perhon ominaisuudet. */
export function baitOf(t: Tackle): Bait {
  if (!isFly(t)) {
    const l = LURES[t.lure];
    return {
      sinkRate: l.sinkRate,
      lift: l.lift,
      maxDepth: l.maxDepth,
      castFactor: l.castFactor * LINES[t.line].castFactor * RODS[t.rod].castFactor,
      stillAppeal: l.stillAppeal,
      pauseAppeal: l.stillAppeal,
      snagRisk: l.snagRisk,
      bigFish: BIG_FISH_LURE[t.lure],
      surface: false,
    };
  }
  const f = FLIES[t.fly];
  const line = FLY_LINES[t.flyLine];
  const rod = FLY_RODS[t.flyRod];
  // Liian iso perho kevyelle vavalle: siima ei käänny, ja heitto lyhenee.
  const turnover = f.size > rod.maxFly ? 0.8 : 1;
  return {
    // Uppoava siima vetää popperinkin pinnan alle vedettäessä, mutta se nousee tauolla.
    sinkRate: f.sinkRate + line.sinkRate,
    lift: f.lift + line.lift,
    maxDepth: Math.min(f.surface && line.id !== 'sinking' ? 0 : f.maxDepth, line.maxDepth),
    castFactor: FLY_CAST_FACTOR * f.castFactor * line.castFactor * rod.castFactor * turnover,
    stillAppeal: f.stillAppeal,
    pauseAppeal: f.pauseAppeal,
    snagRisk: f.snagRisk,
    bigFish: f.bigFish,
    surface: f.surface,
  };
}

/** Varusteiden houkuttelevuuskerroin lajille. */
export function tackleAppeal(t: Tackle, species: SpeciesId): number {
  if (isFly(t)) {
    const leader = species === 'pike' ? 1 : FLY_LEADERS[t.flyLeader].appeal;
    return FLIES[t.fly].appeal[species] * leader;
  }
  const leader = t.leader && species !== 'pike' ? LEADER_SHYNESS : 1;
  return LURES[t.lure].appeal[species] * LINES[t.line].appeal * leader;
}

export function tackleCastFactor(t: Tackle): number {
  return baitOf(t).castFactor;
}

/**
 * Suurin mahdollinen heittokerroin millä tahansa varusteilla (palvelimen
 * tarkistus). Perhoheitto jää aina virveliheittoa lyhyemmäksi.
 */
export const MAX_CAST_FACTOR =
  Math.max(...LURE_IDS.map((l) => LURES[l].castFactor)) *
  Math.max(...LINE_IDS.map((l) => LINES[l].castFactor)) *
  Math.max(...ROD_IDS.map((r) => RODS[r].castFactor));

const isKey = (table: object, v: unknown) => typeof v === 'string' && Object.hasOwn(table, v);

export function isTackle(v: unknown): v is Tackle {
  if (!v || typeof v !== 'object') return false;
  const t = v as Record<string, unknown>;
  return (
    isKey(RODS, t.rod) &&
    isKey(LURES, t.lure) &&
    isKey(LINES, t.line) &&
    typeof t.leader === 'boolean' &&
    isKey(METHODS, t.method) &&
    isKey(FLY_RODS, t.flyRod) &&
    isKey(FLY_LINES, t.flyLine) &&
    isKey(FLY_LEADERS, t.flyLeader) &&
    isKey(FLIES, t.fly)
  );
}

/**
 * Tallennetut tai verkosta tulleet varusteet: puuttuvat kentät (esim. vanha
 * tallennus ilman vapaa tai perhovälineitä) täytetään oletuksilla. Kelvoton
 * arvo antaa null.
 */
export function parseTackle(v: unknown): Tackle | null {
  if (!v || typeof v !== 'object') return null;
  const given = Object.entries(v).filter(([, x]) => x !== undefined);
  const t = { ...DEFAULT_TACKLE, ...(Object.fromEntries(given) as Partial<Tackle>) };
  if (!isTackle(t)) return null;
  return {
    rod: t.rod,
    lure: t.lure,
    line: t.line,
    leader: t.leader,
    method: t.method,
    flyRod: t.flyRod,
    flyLine: t.flyLine,
    flyLeader: t.flyLeader,
    fly: t.fly,
  };
}

/** Varusteet lyhyesti HUD:iin. */
export function describeTackle(t: Tackle): string {
  if (isFly(t))
    return `${FLIES[t.fly].name} · ${FLY_LINES[t.flyLine].name} · ${FLY_LEADERS[t.flyLeader].name}`;
  return `${LURES[t.lure].name} · ${LINES[t.line].name}${t.leader ? ' · peruke' : ''}`;
}

/** Varusteet kokonaan, vapa mukaan lukien (aula ja tulostaulu). */
export function describeFullTackle(t: Tackle): string {
  return `${isFly(t) ? FLY_RODS[t.flyRod].name : RODS[t.rod].name} · ${describeTackle(t)}`;
}
