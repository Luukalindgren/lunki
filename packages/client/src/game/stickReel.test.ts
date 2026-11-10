import { describe, expect, it } from 'vitest';
import { StickReel, gearFor } from './stickReel';

const DT = 1 / 60;

/** Pyöritä tattia `turns` kierrosta nopeudella `rps`; palauttaa askelten tulokset. */
function spin(reel: StickReel, turns: number, rps: number, pov = false, from = Math.PI / 2) {
  const out = [];
  const steps = Math.round(turns / Math.abs(rps) / DT);
  for (let i = 0; i <= steps; i++) {
    const a = from + i * rps * DT * Math.PI * 2;
    out.push(reel.step({ x: Math.cos(a), y: Math.sin(a) }, DT, true, pov));
  }
  return out;
}

const center = (reel: StickReel, allowed = true) => reel.step({ x: 0, y: 0 }, DT, allowed, false);

describe('kelaus tattia pyörittämällä (#595)', () => {
  it('kelaus alkaa puolen kierroksen jälkeen ja loppuu, kun pyöritys loppuu', () => {
    const reel = new StickReel();
    const out = spin(reel, 2, 1);
    const first = out.findIndex((o) => o.reel);
    expect(first / 60).toBeGreaterThan(0.45);
    expect(first / 60).toBeLessThan(0.6);
    expect(out.at(-1)).toMatchObject({ reel: true, gear: 0, busy: true });
    // Tatti jää paikalleen reunaan: kelaus loppuu, mutta tatti on yhä varattu.
    let last = out.at(-1)!;
    for (let i = 0; i < 30; i++) last = reel.step({ x: 0, y: 1 }, DT, true, false);
    expect(last).toMatchObject({ reel: false, busy: true });
    expect(center(reel)).toMatchObject({ reel: false, busy: false, twitch: false });
  });

  it('kalastajan silmin vaaditaan täysi kierros', () => {
    const out = spin(new StickReel(), 2, 1, true);
    const first = out.findIndex((o) => o.reel);
    expect(first / 60).toBeGreaterThan(0.95);
    expect(first / 60).toBeLessThan(1.1);
  });

  it('pyöritysnopeus valitsee vaihteen', () => {
    expect(spin(new StickReel(), 3, 1).at(-1)!.gear).toBe(0);
    expect(spin(new StickReel(), 4, 2).at(-1)!.gear).toBe(1);
    expect(spin(new StickReel(), 6, 3).at(-1)!.gear).toBe(2);
    expect(spin(new StickReel(), 8, 4.5).at(-1)!.gear).toBe(3);
    expect(spin(new StickReel(), 3, -2).at(-1)).toMatchObject({ reel: true, gear: 1 });
  });

  it('hidas ruudunpäivitys ei muuta vaihdetta: tatti luetaan joka neljännellä askeleella', () => {
    const reel = new StickReel();
    let last = reel.step({ x: 0, y: 1 }, DT, true, false);
    for (let i = 0; i < 240; i++) {
      const a = Math.PI / 2 + Math.floor(i / 4) * 4 * 2 * DT * Math.PI * 2;
      last = reel.step({ x: Math.cos(a), y: Math.sin(a) }, DT, true, false);
    }
    expect(last).toMatchObject({ reel: true, gear: 1 });
  });

  it('vaihde ei vaihdu rajalla edestakaisin', () => {
    expect(gearFor(1.45, 0)).toBe(0);
    expect(gearFor(1.7, 0)).toBe(1);
    expect(gearFor(1.35, 1)).toBe(1);
    expect(gearFor(1.1, 1)).toBe(0);
    expect(gearFor(9, null)).toBe(3);
  });

  it('nopea nykäisy taakse ja takaisin on vavan nykäisy', () => {
    const reel = new StickReel();
    for (let i = 0; i < 6; i++) reel.step({ x: 0.05, y: 1 }, DT, true, false);
    expect(center(reel).twitch).toBe(true);
    expect(center(reel).twitch).toBe(false);
  });

  it('hidas veto, sivuliike tai pyöritys ei nykäise', () => {
    const slow = new StickReel();
    for (let i = 0; i < 40; i++) slow.step({ x: 0, y: 1 }, DT, true, false);
    expect(center(slow).twitch).toBe(false);
    const side = new StickReel();
    for (let i = 0; i < 6; i++) side.step({ x: 1, y: 0.2 }, DT, true, false);
    expect(center(side).twitch).toBe(false);
    const spun = new StickReel();
    spin(spun, 1, 4);
    expect(center(spun).twitch).toBe(false);
  });

  it('ei kelaa eikä nykäise, kun tatti ei ole vapaa', () => {
    const reel = new StickReel();
    for (let i = 0; i < 120; i++) {
      const a = i * 0.2;
      expect(reel.step({ x: Math.cos(a), y: Math.sin(a) }, DT, false, false).reel).toBe(false);
    }
    for (let i = 0; i < 6; i++) reel.step({ x: 0, y: 1 }, DT, false, false);
    expect(center(reel, false).twitch).toBe(false);
  });

  it('suunnan vaihto aloittaa kierrokset alusta', () => {
    const reel = new StickReel();
    spin(reel, 1, 2);
    const back = spin(reel, 0.3, -2, false, Math.PI / 2);
    expect(back.at(-1)!.reel).toBe(false);
  });
});
