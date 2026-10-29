import { describe, expect, it } from 'vitest';
import {
  DIFFICULTIES,
  FLY_CAST,
  createFlyCast,
  stepFlyCast,
  type FlyCastEvents,
} from '@lunki/shared';
import {
  FlyCastControl,
  GRIP_HOLD,
  KEY_TARGET_LINE,
  ROD_PIXELS,
  touchToRodPixels,
} from './flyCastControl';

const DT = 1 / 60;
const none = { grip: true, haul: false, key: false, dx: 0, dy: 0 };
const env = { assist: DIFFICULTIES.normal.flyCast, power: 1, random: () => 0 };

describe('perhoheiton ohjaus (#235)', () => {
  it('hiiri poispäin vie vapaa eteen, kohti itseä taakse', () => {
    const ctl = new FlyCastControl();
    ctl.start('mouse');
    const c = createFlyCast(FLY_CAST.startAerial, false);
    expect(ctl.read(c, { ...none, dy: -ROD_PIXELS / 2 }, DT).rod).toBeCloseTo(1);
    expect(ctl.read(c, { ...none, dy: 100 }, DT).rod).toBeLessThan(0);
    // Siimakäden nappia painettiin: käsi on pelaajan.
    ctl.read(c, { ...none, gripPressed: true }, DT);
    const input = ctl.read(c, { ...none, grip: false, haul: true, dx: 50 }, DT);
    expect(input).toMatchObject({ grip: false, haul: true });
    // Kulma kasvaa vasemmalle: liike oikealle vie heiton oikealle (#397).
    expect(input.aim).toBeLessThan(0);
  });

  it('näppäimistön rytmiheitto: painallus suoristuneelle siimalle vuorottelee suuntaa', () => {
    const ctl = new FlyCastControl();
    ctl.start('keyboard');
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
    ctl.start('keyboard');
    const c = createFlyCast(10, false);
    let crack = false;
    for (let i = 0; i < 40; i++) {
      const ev = stepFlyCast(c, ctl.read(c, { ...none, key: i === 12 }, DT), env, DT);
      crack ||= ev.crack === true;
    }
    expect(crack).toBe(true);
  });
});

describe('perhoheitto kosketuksella (#236)', () => {
  const H = 700;
  /** Pyyhkäisy `px` (CSS px, + = alas) tasaisesti `steps` askeleessa, sitten sormi pysähtyy. */
  function* swipe(px: number, steps: number) {
    for (let i = 0; i < steps; i++) yield touchToRodPixels(px / steps, H);
    for (let i = 0; i < 4; i++) yield 0;
  }

  it('pyyhkäisy alas on takaheitto, ylös eteenheitto; siimakäsi toimii itsestään', () => {
    const ctl = new FlyCastControl();
    ctl.start('touch');
    const c = createFlyCast(8, false);
    const stops: (-1 | 1)[] = [];
    let landed: FlyCastEvents['landed'];
    const step = (dy: number) => {
      const ev = stepFlyCast(c, ctl.read(c, { ...none, grip: false, dy }, DT), env, DT);
      if (ev.stop) stops.push(ev.stop.dir);
      expect(ev.crack).toBeUndefined();
      landed ??= ev.landed;
    };
    for (const dy of swipe(260, 8)) step(dy);
    // Odotetaan, että siima suoristuu takana.
    for (let i = 0; i < 120 && !(c.phase === 'loop' && c.loopAge >= c.loopTime); i++) step(0);
    for (const dy of swipe(-260, 8)) step(dy);
    for (let i = 0; i < 300 && !landed; i++) step(0);
    expect(stops).toEqual([-1, 1]);
    // Siimakäsi päästi siimaa silmukoiden auetessa: heitto on pidempi kuin alkuperäinen siima.
    expect(landed!.distance).toBeGreaterThan(8);
  });

  it('SIIMA-napin jälkeen siimakäsi on pelaajan', () => {
    const ctl = new FlyCastControl();
    ctl.start('touch');
    const c = createFlyCast(8, false);
    c.phase = 'loop';
    expect(ctl.read(c, { ...none, grip: false }, DT).grip).toBe(false);
    c.phase = 'stroke';
    expect(ctl.read(c, { ...none, grip: false }, DT).grip).toBe(true);
    expect(ctl.read(c, { ...none, grip: true }, DT).grip).toBe(true);
    expect(ctl.read(c, { ...none, grip: false }, DT).grip).toBe(false);
  });
});

describe('perhoheitto kosketuslevyllä (#400)', () => {
  /** Hiiren liike `px` (+ = itseä kohti) tasaisesti `steps` askeleessa, sitten pysähdys. */
  function* move(px: number, steps: number) {
    for (let i = 0; i < steps; i++) yield px / steps;
    for (let i = 0; i < 4; i++) yield 0;
  }

  it('napautus aloittaa, ja vapaa heilutetaan painamatta: siimakäsi toimii itsestään', () => {
    const ctl = new FlyCastControl();
    ctl.start('mouse');
    const c = createFlyCast(8, false);
    const stops: { dir: -1 | 1; speed: number }[] = [];
    let landed: FlyCastEvents['landed'];
    const step = (dy: number, b: Partial<typeof none> = {}) => {
      const input = ctl.read(c, { ...none, grip: false, dy, ...b }, DT);
      const ev = stepFlyCast(c, input, env, DT);
      if (ev.stop) stops.push(ev.stop);
      expect(ev.crack).toBeUndefined();
      landed ??= ev.landed;
    };
    for (const dy of move(260, 8)) step(dy);
    for (let i = 0; i < 120 && !(c.phase === 'loop' && c.loopAge >= c.loopTime); i++) step(0);
    // Veto F:llä toisella kädellä eteenheiton aikana.
    let first = true;
    for (const dy of move(-260, 8)) {
      step(dy, { haul: first && dy !== 0 });
      first = false;
    }
    for (let i = 0; i < 300 && !landed; i++) step(0);
    expect(stops.map((s) => s.dir)).toEqual([-1, 1]);
    // Vapa latautui (käsi ei ollut auki liikkeen aikana), ja veto lisäsi vauhtia.
    expect(stops[1]!.speed).toBeGreaterThan(stops[0]!.speed);
    expect(landed!.distance).toBeGreaterThan(8);
  });

  it('välilyönti tai hiiren nappi ottaa siimakäden pelaajalle', () => {
    const ctl = new FlyCastControl();
    ctl.start('mouse');
    const c = createFlyCast(8, false);
    c.phase = 'stroke';
    // Lyhyt napautus heiton alussa ei vielä ota kättä.
    expect(ctl.read(c, { ...none, grip: true }, DT).grip).toBe(true);
    expect(ctl.read(c, { ...none, grip: false }, DT).grip).toBe(true);
    // Uusi painallus ottaa.
    expect(ctl.read(c, { ...none, grip: true, gripPressed: true }, DT).grip).toBe(true);
    expect(ctl.read(c, { ...none, grip: false }, DT).grip).toBe(false);
  });

  it('heiton aloittanut nappi pohjassa ottaa siimakäden', () => {
    const ctl = new FlyCastControl();
    ctl.start('mouse');
    const c = createFlyCast(8, false);
    c.phase = 'stroke';
    for (let t = 0; t <= GRIP_HOLD + DT; t += DT) ctl.read(c, { ...none, grip: true }, DT);
    expect(ctl.read(c, { ...none, grip: false }, DT).grip).toBe(false);
  });
});
