import { ArraySchema, schema, t, type SchemaType } from '@colyseus/schema';
import {
  DEFAULT_APPEARANCE,
  DEFAULT_MAX_PLAYERS,
  DEFAULT_SETTINGS,
  DEFAULT_TACKLE,
  NATIVE_SPECIES,
  PROTOCOL_VERSION,
} from '@lunki/shared';

/**
 * Pelaaja huoneessa. Avaimena Colyseuksen sessionId. Renkaan tila on
 * float64, jotta asiakkaan ennakointi voi lähteä täsmälleen samasta tilasta.
 */
export const PlayerState = schema(
  {
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
    /** Kalastajan kunto 0–1 (ks. STAMINA). */
    stamina: t.float64().default(1),
    /** Viimeisin käsitelty syötteen numero. */
    ack: t.uint32().default(0),
    /** Viehe muiden nähtäväksi (ei vaikuta peliin). */
    lureX: t.float32().default(0),
    lureY: t.float32().default(0),
    lureStage: t.uint8().default(0),
    /** Salaman jäähy: kalastaa ei voi ennen tätä kisa-aikaa (s); pudonneella iso luku. */
    outUntil: t.float32().default(0),
    /** Iso aalto kaatoi renkaan: pystyssä taas tästä kisa-ajasta (s). */
    capsizedUntil: t.float32().default(0),
    /** Siima sotkussa tämän pelaajan (sessionId) siiman kanssa; tyhjä = ei sotkua. */
    tangledWith: t.string().default(''),
    tangleX: t.float32().default(0),
    tangleY: t.float32().default(0),
    /** Sotkun selvitys 0–1, sama molemmilla. */
    untangle: t.float32().default(0),
    /** Varusteet muiden nähtäväksi (Tackle). */
    rod: t.string().default(DEFAULT_TACKLE.rod),
    lure: t.string().default(DEFAULT_TACKLE.lure),
    /** Jigin paino ja vaapun uintisyvyys (#363). */
    jigWeight: t.string().default(DEFAULT_TACKLE.jigWeight),
    crankDepth: t.string().default(DEFAULT_TACKLE.crankDepth),
    line: t.string().default(DEFAULT_TACKLE.line),
    leader: t.boolean().default(DEFAULT_TACKLE.leader),
    /** Virveli tai perho, ja perhovälineet (#234). */
    method: t.string().default(DEFAULT_TACKLE.method),
    flyRod: t.string().default(DEFAULT_TACKLE.flyRod),
    flyLine: t.string().default(DEFAULT_TACKLE.flyLine),
    flyLeader: t.string().default(DEFAULT_TACKLE.flyLeader),
    fly: t.string().default(DEFAULT_TACKLE.fly),
    /** Katsoja: ei rengasta eikä saaliita, näkee kisan ja voi chatata. */
    spectator: t.boolean().default(false),
    /** Värit muiden nähtäväksi (Appearance). */
    tubeColor: t.uint32().default(DEFAULT_APPEARANCE.tube),
    finColor: t.uint32().default(DEFAULT_APPEARANCE.fins),
    shirtColor: t.uint32().default(DEFAULT_APPEARANCE.shirt),
    lineColor: t.uint32().default(DEFAULT_APPEARANCE.line),
    /** Vene (#263): vene 1…, 0 = kelluntarengas (tai katsoja). */
    boat: t.uint8().default(0),
    /** Paikka veneessä (BoatSeat): 0 = soutaja. */
    seat: t.uint8().default(0),
    /** Soutaja kääntyneenä tuhdolla kalastaessaan: kulma veneen suunnasta (rad). */
    look: t.float32().default(0),
    /** Ankkuri (#355, AnchorPhase) ja sen tila; float64 ennakointia varten kuten rengas. */
    anchor: t.uint8().default(0),
    anchorX: t.float64().default(0),
    anchorY: t.float64().default(0),
    anchorDepth: t.float64().default(0),
    anchorDrop: t.float64().default(0),
    /** Paikanvaihtopyyntö veneessä (#357): haluttu paikka + 1; 0 = ei pyyntöä. */
    seatAsk: t.uint8().default(0),
    /** Maalla (#457, ShoreNet): 0 vedessä; renkaan paikka maassa ja hyppy kyytiin. */
    shore: t.uint8().default(0),
    shoreX: t.float64().default(0),
    shoreY: t.float64().default(0),
    shoreHeading: t.float64().default(0),
    shoreBoard: t.float64().default(0),
    /** Selkä edellä rantaa vasten potkittu aika (s). */
    landing: t.float64().default(0),
    /** Täyttökisa (#458, ShoreNet): letkun ponttooni + 1, siirto, täytöt ja kahva. */
    inflate: t.uint8().default(0),
    inflateMove: t.uint8().default(0),
    fill0: t.float64().default(0),
    fill1: t.float64().default(0),
    fill2: t.float64().default(0),
    pumpHandle: t.float64().default(0),
    pumpArrow: t.uint8().default(0),
    inflateSeed: t.uint32().default(0),
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
    /** TimeOfDay: vuorokaudenaika. */
    timeOfDay: t.string().default(DEFAULT_SETTINGS.timeOfDay!),
    /** Season: vuodenaika (#427). */
    season: t.string().default(DEFAULT_SETTINGS.season!),
    lightningPenalty: t.string().default(DEFAULT_SETTINGS.lightningPenalty!),
    capsizePenalty: t.string().default(DEFAULT_SETTINGS.capsizePenalty!),
    landPenalty: t.uint8().default(DEFAULT_SETTINGS.landPenalty!),
    /** LateJoin: liittyminen kesken kisan. */
    lateJoin: t.string().default('open'),
    species: t.array('string').default(() => new ArraySchema<string>(...NATIVE_SPECIES)),
    /** Täyttökisa (#458): kisa alkaa rannalta tyhjällä renkaalla. */
    inflate: t.boolean().default(false),
    /** Kartalta valittu aloituspaikka; false = satunnainen. */
    customStart: t.boolean().default(false),
    startX: t.float32().default(0),
    startY: t.float32().default(0),
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
    /** Kala kalakannassa (FishTag); -1 = ei tiedossa. */
    fishSlot: t.int16().default(-1),
    fishGen: t.uint16().default(0),
    /** Saajan vene (0 = rengas): saalis jää venekunnalle, vaikka saaja lähtisi. */
    boat: t.uint8().default(0),
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
    /** Palvelimen protokollaversio: asiakas ei käytä uudempia viestejä vanhalla palvelimella. */
    protocol: t.uint8().default(PROTOCOL_VERSION),
  },
  'LunkiState',
);
export type LunkiState = SchemaType<typeof LunkiState>;
