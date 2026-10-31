import { LIGHTNING, distance, type Vec2 } from '@lunki/shared';
import type { AmbienceInput } from './ambience';
import { CENTER_LISTENER, effectMuffle, effectPan, type DuckId, type Listener } from './mix';
import type { Place, Sfx } from './sfx';
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
  | 'flyTug'
  | 'flyHaul'
  | 'joy'
  | 'fanfare';

/** Tehoste, joka riippuu tapahtuman luvuista (heiton voima, salaman etäisyys …). */
type Play = (sfx: Sfx, a: number, b: number) => void;

export interface Sound {
  /** Tehoste tai lukuja käyttävä tehoste. */
  effect?: Effect | Play;
  /** Kalastajan repliikki, jos pelaaja on valinnut tapahtumien repliikit. */
  voice?: VoiceId;
  /** Tehoste vain silloin, kun repliikki ei kuulu: muuten puhe kuuluu yksin. */
  fallback?: Effect;
  /** Oma tapahtuma hiljentää ympäristöä ja musiikkia hetkeksi (`DUCKS`). */
  duck?: DuckId;
}

/**
 * Äänikartta (#371): pelin tapahtuma → tehoste ja repliikki, samaan tapaan
 * kuin ohjauksen toimintokartta `CONTROLS`. Peli kertoo, mitä tapahtui, ja
 * kartta päättää, miltä se kuulostaa. Muiden pelaajien tapahtumat soivat
 * samoilla äänillä etäisyyden mukaan hiljempaa ja omasta suunnastaan
 * (`Sounds.playAt`). Omat tehosteet kuuluvat keskeltä; sää (ukkonen, iso
 * aalto, trombi) kuuluu suunnastaan (`Sounds.playFrom`).
 */
export const SOUNDS = {
  // Kalastus
  cast: { effect: (s, power) => s.cast(power) },
  follow: { effect: 'tick' },
  strike: { effect: 'strike', duck: 'hit' },
  hooked: { effect: 'hooked', duck: 'hit' },
  missed: { voice: 'missed' },
  jumped: { effect: 'splash' },
  // Nosto (#366): kala pintaan ja viimeinen riuhtaisu
  surfaced: { effect: 'plip' },
  lunged: { effect: 'splash' },
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
  // Iloiset saaliit (game/catchJoy.ts): oma ennätys, kala pitkän odotuksen
  // jälkeen ja kisan suurin. Sävelmä peittäisi puheen, joten se soi vain
  // repliikkien ollessa pois päältä.
  reliefCatch: { voice: 'relief', fallback: 'joy', duck: 'joy' },
  recordCatch: { voice: 'record', fallback: 'fanfare', duck: 'joy' },
  raceBestCatch: { voice: 'raceBest', fallback: 'caught' },
  reelClick: { effect: 'reelClick' },
  dragSlip: { effect: 'dragSlip' },
  lineHiss: { effect: 'lineHiss' },
  // Perhokalastus (#235, #236)
  flySwish: { effect: (s, speed, duration) => s.flySwish(speed, duration) },
  flyTug: { effect: 'flyTug' },
  flyHaul: { effect: 'flyHaul' },
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
  // Rantautuminen (#457): maihin, rengas käteen ja maahan, kyytiin hyppy
  shoreLanded: { effect: 'paddle' },
  tubeLifted: { effect: 'tick' },
  tubeDropped: { effect: 'tick' },
  boarded: { effect: 'splash' },
  // Täyttökisa (#458): pumpun veto, ponttooni täynnä, letku kiinni ja irti
  pumpStroke: { effect: 'flyHaul' },
  pontoonFull: { effect: 'pop' },
  hoseOn: { effect: 'tick' },
  hoseOff: { effect: 'lineHiss' },
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
  /** Kuulijan paikka ja suunta; peli päivittää tämän joka ruudulla. */
  listener: Listener = CENTER_LISTENER;

  constructor(private readonly sfx: Sfx) {}

  /** Oma tapahtuma keskeltä; `a` ja `b` ovat lukuja käyttävän tehosteen arvot. */
  play(event: SoundEvent, a = 0, b = 0): void {
    this.sound(SOUNDS[event], { gain: 1 }, a, b);
  }

  /**
   * Oma tapahtuma, joka kuuluu kohdan `at` suunnasta täydellä voimakkuudella:
   * salama, iso aalto, trombi. Etäisyyden hoitaa tehoste itse.
   */
  playFrom(event: SoundEvent, at: Vec2, a = 0, b = 0): void {
    this.sound(SOUNDS[event], { gain: 1, pan: effectPan(at, this.listener) }, a, b);
  }

  /**
   * Toisen pelaajan tapahtuma kohdassa `at`: sama tehoste hiljempaa ja
   * tummempana etäisyyden mukaan ja omasta suunnastaan. Repliikkejä ei
   * soiteta, koska ne ovat kalastajan omia (muiden puhe kulkee käsimerkkien
   * kautta, `voiceAt`), eikä toisen tapahtuma hiljennä muita ääniä.
   */
  playAt(event: SoundEvent, at: Vec2, a = 0, b = 0): void {
    const d = distance(at, this.listener.ear);
    const gain = effectFalloff(d);
    if (gain <= 0) return;
    const { effect } = SOUNDS[event] as Sound;
    const place = { gain, pan: effectPan(at, this.listener), cutoff: effectMuffle(d) };
    this.sound({ effect }, place, a, b);
  }

  private sound(s: Sound, place: Place, a: number, b: number): void {
    const { voice, duck } = s;
    const effect = s.fallback && !this.sfx.eventVoicesOn ? s.fallback : s.effect;
    if (effect)
      this.sfx.at(place, () => {
        if (typeof effect === 'function') effect(this.sfx, a, b);
        else this.sfx[effect]();
      });
    if (duck) this.sfx.duck(duck);
    if (voice) this.sfx.eventVoice(voice);
  }

  /** Oma käsimerkin repliikki. */
  voice(id: VoiceId): void {
    this.sfx.voice(id, { speaker: 'me' });
  }

  /** Toisen pelaajan repliikki kohdasta `at`: hiljenee etäisyyden mukaan ja kuuluu suunnastaan. */
  voiceAt(id: VoiceId, speaker: string, at: Vec2): void {
    const gain = voiceFalloff(distance(at, this.listener.ear));
    if (gain > 0) this.sfx.voice(id, { gain, pan: effectPan(at, this.listener), speaker });
  }

  preloadVoices(ids: readonly VoiceId[]): void {
    this.sfx.preloadVoices(ids);
  }

  /**
   * Ympäristöäänet säästä, vuorokaudenajasta ja trombin läheisyydestä.
   * Trombin pauhu kuuluu lähimmän trombin (`spoutAt`) suunnasta, ja kuikat
   * pysyvät paikallaan järvellä, kun kuulija kääntyy.
   */
  ambience(dt: number, w: AmbienceInput, spoutAt: Vec2 | null = null): void {
    this.sfx.updateAmbience(dt, {
      ...w,
      spoutPan: spoutAt ? effectPan(spoutAt, this.listener) : 0,
      right: this.listener.right,
    });
  }
}
