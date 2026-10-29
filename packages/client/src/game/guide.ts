import type { FishingEvents, FishingState, Vec2 } from '@lunki/shared';
import type { MsgKey } from '../i18n';

/**
 * Opastus ensimmäiseen kalaan (#370): tilanneohje vie uuden pelaajan askel
 * kerrallaan liikkeelle, heittoon, kelaukseen, tärppiin ja väsytykseen. Perholle
 * on oma lyhyt opastuksensa, kun perhovälineet otetaan käyttöön. Jokainen askel
 * näkyy, kunnes pelaaja on tehnyt sen kerran, ja edistyminen säilyy laitteella.
 * Ensimmäisen saaliin jälkeen tulee pari vinkkiä. Opastus on alimman tärkeyden
 * tilanneohje (`HudPresenter`), joten sotkut, ukkonen ja muut menevät edelle.
 */
export type GuideStep =
  'move' | 'cast' | 'reel' | 'catch' | 'flyCast' | 'flyStrip' | 'flyCatch' | 'tipLure' | 'tipSonar';

export interface GuideProgress {
  /** Pelaaja on ohittanut opastuksen (Asetukset). */
  off: boolean;
  done: GuideStep[];
}

const STEPS: readonly GuideStep[] = [
  'move',
  'cast',
  'reel',
  'catch',
  'flyCast',
  'flyStrip',
  'flyCatch',
  'tipLure',
  'tipSonar',
];

/** Uitto tehty, kun siimaa on kelattu tai vedetty näin paljon (m). */
const REEL_DONE = 3;
/** Liikkeellä, kun on päästy näin kauas lähtöpaikasta (m). */
const MOVE_DONE = 5;
/** Vinkin näkymisaika (s). */
const TIP_TIME = 8;

const KEY = 'lunki.guide';

export const freshGuide = (): GuideProgress => ({ off: false, done: [] });

export function loadGuide(): GuideProgress {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<GuideProgress> | null;
    if (!raw) return freshGuide();
    return {
      off: raw.off === true,
      done: Array.isArray(raw.done) ? raw.done.filter((s) => STEPS.includes(s)) : [],
    };
  } catch {
    return freshGuide();
  }
}

export function saveGuide(p: GuideProgress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // ei haittaa: opastus näkyy silloin seuraavallakin kerralla
  }
}

/** Kalastajan tilanne opastukselle. */
export interface GuideView {
  fishing: FishingState;
  fly: boolean;
  pos: Vec2;
  /** Kulkupeli: rengas, veneen soutaja vai kyytiläinen (ei liiku itse). */
  seat: 'tube' | 'rower' | 'passenger';
}

/** Opastuksen tila yhdessä kisassa; edistyminen tallennetaan `save`-kutsulla. */
export class Guide {
  private start: Vec2 | null = null;
  /** Pisin siima tässä heitossa: kelaus tai vedot lyhentävät sitä. */
  private longest = 0;
  private tip: { step: GuideStep; left: number } | null = null;

  constructor(
    private progress: GuideProgress,
    private readonly save: (p: GuideProgress) => void = saveGuide,
  ) {}

  get enabled(): boolean {
    return !this.progress.off;
  }

  /** Asetukset: opastus päälle (alusta) tai pois. */
  setEnabled(on: boolean): void {
    this.progress = on ? freshGuide() : { ...this.progress, off: true };
    this.tip = null;
    this.save(this.progress);
  }

  private has(step: GuideStep): boolean {
    return this.progress.done.includes(step);
  }

  private mark(...steps: GuideStep[]): void {
    const fresh = steps.filter((s) => !this.has(s));
    if (fresh.length === 0) return;
    this.progress = { ...this.progress, done: [...this.progress.done, ...fresh] };
    this.save(this.progress);
  }

  /** Kalastuksen tapahtumat askeleelta. */
  onEvents(events: FishingEvents, fly: boolean): void {
    if (events.cast !== undefined) {
      this.longest = 0;
      this.mark('move', fly ? 'flyCast' : 'cast');
    }
    if (events.caught) {
      const first = !this.has('catch') && !this.has('flyCatch');
      this.mark(
        ...(fly
          ? (['flyCast', 'flyStrip', 'flyCatch'] as const)
          : (['cast', 'reel', 'catch'] as const)),
      );
      if (first) this.tip = { step: 'tipLure', left: TIP_TIME };
    }
  }

  /** Askeleen ohje sanakirjan avaimena, tai null, kun opastettavaa ei ole. */
  update(dt: number, v: GuideView): MsgKey | null {
    if (this.progress.off) return null;
    const f = v.fishing;
    this.start ??= { ...v.pos };
    if (Math.hypot(v.pos.x - this.start.x, v.pos.y - this.start.y) >= MOVE_DONE) this.mark('move');
    const inWater = f.stage === 'water' && !f.onLand;
    if (inWater) {
      this.longest = Math.max(this.longest, f.lineLength);
      if (this.longest - f.lineLength >= REEL_DONE) this.mark(v.fly ? 'flyStrip' : 'reel');
    }
    const hooked = f.hookedId !== null;
    const struck = f.struckId !== null;
    const caught = v.fly ? this.has('flyCatch') : this.has('catch');
    if (!caught) {
      if (hooked) return v.fly && !f.onReel ? 'guide.flyFight' : 'guide.fight';
      // Iso kala tarttuu virvelissä vain nykäisyyn (#402).
      if (struck)
        return v.fly ? 'guide.flyStrike' : f.strikeBig ? 'guide.strikeBig' : 'guide.strike';
    }
    if (this.tip && !hooked && !struck) {
      this.tip.left -= dt;
      if (this.tip.left <= 0) {
        this.mark(this.tip.step);
        this.tip = this.tip.step === 'tipLure' ? { step: 'tipSonar', left: TIP_TIME } : null;
      }
      if (this.tip) return this.tip.step === 'tipLure' ? 'guide.tipLure' : 'guide.tipSonar';
    }
    if (caught) return null;
    const idle = f.stage === 'idle';
    if (!this.has('move') && idle && v.seat !== 'passenger')
      return v.seat === 'rower' ? 'guide.row' : 'guide.move';
    if (v.fly) {
      if (!this.has('flyCast')) return idle ? 'guide.flyCast' : null;
      if (inWater && !hooked && !struck)
        return this.has('flyStrip') ? 'guide.flyWait' : 'guide.flyStrip';
      return idle ? 'guide.flyAgain' : null;
    }
    if (!this.has('cast')) return idle ? 'guide.cast' : null;
    if (inWater && !hooked && !struck) return this.has('reel') ? 'guide.wait' : 'guide.reel';
    return idle ? 'guide.again' : null;
  }
}
