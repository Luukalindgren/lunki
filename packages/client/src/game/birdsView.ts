import * as THREE from 'three';
import type { Difficulty, FishConditions, FishPopulation, Season, Vec2 } from '@lunki/shared';
import type { SoundEvent } from '../audio/sounds';
import { toWorld } from '../world/lakeMesh';
import { BIRD_ART, BIRD_PX, CARRY_SIDE, CARRY_TOP, birdPixels } from './birdArt';
import type { BirdEvent, BirdPose } from './birdPose';
import { FishBirds } from './fishBirds';
import { pixelTexture } from './pixelSprite';
import { SplashRings } from './splashRings';
import { Waterfowl, type BirdLake } from './waterfowl';

/** Lintujen tapahtumien äänet äänikartasta ja renkaat veteen (koko, kesto s). */
const EVENT_LOOK: Record<
  BirdEvent['kind'],
  { sound: (b: BirdEvent['bird']) => SoundEvent | null; ring: number; time: number }
> = {
  flush: { sound: (b) => (b === 'mallard' ? 'duckFlush' : 'swanFlush'), ring: 0.9, time: 0.7 },
  land: { sound: () => 'birdLand', ring: 0.7, time: 0.7 },
  dive: { sound: () => 'birdDive', ring: 0.4, time: 0.6 },
  surface: { sound: () => null, ring: 0.4, time: 0.6 },
  cry: { sound: () => 'gullCry', ring: 0, time: 0 },
  catch: { sound: () => 'ospreyDive', ring: 1.4, time: 0.9 },
};

/** Ylhäältä kuva kääntyy kulkusuuntaan 16 askeleessa, ettei se väreile. */
const TURN_STEP = Math.PI / 8;
/** Kuvapiste vähintään näin monta näytön kuvapistettä: kaukainen lintu ei häviä. */
const MIN_PIXEL = 0.8;
/**
 * Linnut piirretään puolitoistakertaisina: pieni sisäinen resoluutio
 * hukkaisi oikean kokoisen sorsan tai kaukaisen lokin parin kuvapisteen
 * täpläksi.
 */
const SCALE = 1.5;
/** Loitonnettaessa lintu kasvaa enintään näin moninkertaiseksi. */
const MAX_GROW = 4;

export interface BirdsInput {
  fish: FishPopulation;
  conditions: FishConditions;
  /** Kalastajan (tai seurattavan) paikka. */
  near: Vec2;
  /** Kulkupelit, joita linnut väistävät. */
  crafts: readonly Vec2[];
  /** Oma viehe vedessä; null muuten. */
  lure: Vec2 | null;
  difficulty: Difficulty;
}

/**
 * Järven linnut (#571, #572): vesilinnut tunnelmaksi ja kalaa pyytävät
 * linnut syönnin merkkinä. Pikselikuvat (`alphaTest`) ylhäältä ja
 * kalastajan silmin; äänet äänikartasta paikan mukaan (`play`). Jokainen
 * kuva kertoo lintunsa (`userData.bird`), josta Moderni ilme tekee mallin.
 */
export class BirdsView {
  readonly group = new THREE.Group();
  private readonly waterfowl: Waterfowl;
  private readonly fishBirds: FishBirds;
  private readonly rings = new SplashRings(8);
  private readonly sprites: THREE.Sprite[] = [];
  private readonly textures = new Map<string, { tex: THREE.Texture; w: number; h: number }>();
  private readonly poses: BirdPose[] = [];
  private lureWasOut = false;

  constructor(
    seed: number,
    season: Season,
    lake: BirdLake,
    private readonly play: (event: SoundEvent, at: Vec2) => void,
  ) {
    this.waterfowl = new Waterfowl(seed, season, lake);
    this.fishBirds = new FishBirds(seed);
    this.group.name = 'birds';
    this.group.add(this.rings.group);
  }

  update(dt: number, input: BirdsInput): void {
    const events: BirdEvent[] = [];
    // Vieheen molskahdus: viehe tuli juuri veteen.
    const splash = input.lure && !this.lureWasOut ? input.lure : null;
    this.lureWasOut = input.lure !== null;
    this.waterfowl.update(dt, { crafts: input.crafts, splash }, events);
    this.fishBirds.update(
      dt,
      {
        pop: input.fish,
        cond: input.conditions,
        near: input.near,
        crafts: input.crafts,
        difficulty: input.difficulty,
      },
      events,
    );
    for (const e of events) {
      const look = EVENT_LOOK[e.kind];
      if (look.ring > 0) {
        this.rings.start(e.pos, look.ring, look.time);
        if (e.kind === 'catch') this.rings.start(e.pos, look.ring * 0.55, look.time);
      }
      const sound = look.sound(e.bird);
      if (sound) this.play(sound, e.pos);
    }
    this.rings.update(dt);
  }

  /** Lähimmän pinnalla olevan kuikan paikka: kuikan huuto kuuluu sieltä. */
  nearestLoon(from: Vec2): Vec2 | null {
    return this.waterfowl.nearestLoon(from);
  }

  /**
   * Piirtää linnut. `pixel` on ylhäältä metrejä kuvapisteelle, silmin
   * kuvapisteen koko metreinä metrin päässä kamerasta (`PovCamera.pixelSize`).
   */
  render(camera: THREE.Camera, pov: boolean, pixel: number): void {
    const poses = this.poses;
    poses.length = 0;
    this.waterfowl.poses(poses);
    this.fishBirds.poses(poses);
    const e = camera.matrixWorld.elements;
    // Kameran oikea suunta järvellä: silmin lintu katsoo oikealle tai vasemmalle.
    const right = { x: e[0]!, y: -e[2]! };
    const cam = camera.position;
    for (let i = 0; i < poses.length; i++) {
      const p = poses[i]!;
      const s = (this.sprites[i] ??= this.newSprite());
      s.visible = true;
      const look = this.texture(
        p,
        pov,
        pov && Math.cos(p.heading) * right.x + Math.sin(p.heading) * right.y < 0,
      );
      if (s.material.map !== look.tex) {
        s.material.map = look.tex;
        s.material.needsUpdate = true;
      }
      let grow: number;
      if (pov) {
        s.position.copy(toWorld(p.pos, p.height));
        const d = s.position.distanceTo(cam);
        grow = Math.min(MAX_GROW, Math.max(SCALE, (MIN_PIXEL * pixel * d) / BIRD_PX));
        s.material.rotation = 0;
        // Uiva lintu istuu vedessä, lentävä on keskeltä.
        s.center.set(0.5, p.flying ? 0.5 : 0.25);
      } else {
        // Ylhäältä korkeus näkyy siirtymänä pohjoiseen kuten vieheen merkissä.
        s.position.copy(toWorld({ x: p.pos.x, y: p.pos.y + p.height * 0.35 }, 0.4 + p.height));
        grow =
          Math.min(MAX_GROW, Math.max(SCALE, (MIN_PIXEL * pixel) / BIRD_PX)) * (1 + p.height / 40);
        s.material.rotation = Math.round((p.heading - Math.PI / 2) / TURN_STEP) * TURN_STEP;
        s.center.set(0.5, 0.5);
      }
      s.scale.set(look.w * BIRD_PX * grow, look.h * BIRD_PX * grow, 1);
      // Moderni ilme piirtää linnun mallina samaan paikkaan ja kokoon (`modern/birds.ts`).
      s.userData.bird = p;
      s.userData.grow = grow;
    }
    for (let i = poses.length; i < this.sprites.length; i++) {
      const s = this.sprites[i]!;
      s.visible = false;
      s.userData.bird = null;
    }
  }

  private newSprite(): THREE.Sprite {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ alphaTest: 0.5 }));
    this.group.add(s);
    return s;
  }

  /** Kuva lajin, näkymän, lennon vaiheen ja suunnan mukaan; tehdään kerran. */
  private texture(p: BirdPose, side: boolean, flip: boolean) {
    const art = BIRD_ART[p.kind];
    const frames = (p.flying ? art.fly : art.swim) ?? art.swim ?? art.fly!;
    const set = side ? frames.side : frames.top;
    const frame = set.length > 1 && p.flap >= 0.5 ? 1 : 0;
    const carry = p.carrying === true;
    const key = `${p.kind}:${p.flying}:${side}:${frame}:${flip}:${carry}`;
    let t = this.textures.get(key);
    if (!t) {
      let rows = [...set[frame]!];
      if (carry) rows.push(...(side ? CARRY_SIDE : CARRY_TOP));
      const width = Math.max(...rows.map((r) => r.length));
      rows = rows.map((r) => r.padEnd(width, '.'));
      if (flip) rows = rows.map((r) => [...r].reverse().join(''));
      const px = birdPixels(rows);
      t = { tex: pixelTexture(px), w: px.width, h: px.height };
      this.textures.set(key, t);
    }
    return t;
  }
}
