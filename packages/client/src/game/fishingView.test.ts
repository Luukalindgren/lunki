import { describe, expect, it } from 'vitest';
import { FishingView } from './fishingView';

describe('siiman väri', () => {
  it('valittu väri näkyy jo ennen ensimmäistä heittoa', () => {
    const view = new FishingView();
    view.lineColor = 0xd23a2a;
    expect(view.shownLineColor).toBe(0xd23a2a);
  });
});
