/** Saderopinan kerroksen äänekkyys (RMS) ennen voimakkuussäätöä. */
export const RAIN_LAYER_RMS = 0.2;

/**
 * Silmukoituva saderopina: erillisiä pisaroita veden pinnassa. Suurin osa
 * pisaroista on lyhyitä napsahduksia, osa pieniä "plip"-kuplia, joiden sävel
 * nousee. Pisarat kiertyvät lopusta alkuun, joten silmukka on saumaton.
 */
export function rainPatter(
  sampleRate: number,
  seconds: number,
  dropsPerSecond: number,
  rand: () => number = Math.random,
): Float32Array<ArrayBuffer> {
  const len = Math.floor(sampleRate * seconds);
  const out = new Float32Array(len);
  const drops = Math.round(dropsPerSecond * seconds);
  for (let d = 0; d < drops; d++) {
    const start = Math.floor(rand() * len);
    // Hiljaisia pisaroita on paljon, kovia vähän.
    const amp = 0.15 + 0.85 * rand() ** 3;
    if (rand() < 0.3) bubble(out, start, sampleRate, amp * 0.6, rand);
    else tick(out, start, sampleRate, amp, rand);
  }
  lowpass(out, sampleRate, 4500);
  const rms = Math.sqrt(out.reduce((s, v) => s + v * v, 0) / len) || 1;
  const k = RAIN_LAYER_RMS / rms;
  for (let i = 0; i < len; i++) out[i] = Math.max(-1, Math.min(1, out[i]! * k));
  return out;
}

/** Pisaran napsahdus: hyvin lyhyt, vaimeneva kohinapurske. */
function tick(out: Float32Array, start: number, sr: number, amp: number, rand: () => number) {
  const tau = (0.0006 + rand() * 0.0014) * sr;
  const n = Math.ceil(tau * 6);
  // Oma suodin joka pisaralle: osa kirkkaampia, osa tummempia.
  const a = 1 - Math.exp((-2 * Math.PI * (1500 + rand() * 3500)) / sr);
  let y = 0;
  for (let i = 0; i < n; i++) {
    y += a * ((rand() * 2 - 1) * amp * Math.exp(-i / tau) - y);
    out[(start + i) % out.length]! += y;
  }
}

/** Pisaran kupla: vaimeneva siniääni, jonka sävel nousee. */
function bubble(out: Float32Array, start: number, sr: number, amp: number, rand: () => number) {
  const f0 = 900 + rand() * 2100;
  const tau = (0.004 + rand() * 0.008) * sr;
  const n = Math.ceil(tau * 5);
  const onset = 0.0003 * sr;
  let phase = 0;
  for (let i = 0; i < n; i++) {
    phase += (2 * Math.PI * f0 * (1 + (0.6 * i) / n)) / sr;
    const env = Math.min(1, i / onset) * Math.exp(-i / tau);
    out[(start + i) % out.length]! += Math.sin(phase) * amp * env;
  }
}

/** Yksinapainen alipäästö kahdella kierroksella, jotta silmukan sauma ei napsahda. */
function lowpass(buf: Float32Array, sr: number, cutoff: number) {
  const a = 1 - Math.exp((-2 * Math.PI * cutoff) / sr);
  const src = buf.slice();
  let y = 0;
  for (let pass = 0; pass < 2; pass++)
    for (let i = 0; i < src.length; i++) {
      y += a * (src[i]! - y);
      if (pass === 1) buf[i] = y;
    }
}
