/** Sävel puolisävelaskelina A4:stä (440 Hz). */
const hz = (semitones: number) => 440 * 2 ** (semitones / 12);

/** Sointukierto Am–F–C–G, kukin tahdin mittainen: pohjasävel ja sointusävelet. */
const CHORDS: { root: number; notes: number[] }[] = [
  { root: -24, notes: [0, 3, 7, 12] },
  { root: -28, notes: [-4, 0, 3, 8] },
  { root: -33, notes: [-9, -5, -2, 3] },
  { root: -26, notes: [-2, 2, 5, 10] },
];
const BEAT = 60 / 76;
const LOOKAHEAD = 0.4;

/**
 * Rauhallinen taustamusiikki: matala basso ja kolmioaallon arpeggio
 * sointukierrolla. Sävelet ajastetaan hieman etukäteen WebAudion kelloon.
 */
export class Music {
  private nextTime = 0;
  private step = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly ctx: AudioContext,
    private readonly out: AudioNode,
  ) {}

  get playing(): boolean {
    return this.timer !== null;
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

  private schedule(): void {
    while (this.nextTime < this.ctx.currentTime + LOOKAHEAD) {
      const chord = CHORDS[Math.floor(this.step / 8) % CHORDS.length]!;
      const eighth = this.step % 8;
      if (eighth === 0) this.note(hz(chord.root), BEAT * 3.5, 'triangle', 0.22);
      if (eighth === 4) this.note(hz(chord.root + 7), BEAT * 1.5, 'triangle', 0.14);
      // Arpeggio ylös ja alas, välillä tauko.
      const order = [0, 1, 2, 3, 2, 1, 2, 1];
      if (!(eighth === 7 && this.step % 32 === 31))
        this.note(hz(chord.notes[order[eighth]!]!), BEAT * 0.45, 'square', 0.035);
      this.nextTime += BEAT / 2;
      this.step++;
    }
  }

  private note(freq: number, duration: number, type: OscillatorType, volume: number): void {
    const t = this.nextTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain).connect(this.out);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }
}
