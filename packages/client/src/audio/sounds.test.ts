import { describe, expect, it } from 'vitest';
import { Sfx } from './sfx';
import { EFFECT_RANGE, SOUNDS, Sounds, effectFalloff, type Sound, type SoundEvent } from './sounds';

/** Sfx, joka kirjaa kutsut ja voimakkuuden soittamisen sijaan. */
function recorder() {
  const calls: string[] = [];
  let gain = 1;
  const sfx = new Proxy({} as Sfx, {
    get(_, name: string) {
      if (name === 'withGain')
        return (g: number, play: () => void) => {
          gain = g;
          play();
          gain = 1;
        };
      return (...args: unknown[]) =>
        calls.push(`${name}(${args.map((a) => JSON.stringify(a)).join(',')})@${gain.toFixed(2)}`);
    },
  });
  return { sfx, calls };
}

describe('äänikartta', () => {
  it('jokaisella tapahtumalla on tehoste tai repliikki, ja tehosteet ovat olemassa', () => {
    for (const [event, sound] of Object.entries(SOUNDS) as [SoundEvent, Sound][]) {
      expect(sound.effect ?? sound.voice, event).toBeDefined();
      if (typeof sound.effect === 'string')
        expect(typeof Sfx.prototype[sound.effect], `${event}: ${sound.effect}`).toBe('function');
    }
  });

  it('oma tapahtuma soittaa tehosteen ja repliikin', () => {
    const { sfx, calls } = recorder();
    const sounds = new Sounds(sfx);
    sounds.play('escaped');
    sounds.play('cast', 0.5);
    sounds.play('flyLand', 1);
    sounds.play('thunder', 686);
    expect(calls).toEqual([
      'lost()@1.00',
      'eventVoice("escaped")@1.00',
      'cast(0.5)@1.00',
      'flyLand(true)@1.00',
      'thunder(686,2)@1.00',
    ]);
  });

  it('toisen pelaajan tapahtuma hiljenee etäisyyden mukaan eikä tuo repliikkiä', () => {
    const { sfx, calls } = recorder();
    const sounds = new Sounds(sfx);
    sounds.playAt('bigCatch', { x: 0, y: 0 }, { x: 5, y: 0 });
    sounds.playAt('lureSplash', { x: 0, y: 0 }, { x: 60, y: 0 });
    sounds.playAt('lureSplash', { x: 0, y: 0 }, { x: EFFECT_RANGE.far + 1, y: 0 });
    expect(calls).toEqual(['caught()@1.00', `splash()@${effectFalloff(60).toFixed(2)}`]);
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
