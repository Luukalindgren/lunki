import { afterEach, describe, expect, it } from 'vitest';
import { DIFFICULTIES } from '@lunki/shared';
import { setLangForTest } from '../i18n';
import { MANUAL_SECTIONS, manualTopics } from './manual';

describe('Ohjeet (#401)', () => {
  afterEach(() => setLangForTest('fi'));

  it('jokainen aihe täyttyy ohjauksesta kummallakin kielellä ja ohjaustavalla', () => {
    for (const lang of ['fi', 'en'] as const) {
      setLangForTest(lang);
      for (const touch of [false, true]) {
        for (const section of MANUAL_SECTIONS) {
          for (const topic of manualTopics(section, { touch })) {
            expect(topic.title).not.toMatch(/^manual\./);
            expect(topic.lines.length).toBeGreaterThan(0);
            for (const line of topic.lines) {
              expect(line.trim()).not.toBe('');
              // Täyttämätön {toiminto} tai muuttuja jäisi tekstiin.
              expect(line).not.toMatch(/[{}]/);
            }
          }
        }
      }
    }
  });

  it('näyttää koneella näppäimet ja kosketuksella napit', () => {
    const text = (touch: boolean) =>
      manualTopics('fly', { touch })
        .flatMap((topic) => topic.lines)
        .join('\n');
    expect(text(false)).toContain('Hiiren vasen/välilyönti pohjassa = siimakäsi');
    expect(text(true)).toContain('SIIMA pohjassa = siimakäsi');
  });

  it('vaikeustason luvut tulevat DIFFICULTIES-taulukosta', () => {
    const strike = manualTopics('spin').find((topic) => topic.title === 'Vastaisku')!;
    const text = strike.lines.join('\n');
    expect(text).toContain(`${String(DIFFICULTIES.normal.hookWindow).replace('.', ',')} s`);
    expect(text).toContain(`${Math.round(DIFFICULTIES.realistic.hookChance * 100)} %`);
  });
});
