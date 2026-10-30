import type { TimeOfDay } from './timeOfDay';

/**
 * Vuodenaika (#427). Kisa käydään yhtenä Lunkinjärven avovesikauden päivänä:
 * kausi päättää auringon radan, kisojen alkamisajat, veden lämmön ja sen,
 * miltä järvi näyttää ja miten kalat ja sää käyttäytyvät. Talvi näkyy
 * valikossa, mutta tulee käyttöön vasta pilkkikauden mukana (#140).
 */
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export const SEASON_IDS: readonly Season[] = ['spring', 'summer', 'autumn', 'winter'];

export const SEASON_NAMES: Record<Season, string> = {
  spring: 'Kevät',
  summer: 'Kesä',
  autumn: 'Syksy',
  winter: 'Talvi',
};

export interface SeasonSpec {
  /** Kisapäivä (vuoden päivä, 1 = 1.1.). */
  dayOfYear: number;
  /**
   * Kisan alkamisaika vuorokaudenajan mukaan (tuntia, Suomen kesäaika):
   * aamukisa sarastuksesta, iltakisa noin kaksi tuntia ennen auringonlaskua
   * ja yökisa hämärän jälkeen.
   */
  startHour: Record<TimeOfDay, number>;
  /** Pintaveden lämpö (°C), Etelä-Suomen järvien likiarvo. */
  water: number;
  /** Pelattavissa; talvi odottaa pilkkikautta. */
  available: boolean;
}

export const SEASONS: Record<Season, SeasonSpec> = {
  // 5.5.: jäät juuri lähteneet, lehtipuut paljaita. Aurinko 5.10–21.34.
  spring: {
    dayOfYear: 125,
    startHour: { morning: 4.15, day: 14.5, evening: 19.5, night: 23.25 },
    water: 7,
    available: true,
  },
  // 1.7.: yötön yö, aurinko 3.56–23.00 eikä laske yöllä kuin 6° horisontin alle.
  summer: {
    dayOfYear: 182,
    startHour: { morning: 2.9, day: 14.5, evening: 20.75, night: 23.5 },
    water: 20,
    available: true,
  },
  // 1.10.: ruska, aurinko 7.27–18.59 ja korkeimmillaan 26°.
  autumn: {
    dayOfYear: 274,
    startHour: { morning: 6.5, day: 13.5, evening: 16.75, night: 21 },
    water: 10,
    available: true,
  },
  // Paikka pilkkikaudelle: helmikuun puoliväli jäällä.
  winter: {
    dayOfYear: 46,
    startHour: { morning: 7, day: 12.5, evening: 15.5, night: 19 },
    water: 1,
    available: false,
  },
};

export const DEFAULT_SEASON: Season = 'summer';

export const isSeason = (v: unknown): v is Season =>
  typeof v === 'string' && Object.hasOwn(SEASONS, v);

/** Kelpaako kausi kisaan (talvi ei vielä). */
export const isPlayableSeason = (v: unknown): v is Season => isSeason(v) && SEASONS[v].available;

/** Kisan kausi asetuksista: puuttuva tai keskeneräinen kausi on kesä. */
export const seasonOf = (s: { season?: unknown }): Season =>
  isPlayableSeason(s.season) ? s.season : DEFAULT_SEASON;
