import { describe, expect, it } from 'vitest';
import { RowerSeat } from './rowing';

const DT = 1 / 60;
const row = { kick: 1, turn: 0, sprint: false };
const turn = { kick: 0, turn: 1, sprint: false };
const still = { kick: 0, turn: 0, sprint: false };

describe('soutajan asento (#263)', () => {
  it('airoissa syöte liikuttaa venettä, heitto ja kelaus vievät vapaan', () => {
    const seat = new RowerSeat();
    expect(seat.step(row, false, false, DT)).toBe(row);
    expect(seat.step(turn, false, false, DT)).toBe(turn);
    expect(seat.look).toBe(0);
    // Heitto latautuu tai soutaja kelaa: vene ei liiku, ja käännös kääntää soutajaa tuhdolla.
    expect(seat.step(row, true, false, DT)).toEqual(still);
    expect(seat.rowing).toBe(false);
    seat.step(turn, true, false, DT);
    expect(seat.look).toBeGreaterThan(0);
  });

  it('soutu-uistelu: kelaamatta soutaminen palauttaa airoihin, ja soutaja kääntyy takaisin', () => {
    const seat = new RowerSeat();
    seat.step(still, true, false, DT);
    for (let i = 0; i < 30; i++) seat.step(turn, false, false, DT);
    expect(seat.rowing).toBe(false);
    expect(seat.look).toBeGreaterThan(0.5);
    expect(seat.step(row, false, false, DT)).toBe(row);
    for (let i = 0; i < 30; i++) seat.step(row, false, false, DT);
    expect(seat.look).toBe(0);
    // Kelaus pysäyttää soudun heti.
    expect(seat.step(row, true, false, DT)).toEqual(still);
  });

  it('asennon vaihto käsin: vavassa voi kääntyä ennen heittoa', () => {
    const seat = new RowerSeat();
    seat.step(still, false, true, DT);
    expect(seat.rowing).toBe(false);
    expect(seat.step(turn, false, false, DT)).toEqual(still);
    expect(seat.look).toBeGreaterThan(0);
    seat.step(still, false, true, DT);
    expect(seat.rowing).toBe(true);
  });
});
