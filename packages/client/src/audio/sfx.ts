import { Ambience, type AmbienceInput } from './ambience';
import { Music } from './music';
import { thunderClap } from './thunder';
import { loadAudioSettings, saveAudioSettings, volumeGain, type AudioSettings } from './settings';

/**
 * Yksinkertaiset retroäänet WebAudiolla, ilman äänitiedostoja. Ääni käynnistyy
 * vasta ensimmäisestä käyttäjän painalluksesta (selainten autoplay-sääntö).
 * Tehosteilla, ympäristöäänillä ja musiikilla on omat voimakkuutensa.
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  /** Tehosteiden väylä. */
  private master: GainNode | null = null;
  private ambienceBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  /** Ukkosen oma väylä: kovempi kuin muut tehosteet, rajoitin estää säröytymisen. */
  private thunderBus: GainNode | null = null;
  private ambience: Ambience | null = null;
  private music: Music | null = null;
  private settings: AudioSettings = loadAudioSettings();
  muted = false;

  /** Kutsutaan käyttäjän syötteestä. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      this.ctx = new AudioContext();
      const bus = () => {
        const g = this.ctx!.createGain();
        g.connect(this.ctx!.destination);
        return g;
      };
      this.master = bus();
      this.ambienceBus = bus();
      this.musicBus = bus();
      const limiter = this.ctx.createDynamicsCompressor();
      limiter.threshold.value = -3;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.001;
      limiter.release.value = 0.2;
      limiter.connect(this.ctx.destination);
      this.thunderBus = this.ctx.createGain();
      this.thunderBus.connect(limiter);
      this.ambience = new Ambience(this.ctx, this.ambienceBus);
      this.music = new Music(this.ctx, this.musicBus);
      this.applySettings();
    } catch {
      this.ctx = null;
    }
  }

  get audioSettings(): AudioSettings {
    return { ...this.settings };
  }

  setAudioSettings(s: AudioSettings): void {
    this.settings = { ...s };
    saveAudioSettings(this.settings);
    this.applySettings();
  }

  private applySettings(): void {
    if (!this.ctx || !this.master || !this.ambienceBus || !this.musicBus || !this.thunderBus)
      return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(0.25 * volumeGain(this.settings.effects), t, 0.05);
    this.thunderBus.gain.setTargetAtTime(0.9 * volumeGain(this.settings.effects), t, 0.05);
    this.ambienceBus.gain.setTargetAtTime(0.5 * volumeGain(this.settings.ambience), t, 0.2);
    this.musicBus.gain.setTargetAtTime(0.5 * volumeGain(this.settings.music), t, 0.2);
    if (this.settings.music > 0) this.music?.start();
    else this.music?.stop();
  }

  /** Ympäristöäänet seuraavat säätä; kutsutaan joka päivityksessä. */
  updateAmbience(dt: number, w: AmbienceInput): void {
    if (this.settings.ambience > 0) this.ambience?.update(dt, w);
  }

  /** Heitto: viuhahdus, voimakkaampi kovalla heitolla. */
  cast(power: number): void {
    this.noise(0.25, 0.25 + power * 0.35, 1200 + power * 2500, 0.15);
  }

  /** Räpylän potku: pehmeä loiskahdus. */
  paddle(): void {
    this.noise(0.12, 0.12, 600, 0.04);
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

  /** Iso aalto murtuu: pitkä, matala kohina. */
  wave(): void {
    this.noise(1.2, 0.8, 700, 0.3);
  }

  splash(): void {
    this.noise(0.18, 0.5);
  }

  /** Kaukainen ukkonen: pehmeästi alkava, pitkä jyrinä. */
  rumble(): void {
    this.playThunder(2500 + Math.random() * 2000, 0.35, 0);
  }

  /**
   * Salaman ääni: lähellä terävä räsähdys ja kova jyrähdys, kaukana
   * hiljaisempi jyrinä. Ääni kulkee 343 m/s, joten se tulee viiveellä.
   */
  thunder(distance: number, delay: number): void {
    const volume = distance < 250 ? 1 : Math.max(0.35, 1 - distance / 3000);
    this.playThunder(distance, volume, delay);
  }

  private playThunder(distance: number, volume: number, delay: number): void {
    if (this.muted || !this.ctx || !this.thunderBus) return;
    const data = thunderClap(this.ctx.sampleRate, distance);
    const buffer = this.ctx.createBuffer(1, data.length, this.ctx.sampleRate);
    buffer.copyToChannel(data, 0);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    src.connect(gain).connect(this.thunderBus);
    src.start(this.ctx.currentTime + delay);
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

  private noise(duration: number, volume: number, cutoff = 1800, attack = 0, delay = 0): void {
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
    src.start(this.ctx.currentTime + delay);
  }
}
