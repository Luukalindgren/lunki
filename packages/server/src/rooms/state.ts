import { ArraySchema, schema, t, type SchemaType } from '@colyseus/schema';
import { DEFAULT_MAX_PLAYERS, DEFAULT_SETTINGS, NATIVE_SPECIES } from '@lunki/shared';

/**
 * Pelaaja huoneessa. Avaimena Colyseuksen sessionId. Renkaan tila on
 * float64, jotta asiakkaan ennakointi voi lähteä täsmälleen samasta tilasta.
 */
export const PlayerState = schema(
  {
    /** Selaimen muistissa pysyvä tunniste (uudelleenyhdistämistä varten). */
    playerId: t.string(),
    name: t.string(),
    ready: t.boolean(),
    connected: t.boolean().default(true),
    x: t.float64().default(0),
    y: t.float64().default(0),
    vx: t.float64().default(0),
    vy: t.float64().default(0),
    heading: t.float64().default(0),
    angVel: t.float64().default(0),
    kickPhase: t.float64().default(0),
    /** Viimeisin käsitelty syötteen numero. */
    ack: t.uint32().default(0),
    /** Viehe muiden nähtäväksi (ei vaikuta peliin). */
    lureX: t.float32().default(0),
    lureY: t.float32().default(0),
    lureStage: t.uint8().default(0),
  },
  'PlayerState',
);
export type PlayerState = SchemaType<typeof PlayerState>;

/** Huoneen asetukset, jotka huoneen luoja valitsee. */
export const SettingsState = schema(
  {
    durationMinutes: t.uint8().default(DEFAULT_SETTINGS.durationMinutes),
    difficulty: t.string().default(DEFAULT_SETTINGS.difficulty),
    winRule: t.string().default(DEFAULT_SETTINGS.winRule),
    maxPlayers: t.uint8().default(DEFAULT_MAX_PLAYERS),
    weather: t.string().default(DEFAULT_SETTINGS.weather!),
    // Paikat tuleville asetuksille (vaihe 4).
    lightningPenalty: t.string().default('none'),
    capsizePenalty: t.string().default('none'),
    species: t.array('string').default(() => new ArraySchema<string>(...NATIVE_SPECIES)),
  },
  'SettingsState',
);
export type SettingsState = SchemaType<typeof SettingsState>;

/** Punnittu saalis: näkyy kaikille. */
export const CatchState = schema(
  {
    /** Saajan sessionId ja nimi (nimi säilyy, vaikka pelaaja lähtisi). */
    player: t.string(),
    angler: t.string(),
    species: t.string(),
    name: t.string(),
    weight: t.float32().default(0),
    /** Kisa-aika saaliin hetkellä (s). */
    time: t.float32().default(0),
  },
  'CatchState',
);
export type CatchState = SchemaType<typeof CatchState>;

export const LunkiState = schema(
  {
    /** Huonekoodin tunnisteosa, esim. "4F7K". */
    code: t.string(),
    phase: t.string().default('lobby'),
    /** Isännän sessionId: vain isäntä voi aloittaa ja muuttaa asetuksia. */
    hostId: t.string(),
    settings: SettingsState,
    players: t.map(PlayerState),
    /** Kisa-aika (s) palvelimen kellosta; lähtölaskennan aikana 0. */
    clock: t.float32().default(0),
    /** Lähtölaskentaa jäljellä (s). */
    countdown: t.float32().default(0),
    catches: t.array(CatchState),
    /** Kalojen ja aloituspaikkojen siemen, arvotaan kisan alkaessa. */
    seed: t.uint32().default(0),
    /** Säätila palvelimen kellon mukaan (tuuli ja sade lasketaan siemenestä). */
    sky: t.string().default('calm'),
  },
  'LunkiState',
);
export type LunkiState = SchemaType<typeof LunkiState>;
