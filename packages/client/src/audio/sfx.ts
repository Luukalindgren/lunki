/**
 * Yksinkertaiset retroäänet WebAudiolla, ilman äänitiedostoja. Ääni käynnistyy
 * vasta ensimmäisestä käyttäjän painalluksesta (selainten autoplay-sääntö).
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted = false;

  /** Kutsutaan käyttäjän syötteestä. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.25;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
  }

  /** Kalan seuraaminen: pieni näpäytys siimassa. */
  tick(): void {
    this.tone(1400, 0.03, 'square', 0.4);
  }

  /** Isku: matala tömähdys ja nouseva piippaus. */
  strike(): void {
    this.tone(120, 0.12, 'square', 1);
    this.tone(660, 0.15, 'square', 0.6, 0.08, 990);
  }

  hooked(): void {
    this.tone(523, 0.08, 'square', 0.6);
    this.tone(784, 0.12, 'square', 0.6, 0.08);
  }

  reelClick(): void {
    this.tone(2200, 0.012, 'square', 0.15);
  }

  /** Jarru luistaa: sirisevä ääni. */
  dragSlip(): void {
    this.tone(3200 + Math.random() * 800, 0.03, 'sawtooth', 0.12);
  }

  splash(): void {
    this.noise(0.18, 0.5);
  }

  /** Ukkosen jyrinä: matala, hitaasti voimistuva ja vaimeneva kohina. */
  rumble(): void {
    this.noise(2.8, 0.9, 160, 0.4);
  }

  caught(): void {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.1, 'square', 0.5, i * 0.09));
  }

  lost(): void {
    this.tone(330, 0.2, 'square', 0.5, 0, 160);
  }

  private tone(
    freq: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    delay = 0,
    endFreq?: number,
  ): void {
    if (this.muted || !this.ctx || !this.master) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t + duration);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  private noise(duration: number, volume: number, cutoff = 1800, attack = 0): void {
    if (this.muted || !this.ctx || !this.master) return;
    const len = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    const rise = Math.max(1, attack * this.ctx.sampleRate);
    for (let i = 0; i < len; i++)
      data[i] = (Math.random() * 2 - 1) * Math.min(1, i / rise) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
  }
}
