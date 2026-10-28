import { DEFAULT_TACKLE, FLY_IDS, LURE_IDS, type Tackle } from '@lunki/shared';
import { describe, expect, it } from 'vitest';
import {
  BOX_SLOTS,
  beginnerBox,
  currentSlot,
  loseFromBox,
  nextInBox,
  parseTackleBox,
  type TackleBox,
} from './tackleBox';

const spin = (t: Partial<Tackle> = {}): Tackle => ({ ...DEFAULT_TACKLE, ...t });

describe('viehepakki (#365)', () => {
  it('aloittelijan pakki kiertää vieheet samassa järjestyksessä kuin ennen pakkia', () => {
    const box = beginnerBox();
    let t = spin();
    const seen = [t.lure];
    for (let i = 1; i < LURE_IDS.length; i++) {
      t = nextInBox(t, box);
      seen.push(t.lure);
    }
    expect(seen).toEqual(LURE_IDS);
    expect(nextInBox(t, box).lure).toBe(LURE_IDS[0]);
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
