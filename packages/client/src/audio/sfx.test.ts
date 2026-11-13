import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Sfx } from './sfx';

/** Äänisolmun parametri, joka muistaa viimeisen tavoitteensa. */
class FakeParam {
  value = 0;
  target = 0;
  setTargetAtTime(v: number): void {
    this.target = v;
  }
  setValueAtTime(): void {}
  linearRampToValueAtTime(): void {}
  exponentialRampToValueAtTime(): void {}
  cancelScheduledValues(): void {}
}

class FakeNode {
  readonly gain = new FakeParam();
  readonly frequency = new FakeParam();
  readonly Q = new FakeParam();
  readonly pan = new FakeParam();
  readonly delayTime = new FakeParam();
  readonly threshold = new FakeParam();
  readonly knee = new FakeParam();
  readonly ratio = new FakeParam();
  readonly attack = new FakeParam();
  readonly release = new FakeParam();
  readonly outputs: unknown[] = [];
  buffer: unknown = null;
  loop = false;
  type = '';
  started = false;
  stopped = false;
  onended: (() => void) | null = null;
  connect<T>(to: T): T {
    this.outputs.push(to);
    return to;
  }
  start(): void {
    this.started = true;
  }
  stop(): void {
    this.stopped = true;
  }
}

/** WebAudion korvike: kirjaa luodut solmut, ei soita mitään. */
class FakeContext {
  static last: FakeContext;
  readonly sampleRate = 8000;
  readonly destination = new FakeNode();
  readonly gains: FakeNode[] = [];
  readonly sources: FakeNode[] = [];
  currentTime = 0;
  state = 'running';
  constructor() {
    FakeContext.last = this;
  }
  createGain(): FakeNode {
    const g = new FakeNode();
    g.gain.value = 1;
    this.gains.push(g);
    return g;
  }
  createBufferSource(): FakeNode {
    const s = new FakeNode();
    this.sources.push(s);
    return s;
  }
  createBiquadFilter = () => new FakeNode();
  createStereoPanner = () => new FakeNode();
  createDelay = () => new FakeNode();
  createDynamicsCompressor = () => new FakeNode();
  createOscillator = () => new FakeNode();
  createBuffer(channels: number, length: number) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return {
      length,
      getChannelData: (ch: number) => data[ch]!,
      copyToChannel: (from: Float32Array, ch: number) => data[ch]!.set(from),
    };
  }
}

const STORM = { sky: 'storm', windSpeed: 14, rain: 1 } as const;

describe('kisan äänten portti', () => {
  beforeEach(() => {
    vi.stubGlobal('AudioContext', FakeContext);
    vi.stubGlobal('document', { addEventListener: () => {}, visibilityState: 'visible' });
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} });
  });
  afterEach(() => vi.unstubAllGlobals());

  /** Avattu Sfx ja sen ympäristöäänten silmukat (sade, tuuli, trombi). */
  function unlocked() {
    const sfx = new Sfx();
    sfx.unlock();
    const ctx = FakeContext.last;
    // Portti ja sen jälkeen luodut silmukat alkavat hiljaisina; väylien ja
    // kaiun vahvistukset eivät.
    const [gate, ...loops] = ctx.gains.filter((g) => g.gain.value === 0);
    return { sfx, ctx, gate: gate!, loops };
  }

  const loud = (nodes: FakeNode[]) => nodes.filter((g) => g.gain.target > 0).length;

  it('valikossa sää ei soi eikä jyrähdä', () => {
    const { sfx, ctx, loops } = unlocked();
    const before = ctx.sources.length;
    sfx.updateAmbience(0.1, STORM);
    sfx.thunder(100, 0.3);
    expect(loud(loops)).toBe(0);
    expect(ctx.sources.length).toBe(before);
  });

  it('kisassa myrsky kuuluu, ja kisan päättyessä kaikki vaikenee', () => {
    const { sfx, ctx, gate, loops } = unlocked();
    const before = ctx.sources.length;
    sfx.setRaceAudio(true);
    sfx.updateAmbience(0.1, STORM);
    sfx.thunder(100, 3);
    expect(gate.gain.target).toBe(1);
    expect(loud(loops)).toBeGreaterThan(4);
    const claps = ctx.sources.slice(before);
    expect(claps).toHaveLength(1);
    expect(claps[0]!.started).toBe(true);

    sfx.setRaceAudio(false);
    expect(gate.gain.target).toBe(0);
    expect(loud(loops)).toBe(0);
    // Viiveellä tuleva jyrähdys ei soi enää valikossa eikä seuraavassa kisassa.
    expect(claps[0]!.stopped).toBe(true);

    // Uusi kisa alkaa hiljaisuudesta, kunnes sen oma sää päivittyy.
    sfx.setRaceAudio(true);
    expect(loud(loops)).toBe(0);
    sfx.updateAmbience(0.1, STORM);
    expect(loud(loops)).toBeGreaterThan(4);
  });
});
