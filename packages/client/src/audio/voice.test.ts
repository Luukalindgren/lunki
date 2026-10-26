import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { EMOTES } from '@lunki/shared';
import { describe, expect, it } from 'vitest';
import { pickLine, VOICE_LINES, voiceFalloff, voiceFile, type VoiceId } from './voice';

const root = (p: string) => fileURLToPath(new URL(`../../../../${p}`, import.meta.url));

describe('puheäänet', () => {
  it('repliikkien määrät vastaavat käsikirjoitusta ja tiedostot ovat olemassa', () => {
    const script = JSON.parse(readFileSync(root('scripts/puhe/repliikit.json'), 'utf8')) as Record<
      string,
      unknown
    >;
    const lines = Object.fromEntries(
      Object.entries(script)
        .filter(([k]) => !k.startsWith('_'))
        .map(([k, v]) => [k, (v as string[]).length]),
    );
    expect(lines).toEqual(VOICE_LINES);
    for (const [id, count] of Object.entries(VOICE_LINES))
      for (let n = 1; n <= count; n++)
        expect(existsSync(root(`packages/client/public/${voiceFile(id as VoiceId, n)}`))).toBe(
          true,
        );
  });

  it('jokaisella käsimerkillä on vähintään neljä repliikkiä', () => {
    for (const e of EMOTES) expect(VOICE_LINES[e]).toBeGreaterThanOrEqual(4);
  });

  it('sama repliikki ei tule kahdesti peräkkäin', () => {
    let seed = 1;
    const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    let last: number | undefined;
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const n = pickLine(5, last, random);
      expect(n).not.toBe(last);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(5);
      seen.add(n);
      last = n;
    }
    expect(seen.size).toBe(5);
    expect(pickLine(1, 1)).toBe(1);
    expect(pickLine(2, 1, () => 0.99)).toBe(2);
    expect(pickLine(2, 2, () => 0)).toBe(1);
  });

  it('ääni hiljenee etäisyyden mukaan eikä kuulu 80 m:n päähän', () => {
    expect(voiceFalloff(0)).toBe(1);
    expect(voiceFalloff(10)).toBe(1);
    expect(voiceFalloff(30)).toBeLessThan(1);
    expect(voiceFalloff(50)).toBeCloseTo(0.3);
    expect(voiceFalloff(65)).toBeGreaterThan(0);
    expect(voiceFalloff(80)).toBe(0);
    expect(voiceFalloff(200)).toBe(0);
  });
});
