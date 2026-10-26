import { afterEach, describe, expect, it } from 'vitest';
import { LUNKINJARVI, WaterBody } from '@lunki/shared';
import { setLangForTest } from '../i18n';
import { NetWorld, lerpKickPhase } from './netWorld';
import type { NetSession } from './session';

const player = (name: string, tube: number, fins: number, lure: string) => ({
  name,
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  heading: 0,
  angVel: 0,
  kickPhase: 0,
  stamina: 1,
  ack: 0,
  tubeColor: tube,
  finColor: fins,
  shirtColor: fins,
  lineColor: 0xc3cbd2,
  rod: 'medium',
  lure,
  line: 'medium',
  leader: false,
  method: 'spin',
});

/** Kaksi saman selaimen ikkunaa: kummankin oma maailma omasta sessionId:stä. */
const worldFor = (sessionId: string) => {
  const players = new Map([
    ['x', player('X', 0x1c232b, 0x1c232b, 'spoon')],
    ['y', player('Y', 0xeef2f3, 0xeef2f3, 'wobbler')],
  ]);
  const session = { sessionId, room: { state: { players } } } as unknown as NetSession;
  return new NetWorld(session, new WaterBody(LUNKINJARVI));
};

describe('omat tiedot moninpelissä', () => {
  it('värit, varusteet ja nimi tulevat palvelimen tilasta, eivät selaimen muistista', () => {
    const x = worldFor('x');
    const y = worldFor('y');
    expect(x.ownAppearance).toMatchObject({ tube: 0x1c232b, fins: 0x1c232b });
    expect(y.ownAppearance).toMatchObject({ tube: 0xeef2f3, fins: 0xeef2f3 });
    expect(x.ownTackle?.lure).toBe('spoon');
    expect(y.ownTackle?.lure).toBe('wobbler');
    expect(x.ownName).toBe('X');
  });
});

describe('poistuneen ilmoitus', () => {
  afterEach(() => setLangForTest('fi'));

  for (const lang of ['fi', 'en'] as const)
    it(`katkenneen pelaajan nimeen ei jää katkosmerkintää (${lang}, #281)`, () => {
      setLangForTest(lang);
      const players = new Map([
        ['me', { ...player('Minä', 0, 0, 'spoon'), connected: true }],
        ['y', { ...player('Ystävä', 0, 0, 'spoon'), connected: true }],
      ]);
      const state = { players, catches: [] };
      const session = { sessionId: 'me', room: { state } } as unknown as NetSession;
      const world = new NetWorld(session, new WaterBody(LUNKINJARVI));
      const left: string[] = [];
      world.onPeerLeft = (name) => left.push(name);
      session.onState?.(state as never);
      players.get('y')!.connected = false;
      session.onState?.(state as never);
      players.delete('y');
      session.onState?.(state as never);
      expect(left).toEqual(['Ystävä']);
    });
});

describe('muiden liike verkon heitellessä', () => {
  it('kisan aikana tasainen liike piirtyy tasaisena, vaikka tilat saapuvat epätasaisesti', () => {
    const players = new Map([
      ['me', player('Minä', 0, 0, 'spoon')],
      ['y', player('Ystävä', 0, 0, 'spoon')],
    ]);
    const state = { players, catches: [], phase: 'playing', clock: 0 };
    const session = { sessionId: 'me', room: { state } } as unknown as NetSession;
    let now = 0;
    const world = new NetWorld(session, new WaterBody(LUNKINJARVI), () => now);
    // Palvelin lähettää 50 ms välein, ystävä etenee 1 m/s; viive vaihtelee 0–40 ms.
    const jitter = [0, 0.04, 0.01, 0.03, 0, 0.04, 0.02, 0, 0.035, 0.01, 0.04, 0];
    const arrivals = jitter.map((j, i) => ({ at: 1 + i * 0.05 + j, clock: i * 0.05 }));
    const xs: number[] = [];
    let k = 0;
    for (now = 1; now < 1.6; now += 1 / 60) {
      while (k < arrivals.length && arrivals[k]!.at <= now) {
        state.clock = arrivals[k]!.clock;
        players.get('y')!.x = state.clock;
        session.onState?.(state as never);
        k++;
      }
      const x = world.others()[0]?.pos.x;
      if (x !== undefined && now > 1.2) xs.push(x);
    }
    const steps = xs.slice(1).map((x, i) => x - xs[i]!);
    // Saapumishetkellä leimattuna askeleet vaihtelisivat pysähdyksestä 2,5-kertaiseen.
    for (const s of steps) expect(Math.abs(s * 60 - 1)).toBeLessThan(0.1);
  });
});

describe('muiden räpylät', () => {
  it('potkuvaihe interpoloidaan eteenpäin kiertäen', () => {
    expect(lerpKickPhase(0.2, 0.3, 0.5)).toBeCloseTo(0.25);
    expect(lerpKickPhase(0.95, 0.05, 0.5)).toBeCloseTo(0);
    expect(lerpKickPhase(0.9, 0.04, 0.25)).toBeCloseTo(0.935);
    // Potku alkaa tai loppuu: ei liu'uteta nollasta.
    expect(lerpKickPhase(0, 0.06, 0.5)).toBe(0.06);
    expect(lerpKickPhase(0.5, 0, 0.5)).toBe(0);
  });
});

describe('muut lyhyessä verkkokatkossa', () => {
  const setup = () => {
    const players = new Map([
      ['me', player('Minä', 0, 0, 'spoon')],
      ['y', player('Ystävä', 0, 0, 'spoon')],
    ]);
    const state = { players, catches: [], phase: 'playing', clock: 0 };
    const session = { sessionId: 'me', room: { state } } as unknown as NetSession;
    const clock = { now: 0 };
    const world = new NetWorld(session, new WaterBody(LUNKINJARVI), () => clock.now);
    const send = (at: number, serverTime: number, x: number) => {
      clock.now = at;
      state.clock = serverTime;
      players.get('y')!.x = x;
      session.onState?.(state as never);
    };
    return { world, clock, send };
  };

  it('ystävä ui eteenpäin jumin ajan eikä jähmety', () => {
    const { world, clock, send } = setup();
    // 1 m/s, sitten tilat lakkaavat tulemasta.
    for (let i = 0; i <= 10; i++) send(1 + i * 0.05, i * 0.05, i * 0.05);
    const last = 0.5;
    clock.now = 1.5 + 0.12 + 0.1;
    expect(world.others()[0]!.pos.x).toBeCloseTo(last + 0.1, 3);
    // Pitkässä katkossa liike pysähtyy jatkoajan päähän.
    clock.now = 1.5 + 0.12 + 2;
    expect(world.others()[0]!.pos.x).toBeCloseTo(last + 0.25, 3);
  });

  it('siirtoa (esim. trombi) ei jatketa', () => {
    const { world, clock, send } = setup();
    send(1, 0, 0);
    send(1.05, 0.05, 30);
    clock.now = 1.05 + 0.12 + 0.2;
    expect(world.others()[0]!.pos.x).toBe(30);
  });
});
