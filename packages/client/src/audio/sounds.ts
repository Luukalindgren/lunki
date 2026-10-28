import { LIGHTNING, distance, type Vec2 } from '@lunki/shared';
import type { AmbienceInput } from './ambience';
import type { Sfx } from './sfx';
import { voiceFalloff, type VoiceId } from './voice';

/** Tehoste, jonka voi soittaa ilman lisätietoja. */
export type Effect =
  | 'tick'
  | 'strike'
  | 'hooked'
  | 'lost'
  | 'caught'
  | 'splash'
  | 'plip'
  | 'wave'
  | 'rumble'
  | 'pop'
  | 'rattle'
  | 'paddle'
  | 'reelClick'
  | 'dragSlip'
  | 'lineHiss'
  | 'flyCrack'
  | 'flyTug';

/** Tehoste, joka riippuu tapahtuman luvuista (heiton voima, salaman etäisyys …). */
type Play = (sfx: Sfx, a: number, b: number) => void;

export interface Sound {
  /** Tehoste tai lukuja käyttävä tehoste. */
  effect?: Effect | Play;
  /** Kalastajan repliikki, jos pelaaja on valinnut tapahtumien repliikit. */
  voice?: VoiceId;
}

/**
 * Äänikartta (#371): pelin tapahtuma → tehoste ja repliikki, samaan tapaan
 * kuin ohjauksen toimintokartta `CONTROLS`. Peli kertoo, mitä tapahtui, ja
 * kartta päättää, miltä se kuulostaa. Muiden pelaajien tapahtumat soivat
 * samoilla äänillä etäisyyden mukaan hiljempaa (`Sounds.playAt`).
 */
export const SOUNDS = {
  // Kalastus
  cast: { effect: (s, power) => s.cast(power) },
  follow: { effect: 'tick' },
  strike: { effect: 'strike' },
  hooked: { effect: 'hooked' },
  missed: { voice: 'missed' },
  jumped: { effect: 'splash' },
  escaped: { effect: 'lost', voice: 'escaped' },
  snagged: { effect: 'strike', voice: 'snagged' },
  fouled: { voice: 'fouled' },
  stuck: { effect: 'strike', voice: 'stuck' },
  rattle: { effect: 'rattle' },
  pop: { effect: 'pop' },
  lureSplash: { effect: 'splash' },
  // Kalojen merkit pinnalla (#369), kuultuina paikan mukaan (playAt)
  fishRise: { effect: 'plip' },
  fishFlee: { effect: 'plip' },
  pikeStrike: { effect: 'splash' },
  lineCut: { effect: 'lost' },
  bitOff: { effect: 'lost', voice: 'bitOff' },
  lureLost: { effect: 'lost', voice: 'lureLost' },
  lineBroken: { effect: 'lost', voice: 'lineBroken' },
  caught: { effect: 'caught' },
  bigCatch: { effect: 'caught', voice: 'bigCatch' },
  reelClick: { effect: 'reelClick' },
  dragSlip: { effect: 'dragSlip' },
  lineHiss: { effect: 'lineHiss' },
  // Perhokalastus (#235, #236)
  flySwish: { effect: (s, speed, duration) => s.flySwish(speed, duration) },
  flyTug: { effect: 'flyTug' },
  flyCrack: { effect: 'flyCrack' },
  flyLand: { effect: (s, big) => s.flyLand(big > 0) },
  flySnag: { effect: 'strike' },
  flyTangle: { effect: 'lost' },
  // Kisa ja moninpeli
  penalty: { effect: 'lost' },
  tangled: { effect: 'strike', voice: 'tangled' },
  lineCutFree: { effect: 'lost' },
  finished: { effect: 'caught' },
  paddle: { effect: 'paddle' },
  // Sää
  thunder: { effect: (s, d) => s.thunder(d, d / LIGHTNING.soundSpeed) },
  lightningClose: { voice: 'lightning' },
  distantThunder: { effect: 'rumble' },
  spoutSeen: { effect: 'rumble' },
  bigWave: { effect: 'wave' },
  capsized: { voice: 'capsized' },
  spoutCapsized: { effect: 'wave', voice: 'capsized' },
  landing: { effect: 'splash' },
} satisfies Record<string, Sound>;

export type SoundEvent = keyof typeof SOUNDS;

/** Muiden pelaajien tehosteiden kantama (m): lähellä täysi voimakkuus, kauempana ei kuulu. */
export const EFFECT_RANGE = { near: 15, far: 150 } as const;

/** Toisen pelaajan tehosteen voimakkuus etäisyyden mukaan (0–1). */
export function effectFalloff(d: number): number {
  const { near, far } = EFFECT_RANGE;
  if (d <= near) return 1;
  return Math.max(0, 1 - (d - near) / (far - near)) ** 2;
}

/** Pelin äänet yhdestä paikasta: tapahtumat kartan kautta, repliikit ja ympäristö. */
export class Sounds {
  constructor(private readonly sfx: Sfx) {}

  /** Oma tapahtuma; `a` ja `b` ovat lukuja käyttävän tehosteen arvot. */
  play(event: SoundEvent, a = 0, b = 0): void {
    this.sound(SOUNDS[event], 1, a, b);
  }

  /**
   * Toisen pelaajan tapahtuma kohdassa `at`, kuultuna kohdasta `ear`: sama
   * tehoste hiljempaa etäisyyden mukaan. Repliikkejä ei soiteta, koska ne ovat
   * kalastajan omia (muiden puhe kulkee käsimerkkien kautta, `voiceAt`).
   */
  playAt(event: SoundEvent, at: Vec2, ear: Vec2, a = 0, b = 0): void {
    const gain = effectFalloff(distance(at, ear));
    if (gain <= 0) return;
    const { effect } = SOUNDS[event] as Sound;
    this.sound({ effect }, gain, a, b);
  }

  private sound(s: Sound, gain: number, a: number, b: number): void {
    const { effect, voice } = s;
    if (effect)
      this.sfx.withGain(gain, () => {
        if (typeof effect === 'function') effect(this.sfx, a, b);
        else this.sfx[effect]();
      });
    if (voice) this.sfx.eventVoice(voice);
  }

  /** Oma käsimerkin repliikki. */
  voice(id: VoiceId): void {
    this.sfx.voice(id, { speaker: 'me' });
  }

  /** Toisen pelaajan repliikki: hiljenee etäisyyden mukaan, `pan` = suunta -1…1. */
  voiceAt(id: VoiceId, speaker: string, d: number, pan: number): void {
    const gain = voiceFalloff(d);
    if (gain > 0) this.sfx.voice(id, { gain, pan, speaker });
  }

  preloadVoices(ids: readonly VoiceId[]): void {
    this.sfx.preloadVoices(ids);
  }

  /** Ympäristöäänet säästä, vuorokaudenajasta ja trombin läheisyydestä. */
  ambience(dt: number, w: AmbienceInput): void {
    this.sfx.updateAmbience(dt, w);
  }
}
