import type { Difficulty, FishConditions, FishPopulation, Vec2 } from '@lunki/shared';
import type { SoundEvent } from '../audio/sounds';
import { FishSigns, type FishSignKind } from './fishSigns';
import { SplashRings } from './splashRings';

/** Merkin renkaan kesto (s): pintaan noussut kala jättää hitaan renkaan. */
const RING_TIME: Record<FishSignKind, number> = {
  rise: 1.6,
  flee: 0.5,
  feed: 0.7,
  pikeStrike: 0.9,
};

const SOUND: Record<FishSignKind, SoundEvent> = {
  rise: 'fishRise',
  flee: 'fishFlee',
  feed: 'fishRise',
  pikeStrike: 'pikeStrike',
};

/**
 * Kalojen merkit pinnalla (#369) renkaina samalla roiskeen tyylillä kuin
 * vieheen molskahdus. Renkaat ovat järvellä, joten ne näkyvät ylhäältä ja
 * kalastajan silmin samoin ja tummuvat yöllä yhteisen sävytyksen mukana.
 */
export class FishSignsView {
  private readonly rings = new SplashRings(10);
  private readonly signs = new FishSigns();
  readonly group = this.rings.group;

  /** `play`: ääni kohdassa `at` (kuultuna omalta paikalta). */
  constructor(private readonly play: (event: SoundEvent, at: Vec2) => void) {}

  update(
    pop: FishPopulation,
    cond: FishConditions,
    near: Vec2,
    difficulty: Difficulty,
    dt: number,
  ): void {
    for (const s of this.signs.update(pop, cond, near, difficulty, dt)) {
      this.rings.start(s.pos, s.size, RING_TIME[s.kind]);
      // Hauen isku on iso molskahdus: kaksi rengasta sisäkkäin.
      if (s.kind === 'pikeStrike') this.rings.start(s.pos, s.size * 0.55, RING_TIME.pikeStrike);
      this.play(SOUND[s.kind], s.pos);
    }
    this.rings.update(dt);
  }
}
