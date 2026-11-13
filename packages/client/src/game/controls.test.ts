import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_TACKLE, createFishing, type FishingState } from '@lunki/shared';
import type { Input } from '../engine/input';
import { en } from '../i18n/en';
import { fi } from '../i18n/fi';
import { setLangForTest, type MsgKey } from '../i18n';
import {
  CONTROLS,
  Controls,
  bindingText,
  contextActions,
  controlText,
  keyName,
  setControlMode,
  setOrbitCamera,
  withKey,
  type Action,
} from './controls';

/** Syötteen korvike: pohjassa olevat ja tällä askeleella painetut koodit. */
function fakeInput(down: string[], pressed: string[] = []) {
  const held = new Set(down);
  const now = new Set(pressed);
  const input = {
    isDown: (c: string) => held.has(c),
    wasPressed: (c: string) => now.has(c),
    simulate: (c: string, d: boolean) => {
      if (d) {
        held.add(c);
        now.add(c);
      } else held.delete(c);
    },
  };
  return new Controls(input as unknown as Input);
}

const fly = (s: Partial<FishingState> = {}): FishingState => ({
  ...createFishing({ ...DEFAULT_TACKLE, method: 'fly' }),
  ...s,
});
const spin = (s: Partial<FishingState> = {}): FishingState => ({ ...createFishing(), ...s });

describe('toimintokartta', () => {
  afterEach(() => setLangForTest('fi'));

  it('toiminto on pohjassa näppäimestä tai kosketusnapista', () => {
    expect(fakeInput(['ArrowUp']).isDown('forward')).toBe(true);
    expect(fakeInput(['KeyW']).isDown('back')).toBe(false);
    const c = fakeInput([]);
    c.set('reel', true);
    expect(c.isDown('reel')).toBe(true);
    // Kosketuksen KELAA ei ole välilyönti: se ei heitä.
    expect(c.isDown('castForward')).toBe(false);
    c.tap('lure');
    expect(c.wasPressed('lure')).toBe(true);
    expect(c.isDown('lure')).toBe(false);
  });

  it('hiiren oikea ei peru heittoa, vaan on oma toimintonsa', () => {
    const c = fakeInput(['Mouse2'], ['Mouse2']);
    expect(c.isDown('cancel')).toBe(false);
    expect(c.isDown('cancelCharge')).toBe(true);
    expect(c.wasPressed('haul')).toBe(true);
    expect(c.wasPressed('lift')).toBe(true);
  });

  it('jokaisella kosketusnapilla on vihje ja teksti sanakirjassa', () => {
    for (const a of Object.keys(CONTROLS) as Action[]) {
      const b = CONTROLS[a] as { label?: MsgKey; title?: MsgKey; touch?: string };
      const touch = b.touch && /^[a-z]/.test(b.touch) ? (b.touch as MsgKey) : undefined;
      const keys = [b.label, b.title, touch].filter((k): k is MsgKey => k !== undefined);
      for (const k of keys) {
        expect(fi[k], `${a}: ${k}`).toBeTruthy();
        expect(en[k], `${a}: ${k}`).toBeTruthy();
      }
    }
  });

  it('näppäinten nimet ohjeeseen', () => {
    expect(keyName('KeyW')).toBe('W');
    expect(keyName('ArrowLeft')).toBe('←');
    expect(keyName('Digit4')).toBe('4');
    expect(keyName('Space')).toBe('välilyönti');
    expect(bindingText('forward', 'keys')).toBe('W/↑');
    expect(bindingText('sprint', 'keys')).toBe('Shift');
    expect(bindingText('forward', 'touch')).toBe('tatti ylös');
    expect(bindingText('reelSlack', 'touch')).toBe('KELALLE');
    // NOP-napin vaihteen kierrolla ei ole näppäintä.
    expect(bindingText('gearNext', 'keys')).toBeNull();
  });

  it('sama ohjeteksti näppäimistölle ja kosketukselle', () => {
    expect(controlText('help.reel', {}, { mode: 'keys' })).toBe(
      'Hiiri tai välilyönti pohjassa = kelaa (tärpissä heti) · hiiren oikea/J = nykäisy, ison kalan vastaisku',
    );
    expect(controlText('help.reel', {}, { mode: 'touch' })).toBe(
      'Sormi järvellä tai KELAA pohjassa = kelaa (tärpissä heti) · NYKÄISE = nykäisy, ison kalan vastaisku',
    );
    expect(controlText('game.viewTop', {}, { mode: 'touch' })).toBe('Ylhäältä (KAM)');
    expect(controlText('game.viewTop', {}, { mode: 'keys' })).toBe('Ylhäältä (V)');
    setLangForTest('en');
    expect(controlText('game.viewTop', {}, { mode: 'touch' })).toBe('From above (CAM)');
  });

  it('osa jätetään pois, jos toimintoa ei ole', () => {
    expect(controlText('help.bar', {}, { mode: 'keys' })).toBe(
      'V = näkymä · G = käsimerkit · rulla = zoom · H = ohje · Esc = tauko',
    );
    expect(controlText('help.bar', {}, { mode: 'keys', skip: ['zoom'] })).toBe(
      'V = näkymä · G = käsimerkit · H = ohje · Esc = tauko',
    );
    expect(controlText('help.gear', {}, { mode: 'touch' })).toBe(
      'NOP = kelausnopeus · PIKA = pikakelaus · JAR−/JAR+ = jarru',
    );
  });

  it('peliohjaimella ohjeessa ohjaimen napit: Xbox tai PlayStation', () => {
    const c = fakeInput(['Pad0', 'PadLsUp'], ['Pad2']);
    expect(c.isDown('reel')).toBe(true);
    expect(c.isDown('castForward')).toBe(true);
    expect(c.isDown('forward')).toBe(true);
    expect(c.wasPressed('twitch')).toBe(true);
    expect(c.wasPressed('lift')).toBe(true);
    expect(controlText('help.reel', {}, { mode: 'pad' })).toBe(
      'A/RT pohjassa = kelaa (tärpissä heti) · X = nykäisy, ison kalan vastaisku',
    );
    expect(controlText('help.cast', {}, { mode: 'pad' })).toBe('Oikea tatti = heiton suunta');
    expect(controlText('help.cast', {}, { mode: 'keys' })).toBe(
      'Hiiri: tähtää, pidä ja päästä = heitto',
    );
    expect(controlText('help.move', {}, { mode: 'pad' })).toBe(
      'Vasen tatti ↓ = potki selkä edellä (nopein) · vasen tatti ↑ = potki eteenpäin',
    );
    expect(controlText('help.flyCast', {}, { mode: 'pad' })).toBe(
      'Perhoheitto: oikea tatti ↓ = taakse, oikea tatti ↑ = eteen',
    );
    expect(bindingText('zoom', 'pad')).toBe('LT+✚↑/✚↓');
    setControlMode('pad', 'playstation');
    expect(bindingText('zoom')).toBe('L2+✚↑/✚↓');
    expect(controlText('help.gear')).toBe('✚→ = kelausnopeus · ✚↓/✚↑ = jarru');
    expect(withKey('tackle.lure', 'lure')).toBe('Viehe (L1)');
    expect(controlText('help.reel')).toMatch(
      /^✕\/R2 pohjassa = kelaa \(tärpissä heti\) · □ = nykäisy/,
    );
    setControlMode('keys', 'xbox');
  });

  it('peliohjaimen yhdistelmä: LT pohjassa ristiohjain zoomaa eikä säädä jarrua', () => {
    const drag = fakeInput(['Pad12'], ['Pad12']);
    expect(drag.wasPressed('dragMore')).toBe(true);
    expect(drag.wasPressed('zoomIn')).toBe(false);
    const zoom = fakeInput(['Pad6', 'Pad13'], ['Pad13']);
    expect(zoom.wasPressed('zoomOut')).toBe(true);
    expect(zoom.wasPressed('zoomIn')).toBe(false);
    expect(zoom.wasPressed('dragLess')).toBe(false);
    expect(zoom.isDown('sprint')).toBe(true);
  });

  it('peliohjaimen yhdistelmä: LT pohjassa oikean tatin painallus piilottaa ohjeen', () => {
    const sonar = fakeInput(['Pad11'], ['Pad11']);
    expect(sonar.wasPressed('sonar')).toBe(true);
    expect(sonar.wasPressed('help')).toBe(false);
    const help = fakeInput(['Pad6', 'Pad11'], ['Pad11']);
    expect(help.wasPressed('help')).toBe(true);
    expect(help.wasPressed('sonar')).toBe(false);
    expect(bindingText('help', 'pad')).toBe('LT+RS');
  });

  it('kaikki ohjetekstien {toiminnot} ovat kartassa', () => {
    const vars = /\{(\w+(?:\|\w+)*)\}/g;
    for (const [k, text] of Object.entries(fi)) {
      if (!/^(help|ctl|menu\.controls|tackle\.(lure|fly|flyHint|lureInRace)$)/.test(k)) continue;
      for (const m of text.matchAll(vars))
        for (const a of m[1]!.split('|')) expect(CONTROLS, `${k}: ${a}`).toHaveProperty(a);
    }
  });
});

describe('tilannenapit kosketuksella', () => {
  it('virveli: HEITÄ ennen heittoa, sitten KELAA; latauksen aikana KATKO on PERU', () => {
    expect(contextActions(spin(), false)).toEqual({
      main: 'castForward',
      line: 'lineGrip',
      tool: 'cut',
    });
    expect(contextActions(spin({ stage: 'charging' }), false).tool).toBe('cancel');
    expect(contextActions(spin({ stage: 'flight' }), false).main).toBe('reel');
    // Nosto (#366): kala pinnassa, iso nappi on NOSTA tai isoimmille HAAVI.
    const landing = (net: boolean) =>
      contextActions(
        spin({ stage: 'water', hookedId: 1, landing: { age: 0, net, lunge: 0 } }),
        false,
      ).main;
    expect(landing(false)).toBe('land');
    expect(landing(true)).toBe('landNet');
    // Vapaalla vieheellä KATKO-napin paikalla on NYKÄISE (#363).
    expect(contextActions(spin({ stage: 'water' }), false)).toEqual({
      main: 'reel',
      line: 'lift',
      tool: 'twitch',
    });
    expect(contextActions(spin({ stage: 'water' }), false, true).tool).toBe('cut');
    // Tärpissä NYKÄISE on vastaisku: iso kala tarttuu vain siihen (#402).
    expect(contextActions(spin({ stage: 'water', struckId: 1 }), false).tool).toBe('twitch');
    expect(contextActions(spin({ stage: 'water', hookedId: 1 }), false).tool).toBe('cut');
    expect(contextActions(spin({ stage: 'water', onLand: true }), false).tool).toBe('cut');
  });

  it('perho: HEITÄ valmiina, heitossa VETO ja PERU, rytmiheitossa HEITÄ', () => {
    expect(contextActions(fly(), false).main).toBe('castForward');
    expect(contextActions(fly({ stage: 'casting' }), false)).toEqual({
      main: 'haul',
      line: 'lineGrip',
      tool: 'cancel',
    });
    expect(contextActions(fly({ stage: 'casting' }), true).main).toBe('castForward');
  });

  it('perho vedessä: VETO ja NOSTA, kalan kanssa KELALLE', () => {
    const water = fly({ stage: 'water', onReel: false });
    expect(contextActions(water, false)).toEqual({ main: 'strip', line: 'lift', tool: 'cut' });
    expect(contextActions({ ...water, hookedId: 3 }, false).line).toBe('reelSlack');
    // Tärpissä NOSTA on vastaisku (#399).
    expect(contextActions({ ...water, struckId: 3 }, false).line).toBe('lift');
    // Kelalla kalaa väsytetään kelaamalla.
    expect(contextActions({ ...water, hookedId: 3, onReel: true }, false).main).toBe('reel');
  });
});

describe('takaa-näkymän kamera (#691)', () => {
  afterEach(() => {
    setOrbitCamera(false);
    setControlMode('keys');
  });

  /** Syöte, jossa on myös oikea tatti ja sormi järvellä. */
  function orbitInput(down: string[], extra: Partial<Input> = {}) {
    const held = new Set(down);
    return new Controls({
      isDown: (c: string) => held.has(c),
      wasPressed: () => false,
      padAim: { x: 0, y: 0 },
      finger: false,
      dragDX: 0,
      dragDY: 0,
      ...extra,
    } as unknown as Input);
  }

  it('muissa näkymissä nuolet liikuttavat eikä kameraa ohjata', () => {
    const c = orbitInput(['ArrowUp', 'ArrowLeft']);
    expect(c.isDown('forward')).toBe(true);
    expect(c.isDown('left')).toBe(true);
    expect(c.isDown('camUp')).toBe(false);
    expect(c.cameraInput()).toEqual({ turn: 0, tilt: 0, drag: null });
    expect(bindingText('forward', 'keys')).toBe('W/↑');
  });

  it('takaa nuolet kääntävät kameraa ja WASD liikuttaa', () => {
    setOrbitCamera(true);
    const c = orbitInput(['ArrowUp', 'ArrowLeft', 'KeyS']);
    expect(c.isDown('forward')).toBe(false);
    expect(c.isDown('left')).toBe(false);
    expect(c.isDown('back')).toBe(true);
    expect(c.cameraInput()).toEqual({ turn: 1, tilt: 1, drag: null });
    // Ohjeissa nuolet ovat vain kameran.
    expect(bindingText('forward', 'keys')).toBe('W');
    expect(bindingText('turn', 'keys')).toBe('A/D');
    expect(bindingText('camera', 'keys')).toBe('nuolinäppäimet');
  });

  it('peliohjaimella LT + oikea tatti on kamera, ja tatti ei silloin tee muuta', () => {
    setOrbitCamera(true);
    const stick = { padAim: { x: 0.5, y: -1 } };
    const free = orbitInput(['PadRsLeft', 'PadRsDown'], stick);
    expect(free.isDown('lookLeft')).toBe(true);
    expect(free.isDown('backCast')).toBe(true);
    expect(free.aimStick).toEqual({ x: 0.5, y: -1 });
    expect(free.cameraInput().turn).toBe(0);
    const held = orbitInput(['Pad6', 'PadRsLeft', 'PadRsDown'], stick);
    expect(held.isDown('lookLeft')).toBe(false);
    expect(held.isDown('backCast')).toBe(false);
    expect(held.aimStick).toEqual({ x: 0, y: 0 });
    expect(held.cameraInput()).toEqual({ turn: -0.5, tilt: 1, drag: null });
    expect(bindingText('camera', 'pad')).toBe('LT+oikea tatti');
  });

  it('nuolisarjan ajan nuolet kuuluvat sarjalle eivätkä kameralle', () => {
    setOrbitCamera(true);
    const held = new Set<string>();
    const c = new Controls({
      isDown: (k: string) => held.has(k),
      wasPressed: () => false,
      padAim: { x: 0, y: 0 },
      finger: false,
      dragDX: 0,
      dragDY: 0,
    } as unknown as Input);
    // Kameraa käännetään, kun sarja alkaa: pohjassa oleva nuoli ei ole sarjan nuoli.
    held.add('ArrowLeft');
    c.setArrowSequence(false);
    expect(c.cameraInput().turn).toBe(1);
    c.setArrowSequence(true);
    expect(c.isDown('left')).toBe(false);
    expect(c.cameraInput().turn).toBe(0);
    // Irrotuksen jälkeen nuolet ovat sarjan.
    held.clear();
    c.setArrowSequence(true);
    held.add('ArrowLeft').add('ArrowUp');
    expect(c.isDown('left')).toBe(true);
    expect(c.isDown('forward')).toBe(true);
    expect(c.cameraInput()).toEqual({ turn: 0, tilt: 0, drag: null });
    // Sarjan viimeinen nuoli ei jää kääntämään kameraa.
    c.setArrowSequence(false);
    expect(c.isDown('left')).toBe(false);
    expect(c.cameraInput()).toEqual({ turn: 0, tilt: 0, drag: null });
    held.clear();
    c.setArrowSequence(false);
    held.add('ArrowLeft');
    expect(c.cameraInput().turn).toBe(1);
    expect(c.isDown('left')).toBe(false);
  });

  it('muissa näkymissä nuolisarja ei muuta nuolia', () => {
    const c = orbitInput(['ArrowLeft']);
    c.setArrowSequence(true);
    expect(c.isDown('left')).toBe(true);
    c.setArrowSequence(false);
    expect(c.isDown('left')).toBe(true);
  });

  it('muissa näkymissä LT ei vie oikeaa tattia', () => {
    const c = orbitInput(['Pad6', 'PadRsLeft', 'PadRsDown'], { padAim: { x: -1, y: 1 } });
    expect(c.isDown('lookLeft')).toBe(true);
    expect(c.isDown('backCast')).toBe(true);
    expect(c.aimStick).toEqual({ x: -1, y: 1 });
  });

  it('sormen veto järvellä kääntää kameraa eikä kelaa tai heitä perhoa', () => {
    const touch = { finger: true, dragDX: 12, dragDY: -4 };
    expect(orbitInput(['Mouse0'], touch).isDown('pointer')).toBe(true);
    setOrbitCamera(true);
    const c = orbitInput(['Mouse0'], touch);
    expect(c.isDown('pointer')).toBe(false);
    expect(c.cameraInput().drag).toEqual({ dx: 12, dy: -4 });
    // Hiiri kelaa edelleen.
    expect(orbitInput(['Mouse0']).isDown('pointer')).toBe(true);
    expect(bindingText('pointer', 'touch')).toBeNull();
    expect(bindingText('swipe', 'touch')).toBeNull();
    expect(bindingText('camera', 'touch')).toBe('pyyhkäise järvellä');
    expect(controlText('help.shortReel', {}, { mode: 'touch' })).toBe('KELAA pohjassa = kelaa');
  });
});
