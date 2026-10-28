import { BOAT_TUBE } from '@lunki/shared';
import { describe, expect, it } from 'vitest';
import { moveToBoat, packCrews, seatChange, type Crewmate } from './crews';

const c = (id: string, boat: number, seat = 0): Crewmate => ({ id, boat, seat });
const boats = (list: Crewmate[]) => list.map((x) => `${x.id}${x.boat}.${x.seat}`).join(' ');

describe('venekunnat (#263)', () => {
  it('renkaalla ei ole venettä, ja veneiden numerot ja paikat täytetään järjestyksessä', () => {
    expect(boats(packCrews([c('a', 0), c('b', 0)]))).toBe('a0.0 b0.0');
    // Lähteneen jäljiltä: vene 2 tyhjeni, ja veneen 3 kyytiläinen pääsee soutajaksi.
    expect(boats(packCrews([c('a', 1, 0), c('c', 3, 2), c('d', 3, 1), c('e', 0)]))).toBe(
      'a1.0 c2.1 d2.0 e0.0',
    );
  });

  it('liian täydestä veneestä ylimääräiset omaan veneeseen', () => {
    const list = [c('a', 1, 0), c('b', 1, 1), c('c', 1, 2), c('d', 1, 3)];
    expect(boats(packCrews(list))).toBe('a1.0 b1.1 c1.2 d2.0');
  });

  it('renkaalta omaan veneeseen, toisen veneeseen ja takaisin renkaalle', () => {
    const lobby = [c('a', 0), c('b', 0), c('c', 0)];
    const own = moveToBoat(lobby, 'a', 0)!;
    expect(boats(own)).toBe('a1.0 b0.0 c0.0');
    const joined = moveToBoat(own, 'c', 1)!;
    expect(boats(joined)).toBe('a1.0 b0.0 c1.1');
    expect(boats(moveToBoat(joined, 'c', 0)!)).toBe('a1.0 b0.0 c2.0');
    // Soutaja lähtee renkaalle: kyytiläinen tarttuu airoihin.
    expect(boats(moveToBoat(joined, 'a', BOAT_TUBE)!)).toBe('a0.0 b0.0 c1.0');
  });

  it('turhat ja mahdottomat vaihdot hylätään', () => {
    const lobby = [c('a', 1), c('b', 2), c('c', 0)];
    // Yksin veneessä oleva ei tarvitse uutta, eikä olematonta venettä voi valita.
    expect(moveToBoat(lobby, 'b', 0)).toBeNull();
    expect(moveToBoat(lobby, 'b', 7)).toBeNull();
    expect(moveToBoat(lobby, 'b', 2)).toBeNull();
    expect(moveToBoat(lobby, 'c', BOAT_TUBE)).toBeNull();
    expect(moveToBoat(lobby, 'c', -2)).toBeNull();
  });

  it('täyteen veneeseen ei mahdu', () => {
    const full = [c('a', 1, 0), c('b', 1, 1), c('c', 1, 2), c('d', 2)];
    expect(moveToBoat(full, 'd', 1)).toBeNull();
  });
});

describe('paikanvaihto veneessä (#357)', () => {
  const none = () => null;
  const two = [c('a', 1, 0), c('b', 1, 1), c('t', 0)];

  it('kyytiläinen siirtyy kisassa vapaalle paikalle, soutaja ei jätä airoja', () => {
    expect(seatChange(two, 'b', 2, none, false)).toEqual({ kind: 'move', seat: 2 });
    expect(seatChange(two, 'a', 2, none, false)).toBeNull();
    // Aulassa paikat täytetään järjestyksessä: vapaalle ei siirrytä.
    expect(seatChange(two, 'b', 2, none, true)).toBeNull();
  });

  it('varatusta paikasta pyydetään, ja vaihto tehdään, kun toinen pyytää takaisin', () => {
    expect(seatChange(two, 'b', 0, none, false)).toEqual({ kind: 'ask', seat: 0 });
    const asks = (id: string) => (id === 'b' ? 0 : null);
    expect(seatChange(two, 'a', 1, asks, true)).toEqual({ kind: 'swap', with: 'b' });
    // Pyyntö toiselle paikalle ei käy hyväksynnästä.
    expect(seatChange(two, 'a', 1, () => 2, false)).toEqual({ kind: 'ask', seat: 1 });
  });

  it('ei ilman venettä, omalle paikalle eikä veneen ulkopuolelle', () => {
    expect(seatChange(two, 't', 0, none, false)).toBeNull();
    expect(seatChange(two, 'a', 0, none, false)).toBeNull();
    expect(seatChange(two, 'a', 3, none, false)).toBeNull();
    expect(seatChange(two, 'a', 0.5, none, false)).toBeNull();
  });
});
