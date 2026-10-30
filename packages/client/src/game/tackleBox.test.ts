import { DEFAULT_TACKLE, FLY_IDS, LURE_IDS, type Tackle } from '@lunki/shared';
import { describe, expect, it } from 'vitest';
import {
  BOX_SLOTS,
  beginnerBox,
  currentSlot,
  loseFromBox,
  nextInBox,
  parseTackleBox,
  slotOf,
  type TackleBox,
} from './tackleBox';

const spin = (t: Partial<Tackle> = {}): Tackle => ({ ...DEFAULT_TACKLE, ...t });

describe('viehepakki (#365)', () => {
  it('aloittelijan pakki on täynnä: viehe kutakin, vaappu kaikilla syvyyksillä ja jigi myös 5 g', () => {
    const box = beginnerBox();
    expect(box.lures).toEqual([
      { lure: 'spoon' },
      { lure: 'wobbler', variant: 'shallow' },
      { lure: 'wobbler', variant: 'mid' },
      { lure: 'wobbler', variant: 'deep' },
      { lure: 'jig', variant: 'g5' },
      { lure: 'jig', variant: 'g10' },
      { lure: 'spinner' },
      { lure: 'weedless' },
    ]);
    expect(box.lures).toHaveLength(BOX_SLOTS);
    expect(new Set(box.lures.map((s) => s.lure))).toEqual(new Set(LURE_IDS));
    // Pakki tallentuu ja latautuu sellaisenaan.
    expect(parseTackleBox(JSON.parse(JSON.stringify(box)))).toEqual(box);
    // R kiertää lokerot järjestyksessä ja palaa alkuun.
    let t = spin();
    for (let i = 1; i < BOX_SLOTS; i++) t = nextInBox(t, box);
    expect(slotOf(t)).toEqual(box.lures[BOX_SLOTS - 1]);
    expect(nextInBox(t, box).lure).toBe('spoon');
    // Perhovälineillä kiertävät perhot.
    expect(nextInBox(spin({ method: 'fly', fly: FLY_IDS[0]! }), box).fly).toBe(FLY_IDS[1]);
  });

  it('pakissa voi olla saman vieheen eri säätöjä, ja R kiertää ne järjestyksessä', () => {
    const box: TackleBox = {
      lures: [
        { lure: 'jig', variant: 'g5' },
        { lure: 'jig', variant: 'g20' },
        { lure: 'wobbler', variant: 'deep' },
      ],
      flies: ['popper'],
    };
    const a = nextInBox(spin(), box);
    expect([a.lure, a.jigWeight]).toEqual(['jig', 'g5']);
    const b = nextInBox(a, box);
    expect([b.lure, b.jigWeight]).toEqual(['jig', 'g20']);
    const c = nextInBox(b, box);
    expect([c.lure, c.crankDepth]).toEqual(['wobbler', 'deep']);
    expect(nextInBox(c, box).jigWeight).toBe('g5');
    expect(currentSlot(b, box)).toBe(1);
  });

  it('rikki tai vanha tallennus antaa aloittelijan pakin, kelvottomat lokerot pudotetaan', () => {
    expect(parseTackleBox(null)).toEqual(beginnerBox());
    expect(parseTackleBox({ lures: 'x' })).toEqual(beginnerBox());
    const box = parseTackleBox({
      lures: [
        { lure: 'jig', variant: 'g99' },
        { lure: 'nuke' },
        { lure: 'spoon', variant: 'g5' },
        ...Array.from({ length: 10 }, () => ({ lure: 'spinner' })),
      ],
      flies: ['nymph', 'fake'],
    });
    expect(box.lures[0]).toEqual({ lure: 'jig', variant: 'g10' });
    expect(box.lures[1]).toEqual({ lure: 'spoon' });
    expect(box.lures).toHaveLength(BOX_SLOTS);
    expect(box.flies).toEqual(['nymph']);
  });

  it('menetetty viehe poistuu pakista, viimeinen jää varavieheeksi', () => {
    const box: TackleBox = {
      lures: [{ lure: 'spoon' }, { lure: 'jig', variant: 'g20' }],
      flies: ['popper'],
    };
    const lost = loseFromBox(spin({ lure: 'jig', jigWeight: 'g20' }), box);
    expect(lost.box.lures).toEqual([{ lure: 'spoon' }]);
    expect(lost.next?.lure).toBe('spoon');
    expect(lost.left).toBe(1);
    const last = loseFromBox(spin(), lost.box);
    expect(last.next).toBeNull();
    expect(last.box.lures).toHaveLength(1);
    // Pakin ulkopuolinen viehe ei poista mitään.
    expect(loseFromBox(spin({ lure: 'wobbler' }), box).box).toBe(box);
  });
});
