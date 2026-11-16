import { describe, expect, it } from 'vitest';
import { CHASE, ChaseOrbit, chaseArc, lakeLevel, nextView } from './chaseCamera';

const still = { turn: 0, tilt: 0, drag: null };

describe('näkymän kierto', () => {
  it('kiertää silmin → takaa → ylhäältä', () => {
    expect(nextView('pov')).toBe('chase');
    expect(nextView('chase')).toBe('top');
    expect(nextView('top')).toBe('pov');
  });

  it('katsojalla ei ole takaa-näkymää', () => {
    expect(nextView('pov', true)).toBe('top');
    expect(nextView('top', true)).toBe('pov');
  });

  it('takaa-näkymä on järven tasolla kuten silmin', () => {
    expect(lakeLevel('chase')).toBe(true);
    expect(lakeLevel('top')).toBe(false);
  });
});

describe('takaa-näkymän kamera', () => {
  it('kaari on alhaalla lähellä ja ylhäällä kaukana', () => {
    const low = chaseArc(0);
    const high = chaseArc(1);
    expect(low).toEqual(CHASE.low);
    expect(high).toEqual(CHASE.high);
    expect(chaseArc(0.5).distance).toBeGreaterThan(low.distance);
    expect(chaseArc(0.5).elevation).toBeLessThan(high.elevation);
    expect(chaseArc(2)).toEqual(high);
  });

  it('nuoli vasemmalle kiertää katsetta vasemmalle ja ylös nostaa kameraa', () => {
    const o = new ChaseOrbit();
    o.step(0.5, { turn: 1, tilt: 1, drag: null }, 720);
    expect(o.yaw).toBeCloseTo(CHASE.turnRate * 0.5);
    expect(o.tilt).toBeCloseTo(CHASE.start + CHASE.tiltRate * 0.5);
  });

  it('piirto liukuu askelten välillä (viewAt)', () => {
    const o = new ChaseOrbit();
    o.step(0.5, { turn: 1, tilt: 1, drag: null }, 720);
    const before = o.view;
    o.step(0.5, { turn: 1, tilt: 1, drag: null }, 720);
    const after = o.view;
    expect(o.viewAt(0)).toEqual(before);
    expect(o.viewAt(1).yaw).toBeCloseTo(after.yaw);
    expect(o.viewAt(0.5).yaw).toBeCloseTo((before.yaw + after.yaw) / 2);
    expect(o.viewAt(0.5).tilt).toBeCloseTo((before.tilt + after.tilt) / 2);
  });

  it('kaari pysähtyy päihinsä ja kierto kulkee ympäri', () => {
    const o = new ChaseOrbit();
    for (let i = 0; i < 600; i++) o.step(1 / 60, { turn: 1, tilt: -1, drag: null }, 720);
    expect(o.tilt).toBe(0);
    expect(Math.abs(o.yaw)).toBeLessThanOrEqual(Math.PI);
  });

  it('sormen veto oikealle kääntää katsetta oikealle ja veto ylös nostaa', () => {
    const o = new ChaseOrbit();
    o.step(1 / 60, { turn: 0, tilt: 0, drag: { dx: 72, dy: -72 } }, 720);
    expect(o.yaw).toBeCloseTo(-0.1 * CHASE.dragTurn);
    expect(o.tilt).toBeCloseTo(CHASE.start + 0.1 * CHASE.dragTilt);
  });

  it('kierto ja korkeus jäävät siihen, mihin pelaaja ne käänsi', () => {
    const o = new ChaseOrbit();
    o.yaw = 1.2;
    o.tilt = 0.8;
    for (let i = 0; i < 240; i++) o.step(1 / 60, still, 720);
    expect(o.yaw).toBe(1.2);
    expect(o.tilt).toBe(0.8);
  });

  it('noston ajaksi kamera liukuu sivulle ja palaa sen jälkeen (#707)', () => {
    const o = new ChaseOrbit();
    const tilt = o.tilt;
    const run = (seconds: number, landing: boolean) => {
      for (let i = 0; i < seconds * 60; i++) o.step(1 / 60, still, 720, landing);
    };
    run(1, true);
    expect(o.view.yaw).toBeCloseTo(CHASE.landing.yaw);
    expect(o.view.tilt).toBeCloseTo(tilt + CHASE.landing.tilt);
    // Pelaajan oma kulma ei muutu: liuku on sen päällä.
    expect(o.yaw).toBe(0);
    // Noston ajan kamera viipyy sivulla.
    run(CHASE.landing.linger - 0.5, false);
    expect(o.view.yaw).toBeCloseTo(CHASE.landing.yaw);
    run(1.5, false);
    expect(o.view.yaw).toBeCloseTo(0);
    expect(o.view.tilt).toBeCloseTo(tilt);
  });

  it("pelaajan oma kääntö voittaa noston liu'un (#707)", () => {
    const o = new ChaseOrbit();
    for (let i = 0; i < 60; i++) o.step(1 / 60, still, 720, true);
    const before = o.view;
    // Kääntö ei hyppäytä kuvaa: liuku jää pelaajan kulmaksi.
    o.step(1 / 60, { turn: -1, tilt: 0, drag: null }, 720, true);
    expect(o.view.yaw).toBeCloseTo(before.yaw - CHASE.turnRate / 60);
    const own = o.view.yaw;
    // Kamera ei enää liiku itsestään tämän noston aikana eikä sen jälkeen.
    for (let i = 0; i < 300; i++) o.step(1 / 60, still, 720, i < 60);
    expect(o.view.yaw).toBeCloseTo(own);
    // Seuraava nosto liukuu taas.
    for (let i = 0; i < 60; i++) o.step(1 / 60, still, 720, true);
    expect(o.view.yaw).toBeCloseTo(own + CHASE.landing.yaw);
  });
});
