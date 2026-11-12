import {
  DIFFICULTIES,
  Rng,
  type Difficulty,
  type Fish,
  type FishConditions,
  type FishPopulation,
  type School,
  type SpeciesId,
  type Vec2,
} from '@lunki/shared';
import type { BirdEvent, BirdPose } from './birdPose';

/**
 * Linnut näyttävät, missä kala syö (#571), kuten oikealla järvellä:
 *
 * - Lokit (kalalokki) ja kalatiirat kaartelevat ja syöksähtelevät pintaan
 *   syövän ahvenparven päällä: ahvenet ajavat pikkukalaa pintaan, ja linnut
 *   poimivat ne. Lokin kirkuna kuuluu kauas.
 * - Kalasääski kaartelee korkealla, lekuttelee paikallaan ja syöksyy
 *   jalat edellä pintaveteen (0,5–1 m) noin 300 gramman särkikalan perään,
 *   ja nousee usein kala kynsissä (Sääksisäätiö, Yle). Eteläsuomalaiset
 *   sääkset muuttavat jo elokuussa, joten syksyn kisassa niitä ei näy.
 *   Kalatiirat ovat lähteneet syksyyn mennessä, lokit ovat vielä.
 *
 * Linnut ovat näkymää: ne lukevat paikat samasta kalakannasta ja
 * syöntijaksosta (#510) kuin kalojen merkit (`FISH_SIGNS`), eivätkä arvo
 * mitään kalakantaan. Oikeakin kalastaja näkee ne, joten ne näkyvät
 * kaikilla vaikeustasoilla; helpolla lintuja on enemmän ja ne syöksyvät
 * useammin.
 */
export const FISH_BIRDS = {
  /** Parvet ahvenparvien päällä tätä lähempänä kalastajaa (m). */
  range: 350,
  /** Parvien enimmäismäärä ja koko vaikeustasoittain. */
  flocks: { easy: 3, normal: 2, realistic: 2 } satisfies Record<Difficulty, number>,
  size: {
    easy: [5, 7],
    normal: [3, 5],
    realistic: [2, 4],
  } satisfies Record<Difficulty, readonly [number, number]>,
  /**
   * Kaikki syövät parvet eivät aja pikkukalaa pintaan: syöntijakson alussa
   * arvotaan, käykö parvi pinnassa (vaikeustasoittain). Helpolla kalat
   * syövät koko ajan, joten arvonta uusitaan `easyBout` sekunnin välein.
   */
  surface: { easy: 0.6, normal: 0.35, realistic: 0.35 } satisfies Record<Difficulty, number>,
  easyBout: 150,
  /** Parven kalat uivat keskimäärin tätä matalammalla (m): pintaan ajo näkyy. */
  depth: 2.5,
  /** Yhden linnun syöksyjen väli keskimäärin (s). */
  diveEvery: { easy: 4, normal: 6, realistic: 8 } satisfies Record<Difficulty, number>,
  /** Lokin kirkuna parvesta keskimäärin näin usein (s). */
  cryEvery: 5,
  /** Lintuja ei näy hämärämmässä (valo 0–1) eikä kovemmassa tuulessa (m/s). */
  minLight: 0.35,
  maxWind: 9,
  /** Parven kaartelu: säde (m), korkeus (m) ja tulomatka (m). */
  orbit: [6, 14] as const,
  height: [5, 11] as const,
  arrive: 120,
  /** Kalatiirojen määrä parvessa kausittain (syksyllä ne ovat jo lähteneet). */
  terns: { spring: 2, summer: 2, autumn: 0, winter: 0 },
  osprey: {
    /** Sääksi käy keskimäärin näin usein (s) keväällä ja kesällä. */
    every: { easy: 120, normal: 200, realistic: 300 } satisfies Record<Difficulty, number>,
    minLight: 0.45,
    maxWind: 8,
    /** Saalis: pintavedessä (m) uiva sopivan kokoinen kala tällä etäisyydellä kalastajasta. */
    depth: 1,
    weight: [0.15, 1.5] as const,
    near: 50,
    far: 300,
    prey: ['roach', 'bream', 'ide', 'perch', 'whitefish', 'pike', 'trout', 'rainbow'] as const,
    /** Kaartelu (s), säde (m) ja korkeus (m); lekuttelu ja syöksy (s). */
    circle: 25,
    radius: 22,
    height: 28,
    hover: 3,
    hoverHeight: 16,
    dive: 1.1,
    /** Sääksi nousee kala kynsissä useimmiten. */
    success: 0.65,
    speed: 13,
  },
};

interface Seabird {
  kind: 'gull' | 'tern';
  angle: number;
  radius: number;
  height: number;
  /** Kaartelun kulmanopeus (rad/s), etumerkki = suunta. */
  speed: number;
  /** Syöksy: kesto kulunut (s) ja kohta pinnalla; null = kaartelee. */
  dive: { t: number; at: Vec2 } | null;
  /** Saapuminen 1 → 0, lähtö 0 → 1. */
  away: number;
  awayDir: number;
}

interface Flock {
  school: School;
  center: Vec2;
  birds: Seabird[];
  leaving: boolean;
}

type OspreyStage = 'arrive' | 'circle' | 'hover' | 'dive' | 'water' | 'leave';

interface Osprey {
  stage: OspreyStage;
  fish: Fish;
  pos: Vec2;
  height: number;
  heading: number;
  t: number;
  angle: number;
  carrying: boolean;
  leaveDir: number;
}

/** Linnuille riittävä sää: valoisaa ja tuuli kohtuullinen. */
const fair = (cond: FishConditions, minLight: number, maxWind: number) =>
  !cond.storm && cond.light >= minLight && Math.hypot(cond.wind.x, cond.wind.y) <= maxWind;

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

export interface FishBirdsInput {
  pop: FishPopulation;
  cond: FishConditions;
  /** Kalastajan paikka: linnut näkyvät sen ympärillä. */
  near: Vec2;
  /** Kulkupelit: sääksi ei saalista aivan ihmisen vieressä. */
  crafts: readonly Vec2[];
  difficulty: Difficulty;
}

export class FishBirds {
  private flocks: Flock[] = [];
  private osprey: Osprey | null = null;
  private ospreyIn: number;
  private pickIn = 0;
  private time = 0;
  /** Parven syöntijakson pintakäynti: jakson tunniste ja arvonnan tulos. */
  private readonly surfacing = new WeakMap<School, { mark: number; on: boolean }>();
  private readonly rng: Rng;

  constructor(seed: number) {
    this.rng = new Rng((seed ^ 0x5eed_b1d5) >>> 0);
    this.ospreyIn = this.rng.range(30, 90);
  }

  /** Parvien ja sääksen tila (testejä varten). */
  get state() {
    return {
      flocks: this.flocks.filter((f) => !f.leaving).map((f) => f.school),
      osprey: this.osprey?.stage ?? null,
    };
  }

  update(dt: number, input: FishBirdsInput, events: BirdEvent[]): void {
    this.time += dt;
    this.pickIn -= dt;
    if (this.pickIn <= 0) {
      this.pickIn = 2;
      this.pickSchools(input);
    }
    for (const f of this.flocks) this.stepFlock(f, dt, input.difficulty, events);
    this.flocks = this.flocks.filter((f) => !f.leaving || f.birds.some((b) => b.away < 1));
    this.stepOsprey(dt, input, events);
  }

  poses(out: BirdPose[]): void {
    for (const f of this.flocks)
      for (const b of f.birds) {
        const p = this.seabirdPos(f, b);
        out.push({
          kind: b.kind,
          pos: p.pos,
          height: p.height,
          heading: p.heading,
          flying: true,
          // Syöksyssä siivet suppuun.
          flap: b.dive ? 0.5 : (this.time * 2.6 + b.angle) % 1,
        });
      }
    const o = this.osprey;
    if (o)
      out.push({
        kind: 'osprey',
        pos: o.pos,
        height: o.height,
        heading: o.heading,
        flying: o.stage !== 'water',
        flap:
          o.stage === 'hover'
            ? (this.time * 5) % 1
            : o.stage === 'dive' || o.stage === 'circle'
              ? 0.5
              : (this.time * 1.8) % 1,
        carrying: o.carrying,
      });
  }

  /** Syövät ahvenparvet lähimmästä alkaen; muiden parvien linnut lähtevät. */
  private pickSchools(input: FishBirdsInput): void {
    const { pop, cond, near, difficulty } = input;
    const bouts = DIFFICULTIES[difficulty].feedingBouts;
    const wanted: School[] = [];
    if (fair(cond, FISH_BIRDS.minLight, FISH_BIRDS.maxWind)) {
      const schools = pop.schools ?? [];
      const close = schools.map(
        (s) => s.species === 'perch' && s.flee <= 0 && dist(s.center, near) < FISH_BIRDS.range,
      );
      // Parven kalojen keskisyvyys: vain matalalla uiva parvi ajaa kalaa pintaan.
      const depth = schools.map(() => ({ sum: 0, n: 0 }));
      for (const f of pop.fish)
        if (f.school >= 0 && close[f.school]) {
          depth[f.school]!.sum += f.depth;
          depth[f.school]!.n++;
        }
      const feeding = schools.filter((s, i) => {
        const d = depth[i]!;
        return (
          close[i] &&
          d.n > 0 &&
          d.sum / d.n < FISH_BIRDS.depth &&
          // Helpolla kalat syövät koko ajan (#510).
          (!bouts || s.bout?.feeding === true) &&
          this.surfaceFeeding(s, bouts, FISH_BIRDS.surface[difficulty])
        );
      });
      feeding.sort((a, b) => dist(a.center, near) - dist(b.center, near));
      wanted.push(...feeding.slice(0, FISH_BIRDS.flocks[difficulty]));
    }
    for (const f of this.flocks) if (!wanted.includes(f.school)) this.leave(f);
    for (const s of wanted)
      if (!this.flocks.some((f) => f.school === s && !f.leaving))
        this.flocks.push(this.newFlock(s, difficulty, cond.season ?? 'summer'));
  }

  /** Ajaako syövä parvi pikkukalaa pintaan tämän syöntijakson ajan (arvotaan jakson alussa). */
  private surfaceFeeding(s: School, bouts: boolean, chance: number): boolean {
    // Jakson ajastin laskee; uusi jakso alkaa, kun se hyppää ylös.
    const mark = bouts ? (s.bout?.timer ?? 0) : Math.floor(this.time / FISH_BIRDS.easyBout);
    const m = this.surfacing.get(s);
    if (m && (bouts ? mark <= m.mark + 1 : mark === m.mark)) {
      m.mark = mark;
      return m.on;
    }
    const on = this.rng.next() < chance;
    this.surfacing.set(s, { mark, on });
    return on;
  }

  private newFlock(school: School, difficulty: Difficulty, season: keyof typeof FISH_BIRDS.terns) {
    const r = this.rng;
    const [min, max] = FISH_BIRDS.size[difficulty];
    const count = Math.round(r.range(min, max));
    const terns = Math.min(count - 1, FISH_BIRDS.terns[season]);
    const from = r.range(0, Math.PI * 2);
    const birds: Seabird[] = [];
    for (let i = 0; i < count; i++)
      birds.push({
        kind: i < terns ? 'tern' : 'gull',
        angle: r.range(0, Math.PI * 2),
        radius: r.range(FISH_BIRDS.orbit[0], FISH_BIRDS.orbit[1]),
        height: r.range(FISH_BIRDS.height[0], FISH_BIRDS.height[1]),
        speed: (r.next() < 0.5 ? -1 : 1) * r.range(0.35, 0.6),
        dive: null,
        away: 1,
        awayDir: from + r.range(-0.4, 0.4),
      });
    return { school, center: { ...school.center }, birds, leaving: false };
  }

  private leave(f: Flock): void {
    if (f.leaving) return;
    f.leaving = true;
    for (const b of f.birds) b.awayDir = this.rng.range(0, Math.PI * 2);
  }

  private stepFlock(f: Flock, dt: number, difficulty: Difficulty, events: BirdEvent[]): void {
    // Parvi seuraa ahvenparvea pehmeästi.
    const k = Math.min(1, dt * 0.5);
    f.center.x += (f.school.center.x - f.center.x) * k;
    f.center.y += (f.school.center.y - f.center.y) * k;
    const r = this.rng;
    for (const b of f.birds) {
      // Tulo ja lähtö kestävät noin 10 s.
      b.away = f.leaving ? Math.min(1, b.away + dt / 10) : Math.max(0, b.away - dt / 10);
      b.angle += (b.speed * dt * 8) / b.radius;
      if (b.dive) {
        b.dive.t += dt;
        const time = diveTime(b.kind);
        if (b.dive.t >= time.down && b.dive.t - dt < time.down)
          events.push({ kind: 'dive', pos: { ...b.dive.at }, bird: b.kind });
        if (b.dive.t >= time.down + time.stay + time.up) b.dive = null;
      } else if (
        !f.leaving &&
        b.away < 0.05 &&
        r.chance(1 / FISH_BIRDS.diveEvery[difficulty], dt)
      ) {
        const a = r.range(0, Math.PI * 2);
        const d = Math.sqrt(r.next()) * FISH_BIRDS.orbit[0];
        b.dive = { t: 0, at: { x: f.center.x + Math.cos(a) * d, y: f.center.y + Math.sin(a) * d } };
      }
    }
    if (!f.leaving && f.birds.some((b) => b.kind === 'gull' && b.away < 0.3))
      if (r.chance(1 / FISH_BIRDS.cryEvery, dt))
        events.push({ kind: 'cry', pos: { ...f.center }, bird: 'gull' });
  }

  private seabirdPos(f: Flock, b: Seabird): { pos: Vec2; height: number; heading: number } {
    const orbit = {
      x: f.center.x + Math.cos(b.angle) * b.radius,
      y: f.center.y + Math.sin(b.angle) * b.radius,
    };
    // Kaartelun suunta on kehän tangentti.
    let heading = b.angle + (b.speed > 0 ? Math.PI / 2 : -Math.PI / 2);
    let pos = orbit;
    let height = b.height + 2 * Math.sin(b.angle * 2);
    if (b.dive) {
      const time = diveTime(b.kind);
      const t = b.dive.t;
      // Alas pintaan, hetki pinnassa ja ylös takaisin kehälle.
      const k =
        t < time.down
          ? (t / time.down) ** 2
          : t < time.down + time.stay
            ? 1
            : 1 - (t - time.down - time.stay) / time.up;
      pos = {
        x: orbit.x + (b.dive.at.x - orbit.x) * k,
        y: orbit.y + (b.dive.at.y - orbit.y) * k,
      };
      height = height * (1 - k) + 0.2 * k;
      if (k > 0.3) heading = Math.atan2(b.dive.at.y - orbit.y, b.dive.at.x - orbit.x);
    }
    if (b.away > 0) {
      const e = b.away * b.away;
      pos = {
        x: pos.x + Math.cos(b.awayDir) * FISH_BIRDS.arrive * e,
        y: pos.y + Math.sin(b.awayDir) * FISH_BIRDS.arrive * e,
      };
      height += 20 * e;
      heading = b.awayDir + (f.leaving ? 0 : Math.PI);
    }
    return { pos, height, heading };
  }

  private stepOsprey(dt: number, input: FishBirdsInput, events: BirdEvent[]): void {
    const P = FISH_BIRDS.osprey;
    const season = input.cond.season ?? 'summer';
    const r = this.rng;
    let o = this.osprey;
    if (!o) {
      if (season !== 'spring' && season !== 'summer') return;
      this.ospreyIn -= dt;
      if (this.ospreyIn > 0) return;
      this.ospreyIn = r.range(0.5, 1.5) * P.every[input.difficulty];
      if (!fair(input.cond, P.minLight, P.maxWind)) return;
      const fish = this.findPrey(input);
      if (!fish) return;
      const from = r.range(0, Math.PI * 2);
      this.osprey = o = {
        stage: 'arrive',
        fish,
        pos: { x: fish.pos.x + Math.cos(from) * 250, y: fish.pos.y + Math.sin(from) * 250 },
        height: 45,
        heading: from + Math.PI,
        t: 0,
        angle: from,
        carrying: false,
        leaveDir: 0,
      };
    }
    o.t += dt;
    const prey = o.fish.pos;
    const fly = (to: Vec2, speed: number) => {
      const d = dist(o!.pos, to);
      const step = Math.min(d, speed * dt);
      if (d > 1e-6) {
        o!.heading = Math.atan2(to.y - o!.pos.y, to.x - o!.pos.x);
        o!.pos = {
          x: o!.pos.x + Math.cos(o!.heading) * step,
          y: o!.pos.y + Math.sin(o!.heading) * step,
        };
      }
      return d - step;
    };
    const next = (stage: OspreyStage) => {
      o!.stage = stage;
      o!.t = 0;
    };
    switch (o.stage) {
      case 'arrive': {
        const to = {
          x: prey.x + Math.cos(o.angle) * P.radius,
          y: prey.y + Math.sin(o.angle) * P.radius,
        };
        o.height += (P.height - o.height) * Math.min(1, dt * 0.3);
        if (fly(to, P.speed) < 1) next('circle');
        break;
      }
      case 'circle': {
        o.angle += (dt * P.speed * 0.5) / P.radius;
        o.pos = {
          x: prey.x + Math.cos(o.angle) * P.radius,
          y: prey.y + Math.sin(o.angle) * P.radius,
        };
        o.heading = o.angle + Math.PI / 2;
        o.height = P.height + 3 * Math.sin(o.t * 0.4);
        if (o.t > P.circle) {
          // Kala painui syvälle tai ihminen tuli lähelle: sääksi etsii toisen tai lähtee.
          if (this.isPrey(o.fish, input)) next('hover');
          else {
            const other = this.findPrey(input, prey);
            if (other) {
              o.fish = other;
              next('arrive');
            } else this.ospreyLeaves(o);
          }
        }
        break;
      }
      case 'hover': {
        // Lekuttelee kalan yläpuolella.
        fly(prey, 6);
        o.height += (P.hoverHeight - o.height) * Math.min(1, dt * 1.5);
        if (o.t > P.hover) next('dive');
        break;
      }
      case 'dive': {
        fly(prey, 10);
        const k = Math.min(1, o.t / P.dive);
        o.height = P.hoverHeight * (1 - k * k);
        if (k >= 1) {
          o.height = 0;
          events.push({ kind: 'catch', pos: { ...o.pos }, bird: 'osprey' });
          next('water');
        }
        break;
      }
      case 'water':
        if (o.t > 1.5) {
          o.carrying = r.next() < P.success;
          this.ospreyLeaves(o);
        }
        break;
      case 'leave': {
        o.heading = o.leaveDir;
        o.pos = {
          x: o.pos.x + Math.cos(o.leaveDir) * P.speed * dt,
          y: o.pos.y + Math.sin(o.leaveDir) * P.speed * dt,
        };
        o.height = Math.min(40, o.height + dt * 4);
        if (o.t > 30) this.osprey = null;
        break;
      }
    }
  }

  private ospreyLeaves(o: Osprey): void {
    // Lähtee poispäin kalastajista kohti rantaa ja pesää.
    o.leaveDir = o.heading + this.rng.range(-0.6, 0.6);
    o.stage = 'leave';
    o.t = 0;
  }

  /** Sopiva saalis: pintavedessä uiva, sopivan kokoinen kala, ei ihmisen vieressä. */
  private isPrey(f: Fish, input: FishBirdsInput): boolean {
    const P = FISH_BIRDS.osprey;
    return (
      f.mode === 'roam' &&
      f.depth <= P.depth &&
      f.weight >= P.weight[0] &&
      f.weight <= P.weight[1] &&
      (P.prey as readonly SpeciesId[]).includes(f.species) &&
      input.crafts.every((c) => dist(c, f.pos) > P.near * 0.6)
    );
  }

  private findPrey(input: FishBirdsInput, around?: Vec2): Fish | null {
    const P = FISH_BIRDS.osprey;
    const fish = input.pop.fish.filter((f) => {
      const d = dist(f.pos, input.near);
      return (
        d > P.near &&
        d < P.far &&
        (!around || dist(f.pos, around) < 120) &&
        input.crafts.every((c) => dist(c, f.pos) > P.near) &&
        this.isPrey(f, input)
      );
    });
    if (fish.length === 0) return null;
    return fish[Math.floor(this.rng.next() * fish.length)]!;
  }
}

/** Syöksyn vaiheet (s): lokki poimii pinnalta, tiira sukeltaa nopeasti. */
function diveTime(kind: Seabird['kind']) {
  return kind === 'tern' ? { down: 0.45, stay: 0.25, up: 1 } : { down: 0.8, stay: 0.35, up: 1.1 };
}
