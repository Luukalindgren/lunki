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
    for (const [a, b] of Object.entries(CONTROLS) as [Action, (typeof CONTROLS)[Action]][]) {
      const keys = [
        'label' in b ? b.label : undefined,
        'title' in b ? b.title : undefined,
        'touch' in b && /^[a-z]/.test(b.touch) ? b.touch : undefined,
      ].filter((k): k is MsgKey => k !== undefined);
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
    expect(bindingText('forward', false)).toBe('W/↑');
    expect(bindingText('sprint', false)).toBe('Shift');
    expect(bindingText('forward', true)).toBe('tatti ylös');
    expect(bindingText('reelSlack', true)).toBe('KELALLE');
    // NOP-napin vaihteen kierrolla ei ole näppäintä.
    expect(bindingText('gearNext', false)).toBeNull();
  });

  it('sama ohjeteksti näppäimistölle ja kosketukselle', () => {
    expect(controlText('help.reel', {}, { touch: false })).toBe(
      'Hiiri tai välilyönti pohjassa = kelaa',
    );
    expect(controlText('help.reel', {}, { touch: true })).toBe(
      'Sormi järvellä tai KELAA pohjassa = kelaa',
    );
    expect(controlText('game.viewTop', {}, { touch: true })).toBe('Ylhäältä (KAM)');
    expect(controlText('game.viewTop', {}, { touch: false })).toBe('Ylhäältä (V)');
    setLangForTest('en');
    expect(controlText('game.viewTop', {}, { touch: true })).toBe('From above (CAM)');
  });

  it('osa jätetään pois, jos toimintoa ei ole', () => {
    expect(controlText('help.bar', {}, { touch: false })).toBe(
      'V = näkymä · G = käsimerkit · rulla = zoom · H = ohje · Esc = tauko',
    );
    expect(controlText('help.bar', {}, { touch: false, skip: ['zoom'] })).toBe(
      'V = näkymä · G = käsimerkit · H = ohje · Esc = tauko',
    );
    expect(controlText('help.gear', {}, { touch: true })).toBe(
      'NOP = kelausnopeus · PIKA = pikakelaus · JAR−/JAR+ = jarru',
    );
  });

  it('kaikki ohjetekstien {toiminnot} ovat kartassa', () => {
    const vars = /\{(\w+)\}/g;
    for (const [k, text] of Object.entries(fi)) {
      if (!/^(help|ctl|menu\.controls|tackle\.(lure|fly|flyHint|lureInRace)$)/.test(k)) continue;
      for (const m of text.matchAll(vars)) expect(CONTROLS, `${k}: ${m[1]}`).toHaveProperty(m[1]!);
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
    expect(contextActions(spin({ stage: 'water' }), false)).toEqual({
      main: 'reel',
      line: 'lift',
      tool: 'cut',
    });
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
    // Kelalla kalaa väsytetään kelaamalla.
    expect(contextActions({ ...water, hookedId: 3, onReel: true }, false).main).toBe('reel');
  });
});
