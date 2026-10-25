/**
 * Ukkosen jyrähdys näytejonona (huippu 1). Lähellä terävä räsähdys ja nopea,
 * kova vyöry; kaukana pehmeämpi alku ja tummempi, pidempi jyrinä. Jyrinässä
 * on myös 200–600 Hz:n ääntä, jotta se kuuluu puhelimen kaiuttimesta, ja
 * matala alaosa kuulokkeille. Pehmeä leikkaus pitää äänen tuhtina.
 */
export function thunderClap(
  sampleRate: number,
  distance: number,
  rand: () => number = Math.random,
): Float32Array<ArrayBuffer> {
  const near = Math.max(0, Math.min(1, 1 - distance / 2500));
  const duration = 4.5 + (1 - near) * 2.5 + rand() * 1.5;
  const len = Math.floor(sampleRate * duration);
  const attack = 0.02 + (1 - near) * 0.6;

  // Vyöryt: ensimmäinen heti, loput satunnaisesti ja vähitellen hiljeten.
  const rolls: { at: number; amp: number; width: number }[] = [
    { at: attack, amp: 1, width: 0.3 + (1 - near) * 0.4 },
  ];
  const extra = 3 + Math.floor(rand() * 4);
  for (let k = 0; k < extra; k++) {
    const at = attack + 0.3 + rand() * duration * 0.65;
    rolls.push({
      at,
      amp: (0.4 + 0.6 * rand()) * Math.exp(-at / (duration * 0.4)),
      width: 0.15 + rand() * 0.45,
    });
  }

  const brightA = (f: number) => 1 - Math.exp((-2 * Math.PI * f) / sampleRate);
  const subA = brightA(70);
  const flutterA = brightA(14);
  // Suodatetun tasakohinan (RMS 1/√3) hajonta, jolla värinä skaalataan yksikköön.
  const flutterK = Math.sqrt((3 * (2 - flutterA)) / flutterA);
  const mid = new Float32Array(len);
  const sub = new Float32Array(len);
  const env = new Float32Array(len);
  let m1 = 0;
  let m2 = 0;
  let s1 = 0;
  let s2 = 0;
  let flutter = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sampleRate;
    // Sävy tummuu: räsähdyksen jälkeen jyrinä painuu kohti 350 Hz:iä.
    const a = brightA(350 + (500 + 1300 * near) * Math.exp(-t / 0.8));
    const x = rand() * 2 - 1;
    m1 += a * (x - m1);
    m2 += a * (m1 - m2);
    s1 += subA * (x - s1);
    s2 += subA * (s1 - s2);
    mid[i] = m2;
    sub[i] = s2;
    let e = 0;
    for (const r of rolls) {
      const d = t - r.at;
      // Nopea nousu, hitaampi lasku.
      const w = d < 0 ? r.width * 0.3 : r.width;
      e += r.amp * Math.exp(-(d * d) / (w * w));
    }
    // Pohjajyrinä vyöryjen välissä, ettei ääni katkea hiljaisuuteen.
    const base = 0.3 * Math.exp(-t / (duration * 0.35)) * Math.min(1, t / Math.max(0.05, attack));
    // Nopea, epätasainen värinä tekee jyrinästä "rullaavan".
    flutter += flutterA * (rand() * 2 - 1 - flutter);
    const roll = Math.max(0, 1 + 0.35 * flutter * flutterK);
    env[i] = (e + base) * roll * Math.min(1, (len - i) / (sampleRate * 0.3));
  }
  const rms = (b: Float32Array) => Math.sqrt(b.reduce((s, v) => s + v * v, 0) / b.length) || 1;
  const midK = 1 / rms(mid);
  const subK = 0.8 / rms(sub);

  const out = new Float32Array(len);
  let peak = 0;
  let hp = 0;
  const crackA = brightA(800);
  const crackLen = Math.floor(sampleRate * 0.3);
  for (let i = 0; i < len; i++) {
    let v = (mid[i]! * midK + sub[i]! * subK) * env[i]!;
    if (near > 0.9 && i < crackLen) {
      // Lähisalaman räsähdys: kirkas, nopeasti vaimeneva kohina.
      const x = rand() * 2 - 1;
      hp += crackA * (x - hp);
      v += (x - hp) * 3 * Math.exp(-i / (sampleRate * 0.06));
    }
    out[i] = Math.tanh(v * 0.6);
    peak = Math.max(peak, Math.abs(out[i]!));
  }
  if (peak > 0) for (let i = 0; i < len; i++) out[i]! /= peak;
  return out;
}
