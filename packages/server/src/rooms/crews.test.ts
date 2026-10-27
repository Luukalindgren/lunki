import { describe, expect, it } from 'vitest';
import { moveToBoat, packCrews, type Crewmate } from './crews';

const c = (id: string, boat: number, seat = 0): Crewmate => ({ id, boat, seat });
const boats = (list: Crewmate[]) => list.map((x) => `${x.id}${x.boat}.${x.seat}`).join(' ');

describe('venekisan miehistöt (#263)', () => {
  it('uusi pelaaja saa oman veneen, ja numerot ja paikat täytetään järjestyksessä', () => {
    expect(boats(packCrews([c('a', 0), c('b', 0)]))).toBe('a1.0 b2.0');
    // Lähteneen jäljiltä: vene 2 tyhjeni, ja veneen 3 kyytiläinen pääsee soutajaksi.
    expect(boats(packCrews([c('a', 1, 0), c('c', 3, 2), c('d', 3, 1), c('e', 0)]))).toBe(
      'a1.0 c2.1 d2.0 e3.0',
    );
  });

  it('liian täydestä veneestä ylimääräiset omaan veneeseen', () => {
    const list = [c('a', 1, 0), c('b', 1, 1), c('c', 1, 2), c('d', 1, 3)];
    expect(boats(packCrews(list))).toBe('a1.0 b1.1 c1.2 d2.0');
  });

  it('siirto toisen veneeseen ja omaan uuteen veneeseen', () => {
    const lobby = [c('a', 1), c('b', 2), c('c', 3)];
    const joined = moveToBoat(lobby, 'c', 1)!;
    expect(boats(joined)).toBe('a1.0 b2.0 c1.1');
    expect(boats(moveToBoat(joined, 'c', 0)!)).toBe('a1.0 b2.0 c3.0');
    // Yksin veneessä oleva ei tarvitse uutta, eikä olematonta venettä voi valita.
    expect(moveToBoat(lobby, 'b', 0)).toBeNull();
    expect(moveToBoat(lobby, 'b', 7)).toBeNull();
    expect(moveToBoat(lobby, 'b', 2)).toBeNull();
  });

  it('täyteen veneeseen ei mahdu', () => {
    const full = [c('a', 1, 0), c('b', 1, 1), c('c', 1, 2), c('d', 2)];
    expect(moveToBoat(full, 'd', 1)).toBeNull();
  });
});
