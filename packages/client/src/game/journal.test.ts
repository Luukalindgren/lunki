import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addJournalEntry,
  baitSummary,
  depthBand,
  JOURNAL_MAX,
  loadJournal,
  type JournalEntry,
} from './journal';

const entry = (over: Partial<JournalEntry> = {}): JournalEntry => ({
  species: 'perch',
  weight: 0.3,
  bait: { lure: 'spoon' },
  sky: 'calm',
  timeOfDay: 'day',
  season: 'summer',
  depth: 1.5,
  x: 10,
  y: 20,
  at: 1,
  ...over,
});

describe('saalispäiväkirja (#415)', () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('tyhjä päiväkirja: ei saaliita eikä vinkkiä', () => {
    expect(loadJournal()).toEqual([]);
    expect(baitSummary([], { lure: 'spoon' })).toEqual({ count: 0, species: [], best: null });
  });

  it('saaliit lasketaan vieheen säädön mukaan, perhot omanaan', () => {
    addJournalEntry(entry({ bait: { lure: 'jig', variant: 'g5' } }));
    addJournalEntry(entry({ bait: { lure: 'jig', variant: 'g20' }, species: 'pike' }));
    addJournalEntry(entry({ bait: 'nymph' }));
    const journal = loadJournal();
    expect(journal).toHaveLength(3);
    expect(baitSummary(journal, { lure: 'jig', variant: 'g5' }).count).toBe(1);
    expect(baitSummary(journal, { lure: 'jig', variant: 'g20' }).species).toEqual([['pike', 1]]);
    expect(baitSummary(journal, 'nymph').count).toBe(1);
    expect(baitSummary(journal, { lure: 'spoon' }).count).toBe(0);
  });

  it('parhaat olot ovat yleisimmät, tasapelissä tuoreimmat, ja vasta kolmesta saaliista', () => {
    const two = [
      entry({ sky: 'windy', timeOfDay: 'evening', depth: 0.5 }),
      entry({ sky: 'windy', timeOfDay: 'evening', depth: 0.5 }),
    ];
    expect(baitSummary(two, { lure: 'spoon' }).best).toBeNull();
    const journal = [
      ...two,
      entry({ species: 'pike', sky: 'rain', timeOfDay: 'morning', season: 'autumn', depth: 2.4 }),
      entry({ species: 'pike', sky: 'rain', timeOfDay: 'morning', season: 'autumn', depth: 2.6 }),
      entry({ species: 'pike', sky: 'calm', timeOfDay: 'day', depth: 6 }),
    ];
    expect(baitSummary(journal, { lure: 'spoon' })).toEqual({
      count: 5,
      species: [
        ['pike', 3],
        ['perch', 2],
      ],
      best: { season: 'summer', sky: 'rain', timeOfDay: 'morning', depth: depthBand(2.5) },
    });
    expect([0.2, 1, 1.9, 2, 4.9, 5, 12].map(depthBand)).toEqual([0, 1, 1, 2, 3, 4, 4]);
  });

  it('rikkinäinen tai vieras tallenne ei kaada peliä', () => {
    store.set('lunki.journal', '{"rikki"');
    expect(loadJournal()).toEqual([]);
    store.set(
      'lunki.journal',
      JSON.stringify([
        entry(),
        { ...entry(), species: 'valas' },
        { ...entry(), bait: { lure: 'pommi' } },
        { ...entry(), weight: -1 },
        { ...entry(), sky: 'tulva', depth: 'syvä' },
      ]),
    );
    const journal = loadJournal();
    expect(journal).toHaveLength(2);
    expect(journal[1]).toMatchObject({ sky: 'calm', depth: 0 });
  });

  it('vanhimmat putoavat, kun rivejä on yli enimmäismäärän', () => {
    store.set(
      'lunki.journal',
      JSON.stringify(Array.from({ length: JOURNAL_MAX }, (_, i) => entry({ at: i }))),
    );
    addJournalEntry(entry({ at: 999 }));
    const journal = loadJournal();
    expect(journal).toHaveLength(JOURNAL_MAX);
    expect(journal[0]!.at).toBe(1);
    expect(journal.at(-1)!.at).toBe(999);
  });
});
