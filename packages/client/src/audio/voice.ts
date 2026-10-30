/**
 * Puheäänet (#229): kalastaja kiroilee ja tuskailee suomeksi käsimerkkien ja
 * pelin tapahtumien yhteydessä. Repliikit ovat tiedostoina
 * `public/audio/puhe/<tunniste>-<n>.mp3`; ne voi korvata omilla äänityksillä
 * samoilla nimillä (käsikirjoitus: scripts/puhe/repliikit.json). Tiedostot
 * ladataan vasta, kun niitä tarvitaan, joten pelin käynnistys ei hidastu.
 */

/** Repliikkien määrä tunnisteittain; pidettävä samana kuin repliikit.json. */
export const VOICE_LINES = {
  wave: 5,
  thumbsUp: 5,
  middleFinger: 5,
  fist: 5,
  comeHere: 4,
  bigFish: 4,
  lineBroken: 3,
  escaped: 4,
  capsized: 3,
  snagged: 3,
  lureLost: 3,
  stuck: 3,
  bitOff: 2,
  missed: 3,
  bigCatch: 3,
  fouled: 2,
  tangled: 2,
  lightning: 2,
} as const;

export type VoiceId = keyof typeof VOICE_LINES;

/** Etäisyydet (m): lähellä täysi voimakkuus, kaukana hiljaa, sen jälkeen ei kuulu. */
export const VOICE_RANGE = { near: 10, quiet: 50, far: 80 } as const;

export const voiceFile = (id: VoiceId, n: number) => `audio/puhe/${id}-${n}.mp3`;

/** Arpoo repliikin 1…count niin, ettei sama tule kahdesti peräkkäin. */
export function pickLine(count: number, last: number | undefined, random = Math.random): number {
  if (count <= 1) return 1;
  const avoid = last !== undefined && last >= 1 && last <= count;
  const n = 1 + Math.floor(random() * (avoid ? count - 1 : count));
  return avoid && n >= last ? n + 1 : n;
}

/**
 * Voimakkuus etäisyyden mukaan: täysi lähellä, 50 m:ssä enää kolmannes ja
 * 80 m:n päässä ei kuulu lainkaan.
 */
export function voiceFalloff(distance: number): number {
  const { near, quiet, far } = VOICE_RANGE;
  if (distance <= near) return 1;
  if (distance <= quiet) return 1 - ((distance - near) / (quiet - near)) * 0.7;
  return Math.max(0, 0.3 * (1 - (distance - quiet) / (far - quiet)));
}

export interface VoiceOptions {
  /** 0–1, kerrotaan väylän voimakkuuteen. */
  gain?: number;
  /** Stereosuunta -1 (vasen) … 1 (oikea). */
  pan?: number;
  /** Puhuja: saman puhujan edellinen repliikki katkaistaan. */
  speaker?: string;
}

/** Lataa ja soittaa repliikit omalle väylälleen. */
export class VoicePlayer {
  private readonly buffers = new Map<string, Promise<AudioBuffer | null>>();
  private readonly last = new Map<VoiceId, number>();
  private readonly playing = new Map<string, AudioBufferSourceNode>();

  constructor(
    private readonly ctx: AudioContext,
    private readonly bus: AudioNode,
    private readonly base = import.meta.env.BASE_URL,
    /** Repliikki alkaa: kesto (s) ja voimakkuus väistöä varten (#411). */
    private readonly onStart?: (duration: number, gain: number) => void,
  ) {}

  /** Lataa tunnisteiden repliikit taustalla valmiiksi. */
  preload(ids: readonly VoiceId[]): void {
    for (const id of ids) for (let n = 1; n <= VOICE_LINES[id]; n++) void this.load(id, n);
  }

  play(id: VoiceId, opts: VoiceOptions = {}): void {
    const gain = opts.gain ?? 1;
    if (gain <= 0.01) return;
    const n = pickLine(VOICE_LINES[id], this.last.get(id));
    this.last.set(id, n);
    void this.load(id, n).then((buffer) => {
      if (!buffer) return;
      const key = opts.speaker ?? '';
      try {
        this.playing.get(key)?.stop();
      } catch {
        // jo loppunut
      }
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      const g = this.ctx.createGain();
      g.gain.value = gain;
      let out: AudioNode = src.connect(g);
      // StereoPannerNode puuttuu vanhoista Safareista; silloin ääni tulee keskeltä.
      if (opts.pan && typeof this.ctx.createStereoPanner === 'function') {
        const p = this.ctx.createStereoPanner();
        p.pan.value = Math.max(-1, Math.min(1, opts.pan));
        out = out.connect(p);
      }
      out.connect(this.bus);
      this.playing.set(key, src);
      src.onended = () => {
        if (this.playing.get(key) === src) this.playing.delete(key);
      };
      src.start();
      this.onStart?.(buffer.duration, gain);
    });
  }

  private load(id: VoiceId, n: number): Promise<AudioBuffer | null> {
    const url = this.base + voiceFile(id, n);
    let p = this.buffers.get(url);
    if (!p) {
      p = fetch(url)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
        .then((data) => this.ctx.decodeAudioData(data))
        .catch(() => null);
      this.buffers.set(url, p);
    }
    return p;
  }
}
