import { describe, expect, it } from 'vitest';
import {
  CAST,
  castAngle,
  createFishing,
  rodTip,
  stepFishing,
  type FishingContext,
  type FishingState,
} from '@lunki/shared';
import { CastControl, KEY_AIM_DISTANCE } from './castControl';

const DT = 1 / 60;
const ctx: FishingContext = {
  tubePos: { x: 10, y: 20 },
  heading: 0.6,
  isWater: () => true,
  depthAt: () => 3,
};
/** Hiiri osoittaa renkaan vasemmalle puolelle, eri suuntaan kuin katse. */
const MOUSE_AIM = { x: 10 + 20 * Math.cos(1.4), y: 20 + 20 * Math.sin(1.4) };

/** Yksi askel kuten pelissä: napit → heittonappi ja tähtäys → kalastus. */
function step(s: FishingState, c: CastControl, mouse: boolean, key: boolean) {
  const castHeld = c.castHeld(s.stage, { mouse, key });
  const aim = c.aim(MOUSE_AIM, ctx.tubePos, ctx.heading);
  stepFishing(s, { aim, castHeld, reel: mouse || key, cancel: false }, ctx, DT);
}

function castWith(mouse: boolean, key: boolean) {
  const s = createFishing();
  const c = new CastControl();
  for (let t = 0; t < CAST.chargeTime * 0.6; t += DT) step(s, c, mouse, key);
  expect(s.stage).toBe('charging');
  step(s, c, false, false);
  expect(s.stage).toBe('flight');
  return { s, c };
}

const angleOf = (s: FishingState) => {
  const tip = rodTip(ctx.tubePos, ctx.heading);
  return Math.atan2(s.flight!.pos.y - tip.y, s.flight!.pos.x - tip.x);
};

describe('heitto näppäimistöllä (#227)', () => {
  it('välilyönnillä ladattu heitto lähtee katsesuuntaan', () => {
    const { s } = castWith(false, true);
    // Ensimmäinen lentoaskel siirtää viehettä heiton suuntaan.
    const c = new CastControl();
    step(s, c, false, false);
    expect(angleOf(s)).toBeCloseTo(ctx.heading, 3);
  });

  it('hiirellä heitto lähtee hiiren suuntaan kuten ennen', () => {
    const { s } = castWith(true, false);
    step(s, new CastControl(), false, false);
    expect(angleOf(s)).toBeCloseTo(castAngle(ctx, MOUSE_AIM), 3);
    expect(Math.abs(castAngle(ctx, MOUSE_AIM) - ctx.heading)).toBeGreaterThan(0.5);
  });

  it('päästämisen jälkeen kelaus alkaa vasta uudesta painalluksesta', () => {
    const { s, c } = castWith(false, true);
    for (let t = 0; t < 6 && s.stage !== 'water'; t += DT) step(s, c, false, false);
    expect(s.stage).toBe('water');
    const line = s.lineLength;
    for (let i = 0; i < 30; i++) step(s, c, false, false);
    expect(s.lineLength).toBe(line);
    for (let i = 0; i < 30; i++) step(s, c, false, true);
    expect(s.lineLength).toBeLessThan(line);
  });

  it('kotiin kelattu viehe ei lähde uuteen heittoon ennen kuin välilyönti päästetään', () => {
    const { s, c } = castWith(false, true);
    for (let t = 0; t < 120 && s.stage !== 'idle'; t += DT) step(s, c, false, true);
    expect(s.stage).toBe('idle');
    for (let i = 0; i < 30; i++) step(s, c, false, true);
    expect(s.stage).toBe('idle');
    step(s, c, false, false);
    step(s, c, false, true);
    expect(s.stage).toBe('charging');
  });

  it('tähtäyspiste on katsesuunnassa vain näppäimistöheitossa', () => {
    const c = new CastControl();
    c.castHeld('idle', { mouse: false, key: true });
    const p = c.aim(MOUSE_AIM, ctx.tubePos, ctx.heading);
    expect(Math.hypot(p.x - ctx.tubePos.x, p.y - ctx.tubePos.y)).toBeCloseTo(KEY_AIM_DISTANCE);
    c.castHeld('idle', { mouse: true, key: false });
    expect(c.aim(MOUSE_AIM, ctx.tubePos, ctx.heading)).toBe(MOUSE_AIM);
  });
});
