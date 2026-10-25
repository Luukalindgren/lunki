/** Äänenvoimakkuus portaittain: pois, hiljainen, normaali, kova. */
export type VolumeLevel = 0 | 1 | 2 | 3;

export const VOLUME_LEVELS: { value: VolumeLevel; label: string }[] = [
  { value: 0, label: 'Pois' },
  { value: 1, label: 'Hiljainen' },
  { value: 2, label: 'Normaali' },
  { value: 3, label: 'Kova' },
];

const GAINS: Record<VolumeLevel, number> = { 0: 0, 1: 0.35, 2: 0.7, 3: 1 };
export const volumeGain = (v: VolumeLevel) => GAINS[v];

export interface AudioSettings {
  /** Pelin tapahtumat: heitto, tärppi, salama… */
  effects: VolumeLevel;
  /** Tuuli, sade ja linnut. */
  ambience: VolumeLevel;
  /** Taustamusiikki (oletuksena pois). */
  music: VolumeLevel;
}

export const DEFAULT_AUDIO: AudioSettings = { effects: 2, ambience: 2, music: 0 };

const KEY = 'lunki.audio';
const isLevel = (v: unknown): v is VolumeLevel => v === 0 || v === 1 || v === 2 || v === 3;

export function loadAudioSettings(): AudioSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<AudioSettings> | null;
    const s = { ...DEFAULT_AUDIO };
    for (const k of Object.keys(s) as (keyof AudioSettings)[]) if (isLevel(raw?.[k])) s[k] = raw[k];
    return s;
  } catch {
    return { ...DEFAULT_AUDIO };
  }
}

export function saveAudioSettings(s: AudioSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // ei haittaa
  }
}
