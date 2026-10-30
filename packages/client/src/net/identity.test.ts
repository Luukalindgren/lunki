import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadIdentity, profileKey, saveName } from './identity';

describe('nimimerkkiprofiilit laitteella (#415)', () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('nimetön profiili käyttää vanhoja avaimia', () => {
    expect(profileKey('stats')).toBe('lunki.stats');
    saveName('   ');
    expect(loadIdentity().name).toBe('');
    expect(profileKey('journal')).toBe('lunki.journal');
  });

  it('ensimmäinen nimimerkki ottaa nimettömän tiedot, uusi nimi aloittaa alusta', () => {
    store.set('lunki.stats', 'S');
    store.set('lunki.tackleBox', 'B');
    saveName('Luuka');
    expect(profileKey('stats')).toBe('lunki.profile.luuka.stats');
    expect(store.get('lunki.profile.luuka.stats')).toBe('S');
    expect(store.get('lunki.profile.luuka.tackleBox')).toBe('B');
    expect(store.has('lunki.stats')).toBe(false);

    saveName('Matti');
    expect(store.get(profileKey('stats'))).toBeUndefined();
    // Kirjainkoolla ei väliä: vanha nimi tuo tiedot takaisin.
    saveName('LUUKA');
    expect(store.get(profileKey('stats'))).toBe('S');
  });

  it('ennen profiileja nimen asettaneen tiedot siirtyvät hänen profiiliinsa', () => {
    store.set('lunki.name', 'Ville');
    store.set('lunki.stats', 'S');
    expect(profileKey('stats')).toBe('lunki.profile.ville.stats');
    expect(store.get('lunki.profile.ville.stats')).toBe('S');
    // Siirto tehdään vain kerran.
    store.set('lunki.stats', 'uusi');
    expect(store.get(profileKey('stats'))).toBe('S');
  });

  it('oletusnimi Kalastaja on nimetön profiili', () => {
    store.set('lunki.stats', 'S');
    saveName('Kalastaja');
    expect(profileKey('stats')).toBe('lunki.stats');
    expect(store.get('lunki.stats')).toBe('S');
  });
});
