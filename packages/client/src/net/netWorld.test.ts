import { describe, expect, it } from 'vitest';
import { LUNKINJARVI, WaterBody } from '@lunki/shared';
import { NetWorld } from './netWorld';
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
