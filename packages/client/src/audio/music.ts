/** Sävel puolisävelaskelina A4:stä (440 Hz). */
const hz = (semitones: number) => 440 * 2 ** (semitones / 12);

/** Yksi soitettava sävel: korkeus A4:stä, kesto iskuina, aaltomuoto ja voimakkuus. */
export interface MusicNote {
  semis: number;
  beats: number;
  type: OscillatorType;
  volume: number;
  /** Nousuaika sekunteina (oletus 0,02); pitkä nousu tekee pehmeän maton. */
  attack?: number;
}

export interface MusicTrack {
  bpm: number;
  /** Kahdeksasosia tahdissa: 8 = 4/4, 6 = 3/4. */
  stepsPerBar: number;
  /** Tahteja yhdessä kierrossa. */
  bars: number;
  /** Kierron askeleella (kahdeksasosa) alkavat sävelet. */
  notes(step: number): MusicNote[];
}

/** Melodian sävel: tahdin kahdeksasosa, korkeus ja kesto iskuina. */
type Phrase = [step: number, semis: number, beats: number][];

const melody = (
  bars: Phrase[],
  bar: number,
  step: number,
  type: OscillatorType,
  volume: number,
): MusicNote[] =>
  (bars[bar] ?? [])
    .filter(([s]) => s === step)
    .map(([, semis, beats]) => ({ semis, beats, type, volume }));

/**
 * Järvenselkä: alkuperäinen rauhallinen raita. Matala basso ja kolmioaallon
 * arpeggio sointukierrolla Am–F–C–G.
 */
const JARVENSELKA_CHORDS: { root: number; notes: number[] }[] = [
  { root: -24, notes: [0, 3, 7, 12] },
  { root: -28, notes: [-4, 0, 3, 8] },
  { root: -33, notes: [-9, -5, -2, 3] },
  { root: -26, notes: [-2, 2, 5, 10] },
];
const ARP_ORDER = [0, 1, 2, 3, 2, 1, 2, 1];

const jarvenselka: MusicTrack = {
  bpm: 76,
  stepsPerBar: 8,
  bars: 4,
  notes(step) {
    const chord = JARVENSELKA_CHORDS[Math.floor(step / 8)]!;
    const eighth = step % 8;
    const out: MusicNote[] = [];
    if (eighth === 0) out.push({ semis: chord.root, beats: 3.5, type: 'triangle', volume: 0.22 });
    if (eighth === 4)
      out.push({ semis: chord.root + 7, beats: 1.5, type: 'triangle', volume: 0.14 });
    // Arpeggio ylös ja alas, kierron lopussa tauko.
    if (step !== 31)
      out.push({
        semis: chord.notes[ARP_ORDER[eighth]!]!,
        beats: 0.45,
        type: 'square',
        volume: 0.035,
      });
    return out;
  },
};

/**
 * Aamu-usva: hidas, laskeva Fmaj7–Em7–Dm7–Cmaj7, pehmeä siniaaltomatto ja
 * harva kolmioaallon melodia.
 */
const USVA_CHORDS: { root: number; notes: number[] }[] = [
  { root: -28, notes: [-16, -12, -9, -5] },
  { root: -29, notes: [-17, -14, -10, -7] },
  { root: -31, notes: [-19, -16, -12, -9] },
  { root: -33, notes: [-21, -17, -14, -10] },
];
const USVA_MELODY: Phrase[] = [
  [
    [0, 7, 1.5],
    [3, 3, 0.5],
    [4, 0, 1],
    [6, 3, 1],
  ],
  [
    [0, 5, 1.5],
    [3, 2, 0.5],
    [4, -2, 1],
    [6, 2, 1],
  ],
  [
    [0, 3, 1.5],
    [3, 0, 0.5],
    [4, -4, 1],
    [6, 0, 1],
  ],
  [
    [0, 2, 1],
    [2, -2, 1],
    [4, -5, 3],
  ],
];

const usva: MusicTrack = {
  bpm: 60,
  stepsPerBar: 8,
  bars: 8,
  notes(step) {
    const bar = Math.floor(step / 8) % 4;
    const eighth = step % 8;
    const chord = USVA_CHORDS[bar]!;
    const out: MusicNote[] = [];
    if (eighth === 0) {
      out.push({ semis: chord.root, beats: 3.8, type: 'triangle', volume: 0.18 });
      for (const semis of chord.notes)
        out.push({ semis, beats: 3.9, type: 'sine', volume: 0.03, attack: 0.6 });
    }
    // Melodia vain kierron toisella puoliskolla: ensin pelkkä matto.
    if (step >= 32) out.push(...melody(USVA_MELODY, bar, eighth, 'triangle', 0.06));
    return out;
  },
};

/**
 * Kuikan valssi: 3/4-tahti d-mollissa. Basso ykkösellä, hiljaiset
 * kanttiaaltoiskut kakkosella ja kolmosella, kolmioaallon melodia päällä.
 */
const VALSSI_CHORDS: { root: number; notes: number[] }[] = [
  { root: -31, notes: [-7, -4, 0] }, // Dm
  { root: -26, notes: [-7, -2, 1] }, // Gm
  { root: -21, notes: [-5, -2, 3] }, // C
  { root: -28, notes: [-4, 0, 3] }, // F
  { root: -23, notes: [-7, -4, 1] }, // Bb
  { root: -26, notes: [-7, -2, 1] }, // Gm
  { root: -24, notes: [-5, 0, 4] }, // A
  { root: -24, notes: [-5, 0, 4] }, // A
];
const VALSSI_MELODY: Phrase[] = [
  [
    [0, 0, 2],
    [4, 5, 1],
  ],
  [
    [0, 5, 1.5],
    [3, 3, 0.5],
    [4, 1, 1],
  ],
  [
    [0, 3, 2],
    [4, -2, 1],
  ],
  [[0, 0, 3]],
  [
    [0, 5, 2],
    [4, 8, 1],
  ],
  [
    [0, 5, 1],
    [2, 3, 1],
    [4, 1, 1],
  ],
  [
    [0, 0, 1],
    [2, 4, 1],
    [4, 7, 1],
  ],
  [[0, 0, 2.5]],
];

const valssi: MusicTrack = {
  bpm: 108,
  stepsPerBar: 6,
  bars: 8,
  notes(step) {
    const bar = Math.floor(step / 6);
    const eighth = step % 6;
    const chord = VALSSI_CHORDS[bar]!;
    const out: MusicNote[] = [];
    if (eighth === 0) out.push({ semis: chord.root, beats: 2.5, type: 'triangle', volume: 0.2 });
    if (eighth === 2 || eighth === 4)
      for (const semis of chord.notes)
        out.push({ semis, beats: 0.4, type: 'square', volume: 0.022 });
    out.push(...melody(VALSSI_MELODY, bar, eighth, 'triangle', 0.07));
    return out;
  },
};

/**
 * Uistelu: reipas e-doorinen Em–G–D–A. Sykkivä kahdeksasosabasso,
 * kierron alussa kanttiaaltomelodia ja lopussa arpeggio.
 */
const UISTELU_CHORDS: { root: number; notes: number[] }[] = [
  { root: -29, notes: [-5, -2, 2, 7] }, // Em
  { root: -26, notes: [-2, 2, 5, 10] }, // G
  { root: -31, notes: [-7, -3, 0, 5] }, // D
  { root: -24, notes: [-5, 0, 4, 7] }, // A
];
const UISTELU_BASS = [0, 0, 12, 0, 7, 0, 12, 0];
const UISTELU_MELODY: Phrase[] = [
  [
    [0, 2, 1],
    [2, 5, 0.5],
    [3, 7, 1.5],
    [6, 5, 0.5],
    [7, 2, 0.5],
  ],
  [
    [0, 5, 1],
    [2, 2, 1],
    [4, -2, 1.5],
    [7, 0, 0.5],
  ],
  [
    [0, 0, 1],
    [2, 5, 1],
    [4, 9, 1.5],
    [7, 7, 0.5],
  ],
  [
    [0, 7, 1.5],
    [3, 4, 0.5],
    [4, 0, 1],
    [6, 2, 1],
  ],
];

const uistelu: MusicTrack = {
  bpm: 104,
  stepsPerBar: 8,
  bars: 8,
  notes(step) {
    const bar = Math.floor(step / 8) % 4;
    const eighth = step % 8;
    const chord = UISTELU_CHORDS[bar]!;
    const out: MusicNote[] = [
      {
        semis: chord.root + UISTELU_BASS[eighth]!,
        beats: 0.4,
        type: 'triangle',
        volume: eighth % 2 === 0 ? 0.16 : 0.1,
      },
    ];
    if (step < 32) out.push(...melody(UISTELU_MELODY, bar, eighth, 'square', 0.03));
    else if (step !== 63)
      out.push({
        semis: chord.notes[ARP_ORDER[eighth]!]!,
        beats: 0.3,
        type: 'square',
        volume: 0.025,
      });
    return out;
  },
};

/** Raitojen tunnukset valikkojärjestyksessä; nimet ovat sanakirjassa (music.<id>). */
export const MUSIC_TRACK_IDS = ['jarvenselka', 'usva', 'valssi', 'uistelu'] as const;
export type MusicTrackId = (typeof MUSIC_TRACK_IDS)[number];
/** Valikon valinta: tietty raita tai vaihtuva (raita vaihtuu parin minuutin välein). */
export type MusicChoice = MusicTrackId | 'vaihtuva';
export const MUSIC_CHOICES: readonly MusicChoice[] = ['vaihtuva', ...MUSIC_TRACK_IDS];

export const MUSIC_TRACKS: Record<MusicTrackId, MusicTrack> = {
  jarvenselka,
  usva,
  valssi,
  uistelu,
};

/** Vaihtuvalla valinnalla raita vaihtuu ensimmäisen kierron lopussa tämän jälkeen. */
export const ROTATE_AFTER_SECONDS = 120;

/** Seuraava raita vaihtuvassa järjestyksessä. */
export const nextTrack = (id: MusicTrackId): MusicTrackId =>
  MUSIC_TRACK_IDS[(MUSIC_TRACK_IDS.indexOf(id) + 1) % MUSIC_TRACK_IDS.length]!;

const LOOKAHEAD = 0.4;

/**
 * Taustamusiikki syntetisoidaan WebAudiolla raita kerrallaan. Sävelet
 * ajastetaan hieman etukäteen WebAudion kelloon.
 */
export class Music {
  private nextTime = 0;
  private step = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private choice: MusicChoice | null = null;
  private track: MusicTrackId = MUSIC_TRACK_IDS[0];
  /** Nykyisen raidan soittoaika (s) vaihtuvaa valintaa varten. */
  private trackTime = 0;

  constructor(
    private readonly ctx: AudioContext,
    private readonly out: AudioNode,
  ) {}

  get playing(): boolean {
    return this.timer !== null;
  }

  /** Vaihtaa raidan heti; vaihtuva alkaa satunnaisesta raidasta. */
  setChoice(choice: MusicChoice): void {
    if (choice === this.choice) return;
    this.choice = choice;
    this.switchTo(
      choice === 'vaihtuva'
        ? MUSIC_TRACK_IDS[Math.floor(Math.random() * MUSIC_TRACK_IDS.length)]!
        : choice,
    );
  }

  start(): void {
    if (this.timer) return;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 100);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private switchTo(id: MusicTrackId): void {
    this.track = id;
    this.step = 0;
    this.trackTime = 0;
  }

  private schedule(): void {
    while (this.nextTime < this.ctx.currentTime + LOOKAHEAD) {
      const track = MUSIC_TRACKS[this.track];
      const loop = track.stepsPerBar * track.bars;
      const step = this.step % loop;
      if (
        step === 0 &&
        this.step > 0 &&
        this.choice === 'vaihtuva' &&
        this.trackTime >= ROTATE_AFTER_SECONDS
      ) {
        this.switchTo(nextTrack(this.track));
        // Pieni hengähdystauko raitojen väliin.
        this.nextTime += 1.5;
        continue;
      }
      const beat = 60 / track.bpm;
      for (const n of track.notes(step)) this.note(n, beat);
      this.nextTime += beat / 2;
      this.trackTime += beat / 2;
      this.step++;
    }
  }

  private note(n: MusicNote, beat: number): void {
    const t = this.nextTime;
    const duration = n.beats * beat;
    const attack = Math.min(n.attack ?? 0.02, duration / 2);
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = n.type;
    osc.frequency.value = hz(n.semis);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(n.volume, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain).connect(this.out);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }
}
