import { Ambience, type AmbienceInput } from './ambience';
import { Music } from './music';
import { thunderClap } from './thunder';
import { VoicePlayer, type VoiceId, type VoiceOptions } from './voice';
import {
  DUCKS,
  DUCK_TIME,
  MIX,
  duckSchedule,
  type ActiveDuck,
  type DuckId,
  type DuckedBus,
} from './mix';
import { loadAudioSettings, saveAudioSettings, volumeGain, type AudioSettings } from './settings';

/**
 * Yksinkertaiset retroäänet WebAudiolla, ilman äänitiedostoja. Ääni käynnistyy
 * vasta ensimmäisestä käyttäjän painalluksesta (selainten autoplay-sääntö).
 * Tehosteilla, ympäristöäänillä ja musiikilla on omat voimakkuutensa
 * (`MIX`), ja tärkeä ääni hiljentää ympäristöä ja musiikkia hetkeksi (`DUCKS`).
 */
/** Tehosteen paikka: voimakkuus 0–1, suunta -1…1 ja kaukaisen äänen alipäästö (Hz). */
export interface Place {
  gain: number;
  pan?: number;
  cutoff?: number;
}

const HERE: Place = { gain: 1 };

/** Yhteisen kohinapuskurin pituus (s); pisin kohinatehoste on tätä lyhyempi. */
const NOISE_SECONDS = 2;

/** Salama tätä lähempänä (m) hiljentää ympäristöä ja musiikkia, lähellä eniten. */
const THUNDER_DUCK_RANGE = 1500;

export class Sfx {
  private ctx: AudioContext | null = null;
  /** Tehosteiden väylä. */
  private master: GainNode | null = null;
  private ambienceBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  /** Väistön kertoimet väylän perässä; pelaajan voimakkuus pysyy omassa solmussaan. */
  private readonly ducked = new Map<DuckedBus, { node: GainNode; active: ActiveDuck[] }>();
  private voiceBus: GainNode | null = null;
  private voices: VoicePlayer | null = null;
  /** Ukkosen oma väylä: kovempi kuin muut tehosteet, rajoitin estää säröytymisen. */
  private thunderBus: GainNode | null = null;
  private ambience: Ambience | null = null;
  private music: Music | null = null;
  private settings: AudioSettings = loadAudioSettings();
  /** Tehosteiden paikka `at`-kutsun ajan: voimakkuus, suunta ja tummuus. */
  private place: Place = HERE;
  /** Paikan suunta- ja suodinketjut väylittäin `at`-kutsun ajan. */
  private routes = new Map<AudioNode, AudioNode>();
  /** Yhteinen kohinapuskuri: tehosteet soittavat siitä eri kohdista. */
  private noiseBuffer: AudioBuffer | null = null;
  muted = false;

  /** Kutsutaan käyttäjän syötteestä. */
  unlock(): void {
    if (this.ctx) {
      // iOS keskeyttää äänen ('interrupted') puhelun tai taustalle siirron ajaksi.
      if (this.ctx.state !== 'running' && this.ctx.state !== 'closed') void this.ctx.resume();
      return;
    }
    try {
      this.ctx = new AudioContext();
      const ctx = this.ctx;
      const bus = (duck?: DuckedBus) => {
        const g = ctx.createGain();
        if (duck) {
          const node = ctx.createGain();
          g.connect(node).connect(ctx.destination);
          this.ducked.set(duck, { node, active: [] });
        } else g.connect(ctx.destination);
        return g;
      };
      this.master = bus();
      this.ambienceBus = bus('ambience');
      this.musicBus = bus('music');
      this.voiceBus = bus();
      this.voices = new VoicePlayer(ctx, this.voiceBus, undefined, (duration, gain) =>
        this.duck('voice', gain, duration),
      );
      const noise = ctx.createBuffer(1, ctx.sampleRate * NOISE_SECONDS, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuffer = noise;
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
      // Taustalla olevassa välilehdessä peli ei piirry: tuuli, sade ja musiikki
      // vaikenevat ja jatkuvat samasta kohdasta, kun välilehti palaa esiin.
      document.addEventListener('visibilitychange', () => this.onVisibility());
    } catch {
      this.ctx = null;
    }
  }

  private onVisibility(): void {
    if (!this.ctx || this.ctx.state === 'closed') return;
    if (document.visibilityState === 'hidden') void this.ctx.suspend();
    else void this.ctx.resume();
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
    const s = this.settings;
    this.master.gain.setTargetAtTime(MIX.effects * volumeGain(s.effects), t, 0.05);
    this.thunderBus.gain.setTargetAtTime(MIX.thunder * volumeGain(s.effects), t, 0.05);
    this.ambienceBus.gain.setTargetAtTime(MIX.ambience * volumeGain(s.ambience), t, 0.2);
    this.musicBus.gain.setTargetAtTime(MIX.music * volumeGain(s.music), t, 0.2);
    this.voiceBus?.gain.setTargetAtTime(MIX.voice * volumeGain(s.voice), t, 0.05);
    this.music?.setChoice(this.settings.musicTrack);
    if (this.settings.music > 0) this.music?.start();
    else this.music?.stop();
  }

  /** Puherepliikki (#229); ei mitään, jos puheäänet on mykistetty. */
  voice(id: VoiceId, opts?: VoiceOptions): void {
    if (this.muted || this.settings.voice === 0) return;
    this.voices?.play(id, opts);
  }

  /**
   * Soittaa `play`-kutsun tehosteet paikasta `place`: voimakkuudella `gain`
   * (0–1), suunnasta `pan` (-1…1) ja kaukaa tummempana (`cutoff`, Hz).
   */
  at(place: Place, play: () => void): void {
    const prev = this.place;
    const routes = this.routes;
    this.place = place;
    this.routes = new Map();
    try {
      play();
    } finally {
      this.place = prev;
      this.routes = routes;
    }
  }

  /**
   * Väistö (#411): hiljentää ympäristöä ja musiikkia `DUCKS`-taulukon mukaan
   * `delay` sekunnin päästä `hold` sekunniksi. `scale` (0–1) heikentää
   * kaukaisen äänen väistöä.
   */
  duck(id: DuckId, scale = 1, hold?: number, delay = 0): void {
    if (!this.ctx || scale <= 0) return;
    const d = DUCKS[id];
    const now = this.ctx.currentTime;
    const from = now + delay;
    const until = from + (hold ?? d.hold);
    for (const [bus, { node, active }] of this.ducked) {
      const live = active.filter((a) => a.until > now);
      live.push({ from, until, db: d[bus] * Math.min(1, scale) });
      this.ducked.set(bus, { node, active: live });
      const g = node.gain;
      g.cancelScheduledValues(now);
      let level = g.value;
      for (const step of duckSchedule(live, now)) {
        const tau = step.gain < level ? DUCK_TIME.attack : DUCK_TIME.release;
        g.setTargetAtTime(step.gain, step.at, tau);
        level = step.gain;
      }
    }
  }

  /** Tapahtumien repliikit vain, jos pelaaja on ne valinnut. */
  eventVoice(id: VoiceId): void {
    if (this.settings.eventVoices) this.voice(id, { speaker: 'me' });
  }

  /** Lataa repliikit taustalla, kun puheäänet ovat käytössä. */
  preloadVoices(ids: readonly VoiceId[]): void {
    if (this.settings.voice > 0) this.voices?.preload(ids);
  }

  /** Ympäristöäänet seuraavat säätä; kutsutaan joka päivityksessä. */
  updateAmbience(dt: number, w: AmbienceInput): void {
    if (this.settings.ambience > 0) this.ambience?.update(dt, w);
  }

  /** Heitto: viuhahdus, voimakkaampi kovalla heitolla. */
  cast(power: number): void {
    this.noise(0.25, 0.25 + power * 0.35, 1200 + power * 2500, 0.15);
  }

  /**
   * Perhosiiman suhina ilmassa (#236): kestää silmukan aukeamisen ajan, ja
   * nopea siima suhisee kovempaa ja kirkkaammin.
   */
  flySwish(speed: number, duration: number): void {
    const k = Math.max(0, Math.min(1, speed));
    this.noise(Math.max(0.15, Math.min(1.2, duration)), 0.1 + k * 0.3, 500 + k * 2600, 0.12);
  }

  /** Liian aikainen suunnanvaihto: siima läimähtää kuin piiska. */
  flyCrack(): void {
    this.noise(0.04, 0.7, 7000);
    this.tone(2400, 0.025, 'square', 0.25);
  }

  /** Siima suoristui: vaimea nykäys vavassa. */
  flyTug(): void {
    this.tone(150, 0.07, 'square', 0.35, 0, 90);
    this.tone(1400, 0.02, 'square', 0.2);
  }

  /** Siimakäden veto osui heittoon (#398): nopea siiman sujahdus ohjaimien läpi. */
  flyHaul(): void {
    this.noise(0.06, 0.22, 3200);
    this.tone(420, 0.06, 'square', 0.18, 0, 840);
  }

  /** Perho laskeutuu veteen: kevyt lipsahdus, popperi isommin. */
  flyLand(big: boolean): void {
    this.noise(big ? 0.16 : 0.09, big ? 0.35 : 0.14, big ? 1600 : 1100);
  }

  /** Popperin pulpahdus vedettäessä. */
  pop(): void {
    this.tone(260, 0.07, 'sine', 0.6, 0, 720);
    this.noise(0.06, 0.25, 1300);
  }

  /** Siima sihisee sormien ja ohjainten läpi. */
  lineHiss(): void {
    this.noise(0.07, 0.12, 4500);
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

  /** Jigi kolahtaa kivikkopohjaan: lyhyt, kova naksahdus. */
  rattle(): void {
    this.tone(1400 + Math.random() * 600, 0.02, 'square', 0.18);
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

  /** Kala nousi pintaan (#369): hiljainen pisaran "plip", sävel nousee. */
  plip(): void {
    this.tone(700 + Math.random() * 500, 0.07, 'sine', 0.35, 0, 1600);
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
    // Lähisalaman jyrähdys peittää sateen ja musiikin, kaukainen vähemmän.
    this.duck('thunder', 1 - distance / THUNDER_DUCK_RANGE, undefined, delay);
  }

  private playThunder(distance: number, volume: number, delay: number): void {
    if (this.muted || !this.ctx || !this.thunderBus) return;
    const data = thunderClap(this.ctx.sampleRate, distance);
    const buffer = this.ctx.createBuffer(1, data.length, this.ctx.sampleRate);
    buffer.copyToChannel(data, 0);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.value = volume * this.place.gain;
    src.connect(gain).connect(this.route(this.thunderBus));
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
    gain.gain.setValueAtTime(volume * this.place.gain, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain).connect(this.route(this.master));
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  /**
   * Kohinatehoste: yhteisen kohinapuskurin satunnainen kohta, joka nousee
   * `attack` sekunnissa ja hiipuu tasaisesti nollaan `duration` sekunnissa.
   */
  private noise(duration: number, volume: number, cutoff = 1800, attack = 0, delay = 0): void {
    if (this.muted || !this.ctx || !this.master || !this.noiseBuffer) return;
    const dur = Math.min(duration, NOISE_SECONDS);
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const gain = this.ctx.createGain();
    const peak = volume * this.place.gain;
    const rise = Math.min(attack, dur);
    gain.gain.setValueAtTime(rise > 0 ? 0 : peak, t);
    if (rise > 0) gain.gain.linearRampToValueAtTime(peak * (1 - rise / dur), t + rise);
    gain.gain.linearRampToValueAtTime(0, t + dur);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    src.connect(filter).connect(gain).connect(this.route(this.master));
    src.start(t, Math.random() * (NOISE_SECONDS - dur), dur);
  }

  /**
   * Väylä `bus` paikan kautta: suunta (StereoPannerNode) ja kaukaisen äänen
   * alipäästö. Sama ketju kaikille saman `at`-kutsun tehosteille.
   */
  private route(bus: AudioNode): AudioNode {
    const { pan = 0, cutoff } = this.place;
    const ctx = this.ctx;
    if (!ctx || (!pan && !cutoff)) return bus;
    let node = this.routes.get(bus);
    if (node) return node;
    node = bus;
    // StereoPannerNode puuttuu vanhoista Safareista; silloin ääni tulee keskeltä.
    if (pan && typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      p.connect(node);
      node = p;
    }
    if (cutoff) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = cutoff;
      f.connect(node);
      node = f;
    }
    this.routes.set(bus, node);
    return node;
  }
}
