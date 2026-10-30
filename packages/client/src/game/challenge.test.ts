import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, NATIVE_SPECIES, SPECIES_IDS, UNTIMED } from '@lunki/shared';
import {
  CHALLENGE_PARAM,
  challengeOutcome,
  challengeUrl,
  decodeChallenge,
  encodeChallenge,
  type Challenge,
} from './challenge';

const anyStart = () => true;

const challenge: Challenge = {
  seed: 0xdeadbeef,
  settings: {
    ...DEFAULT_SETTINGS,
    durationMinutes: 10,
    difficulty: 'realistic',
    winRule: 'biggest',
    weather: 'chaos',
    timeOfDay: 'evening',
    lightningPenalty: 'out',
    capsizePenalty: 'lose-catch',
    landPenalty: 60,
    species: ['pike', 'perch'],
    start: { x: 123.4, y: -56.7 },
  },
  score: 4.35,
  elapsed: 600,
  name: 'Luuka',
};

describe('haastelinkki (#413)', () => {
  it('asetukset, siemen, tulos ja nimi säilyvät linkissä', () => {
    const back = decodeChallenge(encodeChallenge(challenge), anyStart);
    expect(back).toEqual({
      ...challenge,
      settings: {
        ...challenge.settings,
        species: SPECIES_IDS.filter((id) => id === 'pike' || id === 'perch'),
      },
    });
  });

  it('oletusasetukset ja aikarajaton sessio ilman aloituspaikkaa', () => {
    const c: Challenge = {
      seed: 8,
      settings: { ...DEFAULT_SETTINGS, durationMinutes: UNTIMED, start: null },
      score: 0,
      elapsed: 1934,
      name: 'Pekka. P-L',
    };
    const back = decodeChallenge(encodeChallenge(c), anyStart);
    expect(back?.settings).toEqual({ ...c.settings, species: NATIVE_SPECIES });
    expect(back?.name).toBe('Pekka. P-L');
    expect(back?.elapsed).toBe(1934);
  });

  it('linkki kulkee osoitteessa ja nimi koodataan', () => {
    const url = new URL(
      challengeUrl('https://lunkinjarvi.com/?huone=X#y', { ...challenge, name: 'Åke & Co' }),
    );
    expect(url.hash).toBe('');
    expect([...url.searchParams.keys()]).toEqual([CHALLENGE_PARAM]);
    expect(decodeChallenge(url.searchParams.get(CHALLENGE_PARAM), anyStart)?.name).toBe('Åke & Co');
  });

  it('rikkinäinen linkki hylätään', () => {
    const ok = encodeChallenge(challenge);
    const parts = ok.split('.');
    const broken = (i: number, v: string) => parts.map((p, j) => (j === i ? v : p)).join('.');
    expect(decodeChallenge(null, anyStart)).toBeNull();
    expect(decodeChallenge('abc', anyStart)).toBeNull();
    expect(decodeChallenge(broken(0, '!!'), anyStart)).toBeNull();
    // Tuntematon kesto, vaikeustaso tai sää.
    expect(decodeChallenge(broken(1, 'z' + parts[1]!.slice(1)), anyStart)).toBeNull();
    expect(
      decodeChallenge(broken(1, parts[1]!.slice(0, 1) + 'z' + parts[1]!.slice(2)), anyStart),
    ).toBeNull();
    expect(decodeChallenge(broken(1, parts[1]!.slice(0, 7)), anyStart)).toBeNull();
    // Ei yhtään lajia.
    expect(decodeChallenge(broken(2, '0'), anyStart)).toBeNull();
    expect(decodeChallenge(broken(4, '-5'), anyStart)).toBeNull();
    // Aloituspaikka maalla.
    expect(decodeChallenge(ok, () => false)).toBeNull();
    expect(decodeChallenge(ok.toUpperCase(), anyStart)?.seed).toBe(challenge.seed);
  });

  it('vertailu grammaan pyöristettynä', () => {
    expect(challengeOutcome(4.8, 4.35)).toBe('won');
    expect(challengeOutcome(1, 4.35)).toBe('lost');
    expect(challengeOutcome(4.3501, 4.35)).toBe('tie');
  });
});
