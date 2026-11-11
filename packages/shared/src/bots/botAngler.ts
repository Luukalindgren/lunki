import { CAST, predictLanding, rodTip } from '../fishing/cast';
import { DIFFICULTIES, type Difficulty } from '../fishing/difficulty';
import { stepFishPopulation, type FishConditions, type FishPopulation } from '../fishing/fish';
import {
  REEL,
  createFishing,
  lineStrength,
  lureInfo,
  needsTwitch,
  removeCaughtFish,
  resetFishing,
  stepFishing,
  type FishTag,
  type FishingContext,
  type FishingEvents,
  type FishingState,
} from '../fishing/fishing';
import { DEFAULT_TACKLE, tackleCastFactor, type LureId, type Tackle } from '../fishing/gear';
import type { LakeBottom } from '../map/bottom';
import type { WaterBody } from '../map/waterBody';
import type { EmoteId } from '../net/emote';
import { LureStage } from '../net/protocol';
import { wrapAngle, type TubeInput, type TubeState } from '../physics/tube';
import { Rng } from '../rng';
import { distance, type Vec2 } from '../vec2';

/**
 * Bottipelaaja (#624). Botti tuottaa joka askeleella samat syötteet kuin
 * pelaaja: renkaan potkut ja käännökset sekä kalastuksen syötteen, jonka
 * `stepFishing` laskee samalla koodilla kuin pelaajalle. Botti ei siis voi
 * tehdä mitään, mihin pelaaja ei pysty. Sama luokka ajetaan palvelimella
 * (moninpeli) ja laitteella (yksinpeli).
 *
 * Botilla on oma kopionsa kalakannasta kuten jokaisella pelaajalla. Se ei
 * lue kalojen paikkoja: paikan se valitsee kartasta (rannat, rakenteet) ja
 * muista kalastajista. Arvonnat tulevat botin omasta `Rng`:stä, eivät
 * kalakannan arvonnasta.
 */
export const BOT_SKILLS = ['novice', 'regular', 'veteran'] as const;
export type BotSkill = (typeof BOT_SKILLS)[number];
export const isBotSkill = (v: unknown): v is BotSkill =>
  typeof v === 'string' && (BOT_SKILLS as readonly string[]).includes(v);

/** Bottien taito kisan sääntönä: yksi taso tai sekalainen joukko. */
export const BOT_LEVELS = ['mixed', ...BOT_SKILLS] as const;
export type BotLevel = (typeof BOT_LEVELS)[number];
export const isBotLevel = (v: unknown): v is BotLevel =>
  typeof v === 'string' && (BOT_LEVELS as readonly string[]).includes(v);

/** Botin taito tason ja järjestysnumeron mukaan (sekalaisessa joka kolmas kutakin). */
export const botSkillFor = (level: BotLevel, index: number): BotSkill =>
  level === 'mixed' ? BOT_SKILLS[(index + 1) % BOT_SKILLS.length]! : level;

/** Botin tunniste pelaajalistassa alkaa tällä: muuta merkintää ei tarvita. */
export const BOT_ID_PREFIX = 'bot:';
export const isBotId = (id: string): boolean => id.startsWith(BOT_ID_PREFIX);
export const botId = (index: number): string => `${BOT_ID_PREFIX}${index}`;
/** Botin järjestysnumero tunnisteesta. */
export const botIndex = (id: string): number => Number(id.slice(BOT_ID_PREFIX.length)) || 0;

/** Bottien nimet järjestyksessä; pidemmässä listassa nimi saa numeron. */
export const BOT_NAMES = [
  'Ahven-Arska',
  'Hauki-Heikki',
  'Kuha-Kalle',
  'Siika-Sirpa',
  'Lahna-Lasse',
  'Made-Maija',
  'Säyne-Seppo',
  'Kiiski-Kaija',
  'Särki-Sakke',
  'Taimen-Tiina',
  'Muikku-Mauri',
  'Salakka-Salli',
  'Suutari-Simo',
  'Ruutana-Raili',
  'Sorva-Sami',
  'Pasuri-Pirjo',
  'Toutain-Tane',
  'Lohi-Liisa',
  'Nieriä-Niko',
  'Harjus-Hanna',
  'Kuore-Kimmo',
  'Turpa-Tuula',
  'Rapu-Reiska',
  'Simppu-Sini',
  'Mutu-Matti',
  'Vimpa-Ville',
  'Seipi-Seija',
  'Kivennuoliainen',
  'Törö-Tapsa',
  'Nahkiais-Nelli',
  'Karppi-Kake',
  'Monni-Mervi',
] as const;
export const botName = (index: number): string => {
  const base = BOT_NAMES[index % BOT_NAMES.length]!;
  const round = Math.floor(index / BOT_NAMES.length);
  return round === 0 ? base : `${base.slice(0, 13)} ${round + 1}`;
};

/** Bottien vieheet vuorotellen (virveli; perhoheittoa botti ei osaa). */
const BOT_LURES: readonly LureId[] = ['spoon', 'spinner', 'wobbler', 'jig', 'weedless'];
export const botTackle = (index: number): Tackle => ({
  ...DEFAULT_TACKLE,
  lure: BOT_LURES[index % BOT_LURES.length]!,
});

interface SkillParams {
  /** Heiton suunnan hajonta (rad) ja voiman vaihteluväli (osuus latauksesta). */
  aimSpread: number;
  power: readonly [number, number];
  /** Viive ennen pinnassa olevan kalan nostoa (s). */
  landDelay: readonly [number, number];
  /** Todennäköisyys, että botti nykäisee ison kalan tärppiin. */
  twitch: number;
  /** Hellittää kelausta, kun siima on katkeamaisillaan. */
  easeOff: boolean;
  /** Odottaa riuhtaisun loppuun ennen nostoa. */
  waitLunge: boolean;
  /** Osuus paikanvalinnoista, joissa botti hakeutuu toisen kalastajan viereen. */
  crowd: number;
  /** Heittoja samasta paikasta ennen paikan vaihtoa. */
  casts: readonly [number, number];
  /** Kelaa vieheen sisään ukkosella. */
  shelter: boolean;
  /** Tauot kelauksessa: todennäköisyys sekunnissa ja kesto (s). */
  pause: number;
  /** Käsimerkin todennäköisyys saaliista ja karkuutuksesta. */
  cheer: number;
  sulk: number;
}

export const BOT_SKILL: Record<BotSkill, SkillParams> = {
  // Aloittelija: heittää minne sattuu, tulee muiden viereen ja sotkee siimoja.
  novice: {
    aimSpread: 1.1,
    power: [0.3, 1],
    landDelay: [1.2, 2.6],
    twitch: 0,
    easeOff: false,
    waitLunge: false,
    crowd: 0.6,
    casts: [2, 4],
    shelter: false,
    pause: 0.12,
    cheer: 0.9,
    sulk: 0.5,
  },
  regular: {
    aimSpread: 0.5,
    power: [0.5, 1],
    landDelay: [0.7, 1.2],
    twitch: 0.5,
    easeOff: true,
    waitLunge: false,
    crowd: 0.15,
    casts: [4, 7],
    shelter: true,
    pause: 0.03,
    cheer: 0.6,
    sulk: 0.2,
  },
  // Konkari: rakenteiden reunat, tarkat heitot ja väsytys jarrua varoen; väistää muita.
  veteran: {
    aimSpread: 0.18,
    power: [0.7, 1],
    landDelay: [0.3, 0.6],
    twitch: 1,
    easeOff: true,
    waitLunge: true,
    crowd: 0,
    casts: [5, 9],
    shelter: true,
    pause: 0.05,
    cheer: 0.35,
    sulk: 0.05,
  },
};

const BOT = {
  /** Perillä, kun paikkaan on enintään näin pitkä matka (m). */
  arrive: 5,
  /** Paikka valitaan tältä etäisyydeltä (m). */
  near: 25,
  far: 110,
  /** Rannasta pidetään tämä väli (m). */
  shoreGap: 5,
  /** Tavallinen kalastaja pysyy rannan tuntumassa: etäisyys rannasta (m). */
  shoreNear: 10,
  shoreFar: 35,
  /** Jumissa, jos matka ei lyhene tässä ajassa (s) tämän vertaa (m). */
  stuckTime: 5,
  stuckGain: 1.5,
  /** Suunta on kohdallaan tällä tarkkuudella (rad). */
  facing: 0.2,
  /** Tervehdys, kun toinen kalastaja on näin lähellä (m), enintään näin usein (s). */
  greetRange: 25,
  greetEvery: 180,
  /** Isosta kalasta (kg) näytetään kalan mitta. */
  bigFish: 1,
  /** Jännitys, jolla hellitetään (osuus siiman lujuudesta). */
  ease: 0.75,
} as const;

const REST: TubeInput = { kick: 0, turn: 0, sprint: false };

/** Mitä botti havaitsee askeleella: oma rengas, kisan tila ja muut kalastajat. */
export interface BotSenses {
  tube: TubeState;
  /** Voi kalastaa: ei jäähyä, ei kumossa, ei maalla. */
  canFish: boolean;
  /** Siima sotkussa toisen kanssa: kalastus on jäissä, kelaus selvittää. */
  tangled: boolean;
  /** Ukkonen: vapa ylhäällä on vaarassa. */
  thunder: boolean;
  /** Muiden kalastajien paikat. */
  others: readonly Vec2[];
  wind?: Vec2;
  cond: FishConditions;
}

export interface BotStep {
  /** Renkaan syöte seuraaville askelille. */
  input: TubeInput;
  events: FishingEvents;
  /** Käsimerkki (ja repliikki) tällä askeleella. */
  emote?: EmoteId;
}

export interface BotOptions {
  index: number;
  skill: BotSkill;
  /** Kisan siemen: botin arvonnat johdetaan siitä ja järjestysnumerosta. */
  seed: number;
  difficulty: Difficulty;
  water: WaterBody;
  bottom: LakeBottom;
  /** Botin oma kopio kisan kalakannasta. */
  pop: FishPopulation;
  tackle?: Tackle;
}

export class BotAngler {
  readonly index: number;
  readonly skill: BotSkill;
  readonly fishing: FishingState;
  readonly pop: FishPopulation;
  /** Kelaa juuri nyt (siimasotkun selvitys, veneen säännöt). */
  reeling = false;
  private readonly rng: Rng;
  private readonly fishRng: Rng;
  private readonly water: WaterBody;
  private readonly bottom: LakeBottom;
  private readonly difficulty: Difficulty;
  private readonly world: { isWater(p: Vec2): boolean; depthAt(p: Vec2): number };
  /** Määränpää; null = kalastetaan tässä. */
  private spot: Vec2 | null = null;
  /** Mitä kohti paikalla heitetään (rakenne, ranta tai toinen kalastaja). */
  private look: Vec2 | null = null;
  /** Kohteen säde (m): heitto mitoitetaan sen reunaan. */
  private lookRadius = 0;
  /** Heiton pituus (m) voiman mukaan tyynellä: [voima, matka]. */
  private readonly reach: (readonly [number, number])[];
  private face = 0;
  private castsLeft = 0;
  /** Saaliista saatavat lisäheitot tällä paikalla. */
  private bonusCasts = 0;
  private charge = 0;
  private aim: Vec2 = { x: 0, y: 0 };
  /** Tauko ennen seuraavaa heittoa tai kelauksen jatkoa (s). */
  private wait = 0;
  private pause = 0;
  private landDelay = 1;
  /** Tämän tärpin nykäisy on jo päätetty. */
  private strikeSeen: number | null = null;
  private twitchNow = false;
  private stuckTimer = 0;
  private stuckFrom = Infinity;
  private greetIn = 5;
  private started = false;

  constructor(o: BotOptions) {
    this.index = o.index;
    this.skill = o.skill;
    this.water = o.water;
    this.bottom = o.bottom;
    this.pop = o.pop;
    this.difficulty = o.difficulty;
    this.rng = new Rng((o.seed ^ Math.imul(o.index + 1, 0x9e3779b1)) >>> 0);
    this.fishRng = new Rng((o.seed ^ Math.imul(o.index + 1, 0x85ebca6b)) >>> 0);
    this.fishing = createFishing(o.tackle ?? botTackle(o.index));
    this.world = {
      isWater: (p) => o.water.isWater(p),
      depthAt: (p) => o.bottom.depthAt(p),
    };
    const factor = tackleCastFactor(this.fishing.tackle);
    this.reach = [0.2, 0.35, 0.5, 0.65, 0.8, 1].map(
      (power) => [power, predictLanding({ x: 0, y: 0 }, 0, power, factor).x] as const,
    );
  }

  /** Vieheen vaihe ja paikka muille näytettäväksi (kuten pelaajan asiakas kertoo). */
  get lureStage(): LureStage {
    const f = this.fishing;
    return f.hookedId !== null
      ? LureStage.hooked
      : f.stage === 'flight' || f.stage === 'casting'
        ? LureStage.flight
        : f.stage === 'water'
          ? LureStage.water
          : LureStage.none;
  }

  get lure(): Vec2 {
    return this.fishing.lure;
  }

  /** Toinen kalastaja nosti kalan: se poistuu botinkin kopiosta. */
  removeCaught(tag: FishTag): void {
    removeCaughtFish(this.fishing, this.pop, tag, this.world, this.fishRng);
  }

  /** Siima poikki (rangaistus, sotkun selvitys): viehe takaisin kelalle. */
  reset(): void {
    resetFishing(this.fishing, { pop: this.pop, rng: this.fishRng });
    this.charge = 0;
    this.reeling = false;
    this.wait = this.rng.range(1, 3);
  }

  step(sn: BotSenses, dt: number): BotStep {
    const s = this.fishing;
    const k = BOT_SKILL[this.skill];
    const diff = DIFFICULTIES[this.difficulty];
    const { pos, heading } = sn.tube;
    const ctx: FishingContext = {
      tubePos: pos,
      heading,
      ...this.world,
      ...(sn.wind && { wind: sn.wind }),
      reedsAt: (p) => this.water.reedsAt(p) !== null,
      structureAt: (p) => this.bottom.structureAt(p),
      bottomTypeAt: (p) => this.bottom.bottomTypeAt(p),
    };
    const fe = stepFishPopulation(
      this.pop,
      lureInfo(s, ctx),
      this.world,
      diff,
      this.fishRng,
      dt,
      sn.cond,
    );
    const out: BotStep = { input: REST, events: {} };
    this.reeling = false;
    if (!sn.canFish) {
      if (s.stage !== 'idle' || s.hookedId !== null) this.reset();
      return out;
    }
    if (sn.tangled) {
      // Sotku selviää kelaamalla; oma kalastus odottaa.
      this.reeling = true;
      return out;
    }
    if (!this.started) {
      // Kisa alkaa lähtöpaikalta heittäen kuten muillakin; paikkaa vaihdetaan vasta sitten.
      this.started = true;
      this.arrived(sn);
    }
    this.greetIn -= dt;
    if (this.greetIn <= 0 && sn.others.some((o) => distance(o, pos) < BOT.greetRange)) {
      this.greetIn = BOT.greetEvery * this.rng.range(0.7, 1.5);
      if (this.skill !== 'veteran' || this.rng.next() < 0.3) out.emote = 'wave';
    }

    const idle = s.stage === 'idle';
    const shelter = k.shelter && sn.thunder;
    this.wait = Math.max(0, this.wait - dt);
    if (idle && this.charge <= 0) {
      if (this.spot) out.input = this.travel(sn, dt);
      else {
        const err = wrapAngle(this.face - heading);
        out.input = this.turnTo(err, sn.tube.angVel);
        if (Math.abs(err) < BOT.facing && this.wait <= 0 && !shelter && !s.needRelease) {
          if (this.castsLeft <= 0) this.pickSpot(sn);
          else this.startCast(pos, heading, k);
        }
      }
    }

    // Tärppi: nykäisy päätetään kerran iskua kohden.
    if (s.struckId !== null && s.struckId !== this.strikeSeen) {
      this.strikeSeen = s.struckId;
      const fish = this.pop.fish.find((f) => f.id === s.struckId);
      this.twitchNow = needsTwitch(fish, diff) && this.rng.next() < k.twitch;
    } else if (s.struckId === null) this.strikeSeen = null;

    const inWater = s.stage === 'water';
    const hooked = s.hookedId !== null;
    // Kelauksen tauot: aloittelija unohtuu katselemaan, konkari uittaa pysäytellen.
    this.pause = Math.max(0, this.pause - dt);
    if (inWater && !hooked && this.pause <= 0 && this.rng.next() < k.pause * dt)
      this.pause = this.rng.range(0.6, 1.8);
    const tight = k.easeOff && s.tension > lineStrength(s) * BOT.ease;
    const reel =
      inWater &&
      !s.onLand &&
      (shelter || s.struckId !== null || (hooked ? !tight : this.pause <= 0));
    const charging = idle || s.stage === 'charging';
    const castHeld = charging && this.charge > 0 && !(idle && s.needRelease);
    if (s.stage === 'charging') this.charge -= dt;
    const landing = s.landing;
    const land =
      landing !== null && landing.age > this.landDelay && !(k.waitLunge && landing.lunge > 0);
    const fast = shelter && inWater && !hooked && s.gear !== REEL.fastGear;
    const ev = stepFishing(
      s,
      {
        aim: this.aim,
        castHeld,
        reel,
        cancel: false,
        cut: inWater && s.onLand,
        land,
        ...(this.twitchNow && s.struckId !== null && { twitch: true }),
        ...(fast && { gear: REEL.fastGear }),
      },
      { ...ctx, fish: { pop: this.pop, diff, rng: this.fishRng, strike: fe.strike } },
      dt,
    );
    this.reeling = reel;
    out.events = ev;
    if (ev.cast !== undefined) {
      this.charge = 0;
      this.castsLeft--;
    }
    if (ev.hooked) this.landDelay = this.rng.range(k.landDelay[0], k.landDelay[1]);
    if (ev.home || ev.lineCut || ev.lureLost || ev.lineBroken || ev.bitOff)
      this.wait = this.rng.range(0.4, 1.5);
    if (ev.caught) {
      // Kala tuli: tästä kannattaa heittää vielä, mutta ei loputtomiin.
      if (this.bonusCasts > 0) {
        this.bonusCasts--;
        this.castsLeft++;
      }
      this.wait = this.rng.range(2, 4);
      if (this.rng.next() < k.cheer)
        out.emote = ev.caught.weight >= BOT.bigFish ? 'bigFish' : 'thumbsUp';
    } else if ((ev.escaped || ev.lineBroken || ev.bitOff) && this.rng.next() < k.sulk)
      out.emote = this.skill === 'novice' && this.rng.next() < 0.5 ? 'middleFinger' : 'fist';
    return out;
  }

  /**
   * Uusi heitto: suunta katseen ympäriltä ja voima taidon mukaan. Konkari
   * mitoittaa heiton rakenteen reunaan, muut heittävät summassa.
   */
  private startCast(pos: Vec2, heading: number, k: SkillParams): void {
    const a = heading + this.rng.range(-k.aimSpread, k.aimSpread);
    const tip = rodTip(pos, heading);
    this.aim = { x: tip.x + Math.cos(a) * 20, y: tip.y + Math.sin(a) * 20 };
    let power = this.rng.range(k.power[0], k.power[1]);
    if (this.skill === 'veteran' && this.look) {
      const edge = distance(tip, this.look) - this.lookRadius * this.rng.range(0.2, 0.9);
      power = this.powerFor(Math.max(8, edge + this.rng.range(-2, 3)));
    }
    this.charge = power * CAST.chargeTime;
  }

  /** Voima, jolla viehe lentää tyynellä `d` metriä. */
  private powerFor(d: number): number {
    const t = this.reach;
    for (let i = 1; i < t.length; i++) {
      const [p0, d0] = t[i - 1]!;
      const [p1, d1] = t[i]!;
      if (d <= d1) return Math.max(p0, p0 + ((p1 - p0) * (d - d0)) / (d1 - d0));
    }
    return 1;
  }

  /**
   * Potkii kohti määränpäätä. Renkaalla liikutaan selkä edellä, joten katse
   * käännetään poispäin kohteesta. Jumiin jäänyt (ranta, toinen rengas)
   * valitsee uuden paikan.
   */
  private travel(sn: BotSenses, dt: number): TubeInput {
    const { pos, heading, angVel, stamina } = sn.tube;
    const spot = this.spot!;
    const d = distance(pos, spot);
    if (d <= BOT.arrive) {
      this.arrived(sn);
      return REST;
    }
    this.stuckTimer += dt;
    if (this.stuckTimer >= BOT.stuckTime) {
      if (this.stuckFrom - d < BOT.stuckGain) {
        // Ei etene: kalastetaan tässä, jos vettä riittää, muuten uusi paikka.
        if (this.rng.next() < 0.5) this.arrived(sn);
        else this.pickSpot(sn);
        return REST;
      }
      this.stuckTimer = 0;
      this.stuckFrom = d;
    }
    const want = Math.atan2(pos.y - spot.y, pos.x - spot.x);
    const err = wrapAngle(want - heading);
    const turn = this.turnTo(err, angVel);
    return {
      kick: Math.abs(err) < 0.7 ? 1 : 0,
      turn: turn.turn,
      sprint: this.skill !== 'novice' && d > 50 && stamina > 0.5 && Math.abs(err) < 0.3,
    };
  }

  /** Käännös kohti suuntaa; ennakoi kääntymisnopeuden, ettei heilu kohteen yli. */
  private turnTo(err: number, angVel: number): TubeInput {
    const ahead = err - angVel * 0.25;
    return { kick: 0, turn: ahead > 0.06 ? 1 : ahead < -0.06 ? -1 : 0, sprint: false };
  }

  /** Perillä: katse kohteeseen (tai rantaan päin) ja muutama heitto. */
  private arrived(sn: BotSenses): void {
    const k = BOT_SKILL[this.skill];
    const pos = sn.tube.pos;
    this.spot = null;
    // Ilman kohdetta heitetään rannasta poispäin ja sen suuntaisesti; aloittelija minne sattuu.
    const shore = this.skill === 'novice' ? null : this.water.closestShorePoint(pos, 60);
    this.face = this.look
      ? Math.atan2(this.look.y - pos.y, this.look.x - pos.x)
      : shore
        ? Math.atan2(pos.y - shore.point.y, pos.x - shore.point.x) + this.rng.range(-1.2, 1.2)
        : this.rng.range(-Math.PI, Math.PI);
    this.castsLeft = Math.round(this.rng.range(k.casts[0], k.casts[1]));
    this.bonusCasts = 2;
    this.wait = this.rng.range(0.3, 1.5);
  }

  /** Vesireitti suoraan: pisteet 4 m välein ovat vettä. */
  private clearPath(a: Vec2, b: Vec2): boolean {
    const d = distance(a, b);
    const n = Math.max(1, Math.ceil(d / 4));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      if (!this.water.isWater({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })) return false;
    }
    return true;
  }

  /**
   * Seuraava kalapaikka taidon mukaan: aloittelija hakeutuu usein muiden
   * viereen, konkari rakenteen (kivikko, kaislikon reuna, kaatunut puu)
   * heittoetäisyydelle muita väistäen, ja muuten paikka on lähivesiltä.
   */
  private pickSpot(sn: BotSenses): void {
    const k = BOT_SKILL[this.skill];
    const me = sn.tube.pos;
    const rng = this.rng;
    this.stuckTimer = 0;
    this.stuckFrom = Infinity;
    const structures =
      this.skill === 'veteran'
        ? this.bottom.structures
            .filter((st) => distance(st.pos, me) < 250 && distance(st.pos, me) > 20)
            .sort((a, b) => distance(a.pos, me) - distance(b.pos, me))
            .slice(0, 6)
        : [];
    for (let i = 0; i < 40; i++) {
      const a = rng.range(-Math.PI, Math.PI);
      let target: Vec2;
      let look: Vec2 | null = null;
      let radius = 0;
      let open = false;
      if (sn.others.length > 0 && rng.next() < k.crowd) {
        const o = sn.others[Math.floor(rng.next() * sn.others.length) % sn.others.length]!;
        const r = rng.range(7, 16);
        target = { x: o.x + Math.cos(a) * r, y: o.y + Math.sin(a) * r };
        look = o;
      } else if (structures.length > 0 && i < 25) {
        const st = structures[Math.floor(rng.next() * structures.length) % structures.length]!;
        const r = st.radius + rng.range(10, 18);
        target = { x: st.pos.x + Math.cos(a) * r, y: st.pos.y + Math.sin(a) * r };
        look = st.pos;
        radius = st.radius;
      } else if (i === 30 && this.skill !== 'novice') {
        // Selällä: lähimmän rannan tuntumaan.
        const shore = this.water.closestShorePoint(me);
        if (!shore || shore.distance < BOT.shoreFar) continue;
        const k = 20 / shore.distance;
        target = {
          x: shore.point.x + (me.x - shore.point.x) * k,
          y: shore.point.y + (me.y - shore.point.y) * k,
        };
      } else {
        open = this.skill !== 'novice';
        const r = rng.range(BOT.near, BOT.far);
        target = { x: me.x + Math.cos(a) * r, y: me.y + Math.sin(a) * r };
      }
      if (!this.water.isWater(target)) continue;
      const shore = this.water.closestShorePoint(target, open ? BOT.shoreFar : BOT.shoreGap);
      if (shore ? shore.distance < (open ? BOT.shoreNear : BOT.shoreGap) : open && i < 30) continue;
      if (this.skill === 'veteran' && sn.others.some((o) => distance(o, target) < 15)) continue;
      if (!this.clearPath(me, target)) continue;
      this.spot = target;
      this.look = look;
      this.lookRadius = radius;
      return;
    }
    // Ei löytynyt: kalastetaan tässä.
    this.look = null;
    this.arrived(sn);
  }
}
