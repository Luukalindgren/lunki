import { schema, t, type SchemaType } from '@colyseus/schema';
import { DEFAULT_MAX_PLAYERS, DEFAULT_SETTINGS } from '@lunki/shared';

/** Pelaaja huoneessa. Avaimena Colyseuksen sessionId. */
export const PlayerState = schema(
  {
    /** Selaimen muistissa pysyvä tunniste (uudelleenyhdistämistä varten). */
    playerId: t.string(),
    name: t.string(),
    ready: t.boolean(),
    connected: t.boolean().default(true),
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
  },
  'SettingsState',
);
export type SettingsState = SchemaType<typeof SettingsState>;

export const LunkiState = schema(
  {
    /** Huonekoodin tunnisteosa, esim. "4F7K". */
    code: t.string(),
    phase: t.string().default('lobby'),
    /** Isännän sessionId: vain isäntä voi aloittaa ja muuttaa asetuksia. */
    hostId: t.string(),
    settings: SettingsState,
    players: t.map(PlayerState),
    /** Kalojen ja aloituspaikkojen siemen, arvotaan kisan alkaessa. */
    seed: t.uint32(),
  },
  'LunkiState',
);
export type LunkiState = SchemaType<typeof LunkiState>;
