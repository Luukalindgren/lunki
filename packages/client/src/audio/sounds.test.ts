import { describe, expect, it } from 'vitest';
import { Sfx, type Place } from './sfx';
import { EFFECT_RANGE, SOUNDS, Sounds, effectFalloff, type Sound, type SoundEvent } from './sounds';

/** Sfx, joka kirjaa kutsut, voimakkuuden ja suunnan soittamisen sijaan. */
function recorder(voicesOn = true) {
  const calls: string[] = [];
  let place: Place = { gain: 1 };
  const sfx = new Proxy({} as Sfx, {
    get(_, name: string) {
      if (name === 'eventVoicesOn') return voicesOn;
      if (name === 'at')
        return (p: Place, play: () => void) => {
          place = p;
          play();
          place = { gain: 1 };
        };
      return (...args: unknown[]) => {
        const pan = place.pan ? ` pan ${place.pan.toFixed(2)}` : '';
        calls.push(
          `${name}(${args.map((a) => JSON.stringify(a)).join(',')})@${place.gain.toFixed(2)}${pan}`,
        );
      };
    },
  });
  return { sfx, calls };
}

/** Kuulija origossa, oikea itään. */
const EAST = { ear: { x: 0, y: 0 }, right: { x: 1, y: 0 } };

describe('äänikartta', () => {
  it('jokaisella tapahtumalla on tehoste tai repliikki, ja tehosteet ovat olemassa', () => {
    for (const [event, sound] of Object.entries(SOUNDS) as [SoundEvent, Sound][]) {
      expect(sound.effect ?? sound.voice, event).toBeDefined();
      for (const effect of [sound.effect, sound.fallback])
        if (typeof effect === 'string')
          expect(typeof Sfx.prototype[effect], `${event}: ${effect}`).toBe('function');
      if (sound.fallback) expect(sound.voice, event).toBeDefined();
    }
  });

  it('iloinen saalis: pelkkä repliikki, sävelmä vain repliikkien ollessa pois', () => {
    const on = recorder(true);
    new Sounds(on.sfx).play('recordCatch');
    expect(on.calls).toEqual(['duck("joy")@1.00', 'eventVoice("record")@1.00']);
    const off = recorder(false);
    new Sounds(off.sfx).play('recordCatch');
    expect(off.calls).toEqual(['fanfare()@1.00', 'duck("joy")@1.00', 'eventVoice("record")@1.00']);
  });

  it('oma tapahtuma soittaa tehosteen ja repliikin keskeltä', () => {
    const { sfx, calls } = recorder();
    const sounds = new Sounds(sfx);
    sounds.listener = EAST;
    sounds.play('escaped');
    sounds.play('cast', 0.5);
    sounds.play('flyLand', 1);
    sounds.play('hooked');
    expect(calls).toEqual([
      'lost()@1.00',
      'eventVoice("escaped")@1.00',
      'cast(0.5)@1.00',
      'flyLand(true)@1.00',
      'hooked()@1.00',
      'duck("hit")@1.00',
    ]);
  });

  it('salama kuuluu suunnastaan täydellä voimakkuudella', () => {
    const { sfx, calls } = recorder();
    const sounds = new Sounds(sfx);
    sounds.listener = EAST;
    sounds.playFrom('thunder', { x: -686, y: 0 }, 686);
    expect(calls).toEqual(['thunder(686,2)@1.00 pan -0.80']);
  });

  it('toisen pelaajan tapahtuma hiljenee etäisyyden mukaan, kuuluu suunnastaan eikä tuo repliikkiä', () => {
    const { sfx, calls } = recorder();
    const sounds = new Sounds(sfx);
    sounds.listener = { ...EAST, ear: { x: 5, y: 0 } };
    sounds.playAt('bigCatch', { x: 0, y: 0 });
    sounds.listener = { ...EAST, ear: { x: 60, y: 0 } };
    sounds.playAt('lureSplash', { x: 0, y: 0 });
    sounds.playAt('lureSplash', { x: -EFFECT_RANGE.far, y: 0 });
    expect(calls).toEqual([
      'caught()@1.00 pan -0.80',
      `splash()@${effectFalloff(60).toFixed(2)} pan -0.80`,
    ]);
  });

  it('kantama: täysi lähellä, hiljenee tasaisesti ja loppuu rajalla', () => {
    expect(effectFalloff(0)).toBe(1);
    expect(effectFalloff(EFFECT_RANGE.near)).toBe(1);
    let prev = 1;
    for (let d = EFFECT_RANGE.near; d <= EFFECT_RANGE.far; d += 5) {
      const g = effectFalloff(d);
      expect(g).toBeLessThanOrEqual(prev);
      prev = g;
    }
    expect(effectFalloff(EFFECT_RANGE.far)).toBe(0);
  });
});
