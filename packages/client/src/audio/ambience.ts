import type { Sky } from '@lunki/shared';

/** Ympäristöäänten lähtötiedot: sää kuulijan kohdalla. */
export interface AmbienceInput {
  sky: Sky;
  windSpeed: number;
  /** Sateen voimakkuus 0–1. */
  rain: number;
}

/** Valikon taustalla: tyyni kesäpäivä. */
export const MENU_AMBIENCE: AmbienceInput = { sky: 'calm', windSpeed: 2, rain: 0 };

/**
 * Tuuli, sade ja linnut. Tuuli ja sade ovat suodatettua silmukkakohinaa,
 * jonka voimakkuus seuraa säätä; linnut sirkuttavat satunnaisesti
 * poutasäällä ja hiljenevät tuulen ja sateen yltyessä.
 */
export class Ambience {
  private readonly wind: GainNode;
  private readonly windFilter: BiquadFilterNode;
  private readonly rain: GainNode;
  private gust = 0;
  private gustTarget = 0;
  private gustTimer = 0;
  private birdTimer = 2;

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
    rainFilter.type = 'highpass';
    rainFilter.frequency.value = 2500;
    this.rain = ctx.createGain();
    this.rain.gain.value = 0;
    loop(rainFilter, this.rain);
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
    this.rain.gain.setTargetAtTime(w.rain * 0.4, t, 0.5);

    this.birdTimer -= dt;
    if (this.birdTimer <= 0) {
      const quiet = w.rain < 0.1 && w.windSpeed < 8 && (w.sky === 'calm' || w.sky === 'windy');
      if (quiet) this.chirp();
      this.birdTimer = 2.5 + Math.random() * 6;
    }
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
