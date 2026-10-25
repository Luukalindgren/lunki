import { distance, type SpeciesId, type Vec2 } from '@lunki/shared';

/** Reitin näyteväli (s): harva näyte riittää kartalle. */
export const TRACK_INTERVAL = 1;
/** Näin pitkä hyppy näytteiden välillä (m) katkaisee reitin (trombin lento, paluu kisaan). */
const TRACK_JUMP = 40;
/** Paikallaan kelluessa uutta pistettä ei tarvita. */
const TRACK_MIN_STEP = 0.5;

/** Reittien värit liittymisjärjestyksessä: erottuvat toisistaan ja kartan pohjasta. */
export const TRACK_COLORS = [
  '#f6d04d',
  '#ff6f61',
  '#5fd3ff',
  '#b388ff',
  '#7cf29a',
  '#ff9fd6',
  '#ffa94d',
  '#eef2f3',
];

export interface RaceTrack {
  id: string;
  name: string;
  /** CSS-väri. */
  color: string;
  /** Reitin osat: osa katkeaa, kun rengas siirtyy kerralla kauas. */
  segments: Vec2[][];
}

export interface RaceCatchMark {
  /** Saajan tunniste (sama kuin reitin). */
  id: string;
  pos: Vec2;
  species: SpeciesId;
  name: string;
  weight: number;
  /** Kisa-aika (s). */
  time: number;
}

export type RaceEventKind = 'lightning' | 'capsize' | 'tangle';

export interface RaceEvent {
  kind: RaceEventKind;
  pos: Vec2;
  time: number;
}

/** Kisan kulku kartalle: reitit, saaliit ja tapahtumat. */
export interface RaceMapData {
  tracks: RaceTrack[];
  catches: RaceCatchMark[];
  events: RaceEvent[];
}

export interface RacePlayerSpot {
  id: string;
  name: string;
  pos: Vec2;
}

/**
 * Kirjaa kisan kulun tulossivun karttaa varten. Kirjaus tehdään omalla
 * koneella siitä, mitä pelaaja näkee: moninpelissä muiden renkaat tulevat
 * palvelimen tilasta, joten kesken kisan liittyneeltä puuttuu alku.
 */
export class RaceLog {
  private readonly tracks = new Map<string, RaceTrack>();
  private readonly catches: RaceCatchMark[] = [];
  private readonly events: RaceEvent[] = [];
  private nextSample = 0;
  /** Käynnissä olevat sotkut avaimella: sama sotku kirjataan kerran. */
  private activeTangles = new Set<string>();

  /** Renkaiden paikat kisa-ajassa `time` (s); kirjataan kerran sekunnissa. */
  sample(time: number, players: readonly RacePlayerSpot[]): void {
    if (time < this.nextSample) return;
    this.nextSample = Math.floor(time / TRACK_INTERVAL) * TRACK_INTERVAL + TRACK_INTERVAL;
    for (const p of players) {
      let track = this.tracks.get(p.id);
      if (!track) {
        track = {
          id: p.id,
          name: p.name,
          color: TRACK_COLORS[this.tracks.size % TRACK_COLORS.length]!,
          segments: [],
        };
        this.tracks.set(p.id, track);
      }
      track.name = p.name;
      const seg = track.segments[track.segments.length - 1];
      const last = seg?.[seg.length - 1];
      const pos = { x: p.pos.x, y: p.pos.y };
      if (!seg || !last || distance(last, pos) > TRACK_JUMP) track.segments.push([pos]);
      else if (distance(last, pos) >= TRACK_MIN_STEP) seg.push(pos);
    }
  }

  addCatch(mark: RaceCatchMark): void {
    this.catches.push({ ...mark, pos: { x: mark.pos.x, y: mark.pos.y } });
  }

  addEvent(kind: RaceEventKind, pos: Vec2, time: number): void {
    this.events.push({ kind, pos: { x: pos.x, y: pos.y }, time });
  }

  /** Nyt sotkussa olevat siimat; uusi sotku kirjataan tapahtumaksi. */
  tangles(active: readonly { key: string; pos: Vec2 }[], time: number): void {
    const now = new Set<string>();
    for (const t of active) {
      now.add(t.key);
      if (!this.activeTangles.has(t.key)) this.addEvent('tangle', t.pos, time);
    }
    this.activeTangles = now;
  }

  /** Reitin väri pelaajalle; null, jos pelaajaa ei nähty kisan aikana. */
  colorOf(id: string): string | null {
    return this.tracks.get(id)?.color ?? null;
  }

  data(): RaceMapData {
    return {
      tracks: [...this.tracks.values()],
      catches: [...this.catches],
      events: [...this.events],
    };
  }
}
