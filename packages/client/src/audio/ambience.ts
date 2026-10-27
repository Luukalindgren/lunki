import type { Sky } from '@lunki/shared';
import { loonCall, loonCallLength } from './loon';
import { rainPatter } from './rain';

/** Ympäristöäänten lähtötiedot: sää kuulijan kohdalla. */
export interface AmbienceInput {
  sky: Sky;
  windSpeed: number;
  /** Sateen voimakkuus 0–1. */
  rain: number;
  /** Päivänvalo 0–1 ja hämäryys 0–1 (ks. daylight); puuttuu = päivä. */
  light?: number;
  twilight?: number;
  /** Trombin imu kuulijan kohdalla 0–1 (spoutStrength); puuttuu = ei trombia. */
  spout?: number;
}

/** Valikon taustalla: tyyni kesäpäivä. */
export const MENU_AMBIENCE: AmbienceInput = { sky: 'calm', windSpeed: 2, rain: 0 };

/**
 * Tuuli, sade ja linnut. Tuuli on suodatettua silmukkakohinaa; sade on
 * pehmeää, tummaa kohinaa ja sen päällä erillisten pisaroiden ropinaa
 * (harva kerros heikolle ja tiheä kovalle sateelle). Ukkos- ja myrskysateessa
 * mukaan tulee rankkasade: tiheät, kovat iskut ja kohina, jotka ryöppyävät
 * tuulenpuuskien tahdissa. Voimakkuudet seuraavat
 * säätä; linnut sirkuttavat satunnaisesti
 * poutasäällä ja hiljenevät tuulen ja sateen yltyessä. Kuikat huutavat
 * kauempana järvellä, ja huuto kaikuu rannoista.
 */
export class Ambience {
  private readonly wind: GainNode;
  private readonly windFilter: BiquadFilterNode;
  /** Sateen pohjakohina sekä harva ja tiheä pisarakerros. */
  private readonly rainBed: GainNode;
  private readonly rainLight: GainNode;
  private readonly rainHeavy: GainNode;
  /** Rankkasade: kovat iskut ja ryöppyävä kohina. */
  private readonly rainPour: GainNode;
  private readonly rainRoar: GainNode;
  /** Trombin matala pauhu, joka voimistuu imun mukana. */
  private readonly spoutRoar: GainNode;
  private gust = 0;
  private gustTarget = 0;
  private gustTimer = 0;
  private birdTimer = 2;
  /** Ensimmäinen kuikka kuuluu pian, sitten harvemmin. */
  private loonTimer = 5 + Math.random() * 8;
  /** Kuikkien väylä: suora ääni ja rannoista palaava kaiku. */
  private readonly loons: GainNode;

  constructor(
    private readonly ctx: AudioContext,
    private readonly out: AudioNode,
  ) {
    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const loop = (filter: BiquadFilterNode, gain: GainNode) => {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      // Eri kohdasta alkava silmukka, jotta tuuli ja sade eivät kuulosta samalta.
      src.start(0, Math.random() * 2);
      src.connect(filter).connect(gain).connect(out);
    };
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 400;
    this.windFilter.Q.value = 0.8;
    this.wind = ctx.createGain();
    this.wind.gain.value = 0;
    loop(this.windFilter, this.wind);
    const rainFilter = ctx.createBiquadFilter();
    rainFilter.type = 'lowpass';
    rainFilter.frequency.value = 1200;
    rainFilter.Q.value = 0.3;
    this.rainBed = ctx.createGain();
    this.rainBed.gain.value = 0;
    loop(rainFilter, this.rainBed);
    // Eripituiset silmukat, jotta kerrosten yhdistelmä ei toistu korvin kuultavasti.
    this.rainLight = this.patterLayer(3.7, 30);
    this.rainHeavy = this.patterLayer(5.3, 120);
    this.rainPour = this.patterLayer(4.3, 450, true);
    const roarFilter = ctx.createBiquadFilter();
    roarFilter.type = 'bandpass';
    roarFilter.frequency.value = 1600;
    roarFilter.Q.value = 0.7;
    this.rainRoar = ctx.createGain();
    this.rainRoar.gain.value = 0;
    loop(roarFilter, this.rainRoar);
    const spoutFilter = ctx.createBiquadFilter();
    spoutFilter.type = 'lowpass';
    spoutFilter.frequency.value = 220;
    spoutFilter.Q.value = 1.2;
    this.spoutRoar = ctx.createGain();
    this.spoutRoar.gain.value = 0;
    loop(spoutFilter, this.spoutRoar);

    this.loons = ctx.createGain();
    this.loons.connect(out);
    const echo = ctx.createDelay(1);
    echo.delayTime.value = 0.42;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.32;
    const dull = ctx.createBiquadFilter();
    dull.type = 'lowpass';
    dull.frequency.value = 1400;
    this.loons.connect(echo).connect(dull).connect(feedback).connect(echo);
    dull.connect(out);
  }

  update(dt: number, w: AmbienceInput): void {
    // Puuskat: satunnainen tavoite, johon liu'utaan pehmeästi.
    this.gustTimer -= dt;
    if (this.gustTimer <= 0) {
      this.gustTarget = Math.random();
      this.gustTimer = 1.5 + Math.random() * 3;
    }
    this.gust += (this.gustTarget - this.gust) * Math.min(1, dt * 0.8);
    const strength = Math.min(1, w.windSpeed / 16);
    const t = this.ctx.currentTime;
    this.wind.gain.setTargetAtTime(0.04 + strength * (0.45 + 0.35 * this.gust) * strength, t, 0.3);
    this.windFilter.frequency.setTargetAtTime(300 + strength * 500 + this.gust * 300, t, 0.3);
    this.rainBed.gain.setTargetAtTime(w.rain * 0.25, t, 0.5);
    this.rainLight.gain.setTargetAtTime(Math.min(1, w.rain / 0.3) * 0.18, t, 0.5);
    this.rainHeavy.gain.setTargetAtTime(w.rain ** 1.5 * 0.15, t, 0.5);
    // Rankkasade alkaa ukkoskuuron sateesta (0,8) ja on täysillä myrskyssä (1).
    const pour = Math.max(0, Math.min(1, (w.rain - 0.65) / 0.35));
    const sheet = 0.6 + 0.8 * this.gust;
    this.rainPour.gain.setTargetAtTime(pour * 0.3 * sheet, t, 0.3);
    this.rainRoar.gain.setTargetAtTime(pour * 0.14 * sheet, t, 0.3);
    // Imualueen reunalla pauhu on jo selvä, keskellä se peittää kaiken muun.
    const spout = Math.sqrt(w.spout ?? 0);
    this.spoutRoar.gain.setTargetAtTime(spout * (1.2 + 0.4 * this.gust), t, 0.4);

    this.birdTimer -= dt;
    if (this.birdTimer <= 0) {
      const quiet = w.rain < 0.1 && w.windSpeed < 8 && (w.sky === 'calm' || w.sky === 'windy');
      // Yöllä linnut ovat hiljaa, aamulla ja illalla laulavat vielä.
      if (quiet && Math.random() < Math.min(1, (w.light ?? 1) * 1.6)) this.chirp();
      this.birdTimer = 2.5 + Math.random() * 6;
    }

    this.loonTimer -= dt;
    if (this.loonTimer <= 0) {
      // Kuikka huutaa myös sateella, mutta ei myrskyssä eikä kovassa tuulessa.
      const ok = w.windSpeed < 10 && w.rain < 0.6 && w.sky !== 'thunder' && w.sky !== 'storm';
      const length = ok ? this.loon() : 0;
      // Toinen kuikka vastaa joskus heti perään.
      // Kuikat ääntelevät eniten hämärässä ja yöllä.
      const dusk = Math.max(w.twilight ?? 0, 1 - (w.light ?? 1));
      this.loonTimer =
        ok && Math.random() < 0.3 + 0.2 * dusk
          ? length + 0.8
          : (18 + Math.random() * 40) * (1 - 0.5 * dusk);
    }
  }

  /** Silmukoituva pisarakerros; kanavilla omat pisarat, jolloin sade kuuluu laajana. */
  private patterLayer(seconds: number, dropsPerSecond: number, hard = false): GainNode {
    const ctx = this.ctx;
    const buffer = ctx.createBuffer(2, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++)
      buffer.copyToChannel(
        rainPatter(ctx.sampleRate, seconds, dropsPerSecond, Math.random, hard),
        ch,
      );
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.start(0, Math.random() * seconds);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(gain).connect(this.out);
    return gain;
  }

  /** Kuikan huuto tai laulu jostain päin järveä. Palauttaa kutsun keston (s). */
  private loon(): number {
    const notes = loonCall(Math.random() < 0.55 ? 'wail' : 'song');
    const ctx = this.ctx;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.8 - 0.9;
    // Kaukainen ääni on vaimeampi ja tummempi.
    const far = Math.random();
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 3200 - far * 1600;
    const level = ctx.createGain();
    level.gain.value = 0.11 - far * 0.06;
    tone.connect(level).connect(pan).connect(this.loons);
    const t0 = ctx.currentTime + 0.05;
    for (const n of notes) {
      const t = t0 + n.at;
      const end = t + n.dur;
      const osc = ctx.createOscillator();
      // Kolmioaalto: pehmeä, huilumainen sävy, jossa on hieman yläsäveliä.
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(n.pitch[0]![1], t);
      for (const [at, f] of n.pitch.slice(1)) osc.frequency.linearRampToValueAtTime(f, t + at);
      if (n.vibrato > 0) {
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 5 + Math.random();
        const depth = ctx.createGain();
        // Vibrato voimistuu sävelen edetessä.
        depth.gain.setValueAtTime(0, t);
        depth.gain.linearRampToValueAtTime(n.vibrato, t + n.dur * 0.7);
        lfo.connect(depth).connect(osc.frequency);
        lfo.start(t);
        lfo.stop(end);
      }
      const gain = ctx.createGain();
      const attack = Math.min(0.12, n.dur * 0.3);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(n.peak, t + attack);
      gain.gain.setValueAtTime(n.peak, end - Math.min(0.3, n.dur * 0.4));
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(gain).connect(tone);
      osc.start(t);
      osc.stop(end + 0.02);
    }
    return loonCallLength(notes);
  }

  /** Lintu: muutama nopea, nouseva tai laskeva vihellys. */
  private chirp(): void {
    const base = 2200 + Math.random() * 1800;
    const notes = 2 + Math.floor(Math.random() * 4);
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.6 - 0.8;
    pan.connect(this.out);
    const t0 = this.ctx.currentTime + 0.05;
    for (let i = 0; i < notes; i++) {
      const t = t0 + i * (0.09 + Math.random() * 0.05);
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      const f = base * (1 + (Math.random() - 0.5) * 0.3);
      osc.frequency.setValueAtTime(f, t);
      osc.frequency.exponentialRampToValueAtTime(f * (Math.random() < 0.5 ? 1.3 : 0.75), t + 0.07);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
      osc.connect(gain).connect(pan);
      osc.start(t);
      osc.stop(t + 0.1);
    }
  }
}
