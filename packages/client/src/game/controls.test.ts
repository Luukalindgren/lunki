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
      'Hiiri tai välilyönti pohjassa = kelaa · hiiren oikea/J = nykäisy, ison kalan vastaisku',
    );
    expect(controlText('help.reel', {}, { mode: 'touch' })).toBe(
      'Sormi järvellä tai KELAA pohjassa = kelaa · NYKÄISE = nykäisy, ison kalan vastaisku',
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
      'A/RT pohjassa = kelaa · X = nykäisy, ison kalan vastaisku',
    );
    expect(controlText('help.cast', {}, { mode: 'pad' })).toBe('Oikea tatti = heiton suunta');
    expect(controlText('help.cast', {}, { mode: 'keys' })).toBe(
      'Hiiri: tähtää, pidä ja päästä = heitto',
    );
    expect(controlText('help.move', {}, { mode: 'pad' })).toBe(
      'Vasen tatti ↑ = kohti räpylöitä · vasen tatti ↓ = selkä edellä (nopein)',
    );
    setControlMode('pad', 'playstation');
    expect(controlText('help.gear')).toBe('✚→ = kelausnopeus · ✚↓/✚↑ = jarru');
    expect(withKey('tackle.lure', 'lure')).toBe('Viehe (L1)');
    expect(controlText('help.reel')).toMatch(/^✕\/R2 pohjassa = kelaa · □ = nykäisy/);
    setControlMode('keys', 'xbox');
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
