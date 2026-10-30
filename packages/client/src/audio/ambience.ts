import type { Season, Sky, Vec2 } from '@lunki/shared';
import { loonCall, loonCallLength } from './loon';
import { craneCall, gooseFlock, type CallNote } from './seasonCalls';
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
  /** Lähimmän trombin läheisyys 0–1 (1 = keskellä); puuttuu = ei trombia. */
  spout?: number;
  /** Lähimmän trombin suunta -1 (vasen) … 1 (oikea). */
  spoutPan?: number;
  /** Kuulijan oikea suunta järvellä (yksikkövektori); puuttuu = itä. */
  right?: Vec2;
  /** Vuodenaika (#427); puuttuu = kesä. */
  season?: Season;
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
 *
 * Vuodenaika (#427): keväällä lintuja on eniten (aamukonsertti) ja kurjet
 * toitottavat, kesäiltana hyttynen ininää korvan ohi, ja syksyllä laulu on
 * hiljennyt, kuikat ovat harvassa ja kurki- ja hanhiaurat lentävät etelään.
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
  /** Trombin pauhu: tumma, sykkivä kohina, joka voimistuu lähestyessä. */
  private readonly spout: GainNode;
  private readonly spoutFilter: BiquadFilterNode;
  private readonly spoutPan: StereoPannerNode | null;
  private spoutPhase = 0;
  private gust = 0;
  private gustTarget = 0;
  private gustTimer = 0;
  private birdTimer = 2;
  /** Ensimmäinen kuikka kuuluu pian, sitten harvemmin. */
  private loonTimer = 5 + Math.random() * 8;
  /** Kuikkien väylä: suora ääni ja rannoista palaava kaiku. */
  private readonly loons: GainNode;
  /** Huutavan kuikan suunta järvellä: pysyy paikallaan, kun kuulija kääntyy. */
  private loonAt: { pan: StereoPannerNode; dir: Vec2 } | null = null;
  private right: Vec2 = { x: 1, y: 0 };
  /** Kauden oma ääni: kurki, hanhiaura tai hyttynen. */
  private seasonTimer = 12 + Math.random() * 20;

  constructor(
    private readonly ctx: AudioContext,
    private readonly out: AudioNode,
  ) {
    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const loop = (filter: BiquadFilterNode, gain: GainNode, to: AudioNode = out) => {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      // Eri kohdasta alkava silmukka, jotta tuuli ja sade eivät kuulosta samalta.
      src.start(0, Math.random() * 2);
      src.connect(filter).connect(gain).connect(to);
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

    this.spoutFilter = ctx.createBiquadFilter();
    this.spoutFilter.type = 'lowpass';
    this.spoutFilter.frequency.value = 200;
    this.spoutFilter.Q.value = 1.5;
    this.spout = ctx.createGain();
    this.spout.gain.value = 0;
    // Trombi pauhaa omasta suunnastaan; tuuli ja sade ympäröivät kuulijan.
    // StereoPannerNode puuttuu vanhoista Safareista; silloin pauhu tulee keskeltä.
    this.spoutPan = typeof ctx.createStereoPanner === 'function' ? ctx.createStereoPanner() : null;
    this.spoutPan?.connect(out);
    loop(this.spoutFilter, this.spout, this.spoutPan ?? out);

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
    const season = w.season ?? 'summer';
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
    // Trombi pauhaa ja sykkii; lähellä kovempaa, korkeammalta ja nopeammin.
    const near = Math.max(0, Math.min(1, w.spout ?? 0));
    this.spoutPhase += dt * (1.5 + near * 4);
    const throb = 0.75 + 0.25 * Math.sin(this.spoutPhase * Math.PI * 2);
    this.spout.gain.setTargetAtTime(near * near * 1.4 * throb, t, 0.15);
    this.spoutFilter.frequency.setTargetAtTime(160 + near * 380, t, 0.3);
    this.spoutPan?.pan.setTargetAtTime(w.spoutPan ?? 0, t, 0.2);
    this.right = w.right ?? { x: 1, y: 0 };
    if (this.loonAt) this.loonAt.pan.pan.setTargetAtTime(this.loonPan(this.loonAt.dir), t, 0.1);

    this.birdTimer -= dt;
    if (this.birdTimer <= 0) {
      const quiet = w.rain < 0.1 && w.windSpeed < 8 && (w.sky === 'calm' || w.sky === 'windy');
      // Yöllä linnut ovat hiljaa, aamulla ja illalla laulavat vielä.
      if (quiet && Math.random() < Math.min(1, (w.light ?? 1) * 1.6)) this.chirp();
      // Keväällä lintuja on eniten, varsinkin aamuhämärässä; syksyllä laulu on hiljennyt.
      const chorus =
        season === 'spring' ? 1.8 + 1.5 * (w.twilight ?? 0) : season === 'autumn' ? 0.15 : 1;
      this.birdTimer = (2.5 + Math.random() * 6) / chorus;
    }

    this.loonTimer -= dt;
    if (this.loonTimer <= 0) {
      // Kuikka huutaa myös sateella, mutta ei myrskyssä eikä kovassa tuulessa.
      const ok = w.windSpeed < 10 && w.rain < 0.6 && w.sky !== 'thunder' && w.sky !== 'storm';
      const length = ok ? this.loon() : 0;
      // Toinen kuikka vastaa joskus heti perään.
      // Kuikat ääntelevät eniten hämärässä ja yöllä.
      const dusk = Math.max(w.twilight ?? 0, 1 - (w.light ?? 1));
      // Lokakuussa useimmat kuikat ovat jo lähteneet.
      this.loonTimer =
        ok && Math.random() < 0.3 + 0.2 * dusk
          ? length + 0.8
          : (18 + Math.random() * 40) * (1 - 0.5 * dusk) * (season === 'autumn' ? 3 : 1);
    }

    this.seasonTimer -= dt;
    if (this.seasonTimer <= 0) this.seasonTimer = this.seasonCall(season, w);
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

  /** Kauden ääni, jos sää sallii. Palauttaa ajan seuraavaan (s). */
  private seasonCall(season: Season, w: AmbienceInput): number {
    const calm = w.windSpeed < 10 && w.rain < 0.6 && w.sky !== 'thunder' && w.sky !== 'storm';
    const dusk = Math.max(w.twilight ?? 0, 1 - (w.light ?? 1));
    if (season === 'summer') {
      // Hyttynen vain tyynenä iltana ja yönä.
      if (dusk > 0.3 && w.windSpeed < 3 && w.rain < 0.1) this.mosquito();
      return 10 + Math.random() * 18;
    }
    if (!calm) return 20 + Math.random() * 20;
    if (season === 'autumn' && Math.random() < 0.6) this.call(gooseFlock(), 'sawtooth', 900, 0.07);
    else if (season === 'spring' || season === 'autumn')
      this.call(craneCall(), 'sawtooth', 1500, 0.08);
    else return 60;
    return 40 + Math.random() * 50;
  }

  /** Hyttynen ininää korvan ohi: ohut, väreilevä ääni, joka kulkee puolelta toiselle. */
  private mosquito(): void {
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.05;
    const dur = 1.8 + Math.random() * 1.5;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 560 + Math.random() * 120;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 7 + Math.random() * 3;
    const depth = ctx.createGain();
    depth.gain.value = 22;
    lfo.connect(depth).connect(osc.frequency);
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1300;
    band.Q.value = 2;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.03, t + dur * 0.45);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const pan = ctx.createStereoPanner();
    const side = Math.random() < 0.5 ? -1 : 1;
    pan.pan.setValueAtTime(-0.8 * side, t);
    pan.pan.linearRampToValueAtTime(0.8 * side, t + dur);
    osc.connect(band).connect(gain).connect(pan).connect(this.out);
    for (const o of [osc, lfo]) {
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }

  /** Kuikan huuto tai laulu jostain päin järveä. Palauttaa kutsun keston (s). */
  private loon(): number {
    return this.call(loonCall(Math.random() < 0.55 ? 'wail' : 'song'), 'triangle', 3200, 0.11);
  }

  /**
   * Linnun kutsu jostain päin järveä rannoista kaikuen. Aaltomuoto ja
   * suodin antavat sävyn: kuikalla pehmeä kolmio, kurjella ja hanhella
   * räikeämpi saha. Palauttaa kutsun keston (s).
   */
  private call(notes: CallNote[], wave: OscillatorType, bright: number, loud: number): number {
    const ctx = this.ctx;
    const pan = ctx.createStereoPanner();
    // Lintu huutaa jostain päin järveä; suunta seuraa kuulijan kääntymistä (update).
    const angle = Math.random() * Math.PI * 2;
    const dir = { x: Math.cos(angle), y: Math.sin(angle) };
    this.loonAt = { pan, dir };
    pan.pan.value = this.loonPan(dir);
    // Kaukainen ääni on vaimeampi ja tummempi.
    const far = Math.random();
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = bright * (1 - far * 0.5);
    const level = ctx.createGain();
    level.gain.value = loud * (1 - far * 0.55);
    tone.connect(level).connect(pan).connect(this.loons);
    const t0 = ctx.currentTime + 0.05;
    for (const n of notes) {
      const t = t0 + n.at;
      const end = t + n.dur;
      const osc = ctx.createOscillator();
      osc.type = wave;
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
      if (n.trill) {
        // Kurjen rullaava ääni: nopea voimakkuuden värinä.
        const roll = ctx.createGain();
        roll.gain.value = 0.6;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = n.trill;
        const amount = ctx.createGain();
        amount.gain.value = 0.4;
        lfo.connect(amount).connect(roll.gain);
        lfo.start(t);
        lfo.stop(end);
        osc.connect(gain).connect(roll).connect(tone);
      } else osc.connect(gain).connect(tone);
      osc.start(t);
      osc.stop(end + 0.02);
    }
    return loonCallLength(notes);
  }

  /** Kuikan suunta kuulijasta -1…1. */
  private loonPan(dir: Vec2): number {
    return (dir.x * this.right.x + dir.y * this.right.y) * 0.9;
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
