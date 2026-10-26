import { describe, expect, it } from 'vitest';
import {
  DIFFICULTIES,
  FLY_CAST,
  createFlyCast,
  stepFlyCast,
  type FlyCastEvents,
} from '@lunki/shared';
import { FlyCastControl, KEY_TARGET_LINE, ROD_PIXELS } from './flyCastControl';

const DT = 1 / 60;
const none = { grip: true, haul: false, key: false, dx: 0, dy: 0 };
const env = { assist: DIFFICULTIES.normal.flyCast, power: 1, random: () => 0 };

describe('perhoheiton ohjaus (#235)', () => {
  it('hiiri poispäin vie vapaa eteen, kohti itseä taakse', () => {
    const ctl = new FlyCastControl();
    ctl.start(false);
    const c = createFlyCast(FLY_CAST.startAerial, false);
    expect(ctl.read(c, { ...none, dy: -ROD_PIXELS / 2 }, DT).rod).toBeCloseTo(1);
    expect(ctl.read(c, { ...none, dy: 100 }, DT).rod).toBeLessThan(0);
    const input = ctl.read(c, { ...none, grip: false, haul: true, dx: 50 }, DT);
    expect(input).toMatchObject({ grip: false, haul: true });
    expect(input.aim).toBeGreaterThan(0);
  });

  it('näppäimistön rytmiheitto: painallus suoristuneelle siimalle vuorottelee suuntaa', () => {
    const ctl = new FlyCastControl();
    ctl.start(true);
    const c = createFlyCast(FLY_CAST.startAerial, false);
    const all: FlyCastEvents[] = [];
    let landed: FlyCastEvents['landed'];
    for (let i = 0; i < 20 / DT && !landed; i++) {
      // Painetaan, kun siima on suorassa, kuusi liikettä; sitten annetaan laskeutua.
      const press = all.length < 6 && c.phase === 'loop' && c.loopAge >= c.loopTime;
      const ev = stepFlyCast(c, ctl.read(c, { ...none, key: press }, DT), env, DT);
      if (ev.stop) all.push(ev);
      expect(ev.crack).toBeUndefined();
      landed = ev.landed;
    }
    expect(all.map((e) => e.stop!.dir)).toEqual([-1, 1, -1, 1, -1, 1]);
    expect(landed!.distance).toBeGreaterThan(12);
    expect(landed!.distance).toBeLessThan(KEY_TARGET_LINE + 6);
  });

  it('liian aikainen painallus läimäyttää', () => {
    const ctl = new FlyCastControl();
    ctl.start(true);
    const c = createFlyCast(10, false);
    let crack = false;
    for (let i = 0; i < 40; i++) {
      const ev = stepFlyCast(c, ctl.read(c, { ...none, key: i === 12 }, DT), env, DT);
      crack ||= ev.crack === true;
    }
    expect(crack).toBe(true);
  });
});
