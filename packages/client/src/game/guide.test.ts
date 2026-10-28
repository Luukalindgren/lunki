import { describe, expect, it } from 'vitest';
import { createFishing, type FishingState } from '@lunki/shared';
import { Guide, freshGuide, type GuideProgress, type GuideView } from './guide';

const view = (fishing: FishingState, over: Partial<GuideView> = {}): GuideView => ({
  fishing,
  fly: false,
  pos: { x: 0, y: 0 },
  seat: 'tube',
  ...over,
});

describe('opastus ensimmäiseen kalaan (#370)', () => {
  it('vie liikkeelle, heittoon, kelaukseen, tärppiin ja väsytykseen', () => {
    const saved: GuideProgress[] = [];
    const g = new Guide(freshGuide(), (p) => saved.push(p));
    const f = createFishing();
    expect(g.update(0.1, view(f))).toBe('guide.move');
    expect(g.update(0.1, view(f, { pos: { x: 6, y: 0 } }))).toBe('guide.cast');
    g.onEvents({ cast: 1 }, false);
    f.stage = 'water';
    f.lineLength = 20;
    expect(g.update(0.1, view(f))).toBe('guide.reel');
    f.lineLength = 16;
    expect(g.update(0.1, view(f))).toBe('guide.wait');
    f.struckId = 3;
    expect(g.update(0.1, view(f))).toBe('guide.strike');
    f.struckId = null;
    f.hookedId = 3;
    expect(g.update(0.1, view(f))).toBe('guide.fight');
    f.hookedId = null;
    f.stage = 'idle';
    g.onEvents({ caught: { species: 'perch', name: 'Ahven', weight: 0.2 } }, false);
    expect(g.update(0.1, view(f))).toBe('guide.tipLure');
    expect(g.update(8, view(f))).toBe('guide.tipSonar');
    g.update(8, view(f));
    expect(g.update(0.1, view(f))).toBeNull();
    expect(saved.at(-1)!.done).toEqual(
      expect.arrayContaining(['move', 'cast', 'reel', 'catch', 'tipLure', 'tipSonar']),
    );
  });

  it('tehty askel ei näy uudelleen seuraavassa kisassa', () => {
    const g = new Guide({ off: false, done: ['move', 'cast'] }, () => {});
    expect(g.update(0.1, view(createFishing()))).toBe('guide.again');
  });

  it('heitto ennen liikkumista ohittaa liikkumisen', () => {
    const g = new Guide(freshGuide(), () => {});
    g.onEvents({ cast: 1 }, false);
    expect(g.update(0.1, view(createFishing()))).toBe('guide.again');
  });

  it('kyytiläiselle ei neuvota liikkumista, soutajalle soutu', () => {
    const f = createFishing();
    expect(new Guide(freshGuide(), () => {}).update(0.1, view(f, { seat: 'passenger' }))).toBe(
      'guide.cast',
    );
    expect(new Guide(freshGuide(), () => {}).update(0.1, view(f, { seat: 'rower' }))).toBe(
      'guide.row',
    );
  });

  it('perholla oma opastus, vaikka heittokalastus on jo opittu', () => {
    const done: GuideProgress['done'] = ['move', 'cast', 'reel', 'catch', 'tipLure', 'tipSonar'];
    const g = new Guide({ off: false, done }, () => {});
    const f = createFishing();
    expect(g.update(0.1, view(f))).toBeNull();
    expect(g.update(0.1, view(f, { fly: true }))).toBe('guide.flyCast');
    g.onEvents({ cast: 1 }, true);
    f.stage = 'water';
    f.lineLength = 12;
    expect(g.update(0.1, view(f, { fly: true }))).toBe('guide.flyStrip');
    f.lineLength = 9;
    expect(g.update(0.1, view(f, { fly: true }))).toBe('guide.flyWait');
    f.struckId = 1;
    expect(g.update(0.1, view(f, { fly: true }))).toBe('guide.flyStrike');
    f.struckId = null;
    f.hookedId = 1;
    expect(g.update(0.1, view(f, { fly: true }))).toBe('guide.flyFight');
    f.onReel = true;
    expect(g.update(0.1, view(f, { fly: true }))).toBe('guide.fight');
    f.hookedId = null;
    f.stage = 'idle';
    g.onEvents({ caught: { species: 'trout', name: 'Taimen', weight: 1 } }, true);
    expect(g.update(0.1, view(f, { fly: true }))).toBeNull();
  });

  it('pois päältä ei näytä mitään; päälle alusta', () => {
    const saved: GuideProgress[] = [];
    const g = new Guide({ off: false, done: ['move'] }, (p) => saved.push(p));
    g.setEnabled(false);
    expect(g.enabled).toBe(false);
    expect(g.update(0.1, view(createFishing()))).toBeNull();
    g.setEnabled(true);
    expect(saved.at(-1)).toEqual(freshGuide());
    expect(g.update(0.1, view(createFishing()))).toBe('guide.move');
  });
});
