import { afterEach, describe, expect, it, vi } from 'vitest';
import { MUSIC_TRACK_IDS, MUSIC_TRACKS, nextTrack, type MusicTrackId } from './music';
import { DEFAULT_AUDIO, loadAudioSettings } from './settings';

describe('musiikkiraidat', () => {
  it('jokainen raita soi koko kierron järkevillä sävelillä', () => {
    for (const id of MUSIC_TRACK_IDS) {
      const track = MUSIC_TRACKS[id];
      const loop = track.stepsPerBar * track.bars;
      const notes = Array.from({ length: loop }, (_, s) => track.notes(s)).flat();
      expect(notes.length, id).toBeGreaterThan(loop / 2);
      // Kuuluvalla alueella (n. 55 Hz – 1,4 kHz) eikä yksikään sävel säröydy.
      for (const n of notes) {
        expect(n.semis, id).toBeGreaterThanOrEqual(-36);
        expect(n.semis, id).toBeLessThanOrEqual(20);
        expect(n.beats, id).toBeGreaterThan(0);
        expect(n.volume, id).toBeGreaterThan(0);
        expect(n.volume, id).toBeLessThanOrEqual(0.25);
      }
      // Kierto kestää vähintään kymmenen sekuntia.
      expect((loop / 2) * (60 / track.bpm), id).toBeGreaterThan(10);
    }
  });

  it('raidat eroavat toisistaan', () => {
    const firstBar = (id: MusicTrackId) =>
      JSON.stringify(Array.from({ length: 8 }, (_, s) => MUSIC_TRACKS[id].notes(s)));
    expect(new Set(MUSIC_TRACK_IDS.map(firstBar)).size).toBe(MUSIC_TRACK_IDS.length);
  });

  it('vaihtuva käy kaikki raidat läpi ja palaa alkuun', () => {
    let id: MusicTrackId = MUSIC_TRACK_IDS[0];
    const seen = new Set<MusicTrackId>([id]);
    for (let i = 1; i < MUSIC_TRACK_IDS.length; i++) seen.add((id = nextTrack(id)));
    expect(seen.size).toBe(MUSIC_TRACK_IDS.length);
    expect(nextTrack(id)).toBe(MUSIC_TRACK_IDS[0]);
  });
});

describe('ääniasetukset', () => {
  afterEach(() => vi.unstubAllGlobals());
  const stored = (v: unknown) =>
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify(v) });

  it('oletuksena musiikki soi normaalisti ja kalastaja kiroilee tapahtumissa', () => {
    stored(null);
    expect(loadAudioSettings()).toMatchObject({ music: 2, eventVoices: true });
  });

  it('vanha tallennus ilman raitaa saa vaihtuvan', () => {
    stored({ effects: 1, ambience: 3, music: 2 });
    expect(loadAudioSettings()).toEqual({
      effects: 1,
      ambience: 3,
      music: 2,
      musicTrack: 'vaihtuva',
      voice: 2,
      eventVoices: true,
    });
  });

  it('puheäänten taso ja tapahtumien kiroilu tallentuvat (#229)', () => {
    stored({ voice: 0, eventVoices: false });
    expect(loadAudioSettings()).toEqual({ ...DEFAULT_AUDIO, voice: 0, eventVoices: false });
    stored({ voice: 7, eventVoices: 'joo' });
    expect(loadAudioSettings()).toEqual(DEFAULT_AUDIO);
  });

  it('tallennettu raita säilyy, tuntematon hylätään', () => {
    stored({ music: 2, musicTrack: 'valssi' });
    expect(loadAudioSettings().musicTrack).toBe('valssi');
    stored({ music: 2, musicTrack: 'humppa' });
    expect(loadAudioSettings()).toEqual({ ...DEFAULT_AUDIO, music: 2 });
  });
});
