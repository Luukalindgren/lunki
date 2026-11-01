import type { Vec2 } from '../vec2';
import { BOAT_HULL, SEAT_OFFSET, BoatSeat } from './boat';
import { INFLATE, arrowOf, inflateSequence, Arrow } from './inflate';
import { ground, type ShoreWater } from './shore';
import { STAMINA, createTube, staminaThrust, type TubeInput, type TubeState } from './tube';

/**
 * Veneen vesillelasku täyttökisassa (#458, Luukan lisäys): vene on rannalla
 * vettä täynnä. Venekunta äyskäröi sen tyhjäksi samalla mekaniikalla kuin
 * renkaan pumppaus: keula ja perä ovat omat osansa, pääkonteksti on yksi
 * kauhallinen (kauha palaa noin 0,25 s:ssa), ja nuolisarja vaihtaa osaa.
 * Vettä on venekunnan koko × yhden renkaan työ, joten vene valmistuu
 * suunnilleen renkaan ajassa miehistön koosta riippumatta. Sitten vene
 * työnnetään veteen ja airot kiinnitetään, kumpikin nuolisarjalla, jonka
 * kuka tahansa venekunnasta voi tehdä.
 *
 * Veneen tila (`TubeState.launch`) on soutajan renkaassa kuten veneen muukin
 * tila; jokaisella venekunnan jäsenellä on oma äyskäröijän tila
 * (`TubeState.bailer`). Jaettu asiakkaan ja palvelimen kesken.
 */
export interface BoatLaunch {
  /** Vettä jäljellä kauhallisina: keula, perä. */
  water: [number, number];
  /** Vettä alussa kummassakin osassa (veden pinnan korkeuteen). */
  full: number;
  /** LaunchStage: äyskäröinti, veteen työntö, airot, valmis. */
  stage: number;
  /** Kisan siemen: nuolisarjat ovat kaikilla samat. */
  seed: number;
}

/** Vesillelaskun vaiheet. */
export const LaunchStage = { bail: 0, push: 1, oars: 2, done: 3 } as const;

/** Veneen osat: keula ja perä. */
export const BoatPart = { bow: 0, stern: 1 } as const;

/** Yhden venekunnan jäsenen äyskäröinti. */
export interface Bailer {
  /** Osa, jota äyskäröi (BoatPart). */
  part: number;
  /** Nuolisarjasta osuttuja (osan vaihto, työntö, airot); null = äyskäröi. */
  moving: number | null;
  /** Kauhan palautus 0–1 (1 = valmis täyteen kauhalliseen). */
  handle: number;
  /** Edellisen askeleen nuoli (reunojen tunnistukseen). */
  arrow: number;
  /** Vaihe, jonka jäsen on nähnyt: uuteen vaiheeseen sarja alkaa alusta. */
  stage: number;
}

export const LAUNCH = {
  /** Kauhallisia venekunnan jäsentä kohden: sama työ kuin renkaan pumppaus. */
  scoops: INFLATE.strokes.reduce((a, b) => a + b, 0),
  /** Väärä nuoli osaa vaihtaessa loiskauttaa vettä takaisin (kauhallisina). */
  spill: INFLATE.leakStrokes,
  /** Nuolisarjojen pituudet: osan vaihto, veteen työntö, airot. */
  sequence: { part: 4, push: 5, oars: 5 },
  /** Vesille laskettu vene keulasta rantaviivaan (m). */
  offshore: 0.8,
  /** Rannalla keula rantaviivasta maalle päin (m). */
  inland: 0.3,
  /** Äyskäröijä seisoo laidan vieressä (m veneen keskilinjasta). */
  standOut: BOAT_HULL.beam / 2 + 0.45,
} as const;

/** Nuolisarjat: osan vaihto keulasta (10) ja perästä (11), työntö (12), airot (13). */
export function launchSequence(seed: number, kind: number): number[] {
  const n =
    kind === 12 ? LAUNCH.sequence.push : kind === 13 ? LAUNCH.sequence.oars : LAUNCH.sequence.part;
  return inflateSequence(seed, kind, n);
}

/** Nyt tehtävän nuolisarjan laji; null = äyskäröidään. */
export function launchSequenceKind(launch: BoatLaunch, b: Bailer): number | null {
  if (b.moving === null) return null;
  if (launch.stage === LaunchStage.bail) return 10 + b.part;
  return launch.stage === LaunchStage.push ? 12 : 13;
}

/** Uusi vesillelasku: vettä venekunnan koon mukaan, puolet keulassa ja puolet perässä. */
export function createLaunch(seed: number, crew: number): BoatLaunch {
  const half = (Math.max(1, crew) * LAUNCH.scoops) / 2;
  return { water: [half, half], full: half, stage: LaunchStage.bail, seed: seed >>> 0 };
}

/** Jäsen aloittaa paikkansa päästä: perän kalastaja perästä, muut keulasta. */
export const createBailer = (seat: number): Bailer => ({
  part: seat === BoatSeat.stern ? BoatPart.stern : BoatPart.bow,
  moving: null,
  handle: 1,
  arrow: Arrow.none,
  stage: LaunchStage.bail,
});

/** Vettä jäljellä 0–1 koko veneessä. */
export const launchWater = (l: BoatLaunch): number =>
  l.full > 0 ? (l.water[0] + l.water[1]) / (2 * l.full) : 0;

export interface BailStep {
  launch: BoatLaunch;
  bailer: Bailer;
  stamina: number;
  /** Kauhallinen tällä askeleella (0–1 täyteys), sarja valmis, väärä nuoli. */
  scoop: number;
  advanced: boolean;
  slipped: boolean;
}

/**
 * Yksi jäsenen askel: kauha palautuu, painallus äyskäröi oman osan, tyhjästä
 * osasta siirrytään nuolisarjalla toiseen, ja kun vene on tyhjä, työntö ja
 * airot tehdään nuolisarjoilla. Vaihe etenee koko venekunnalle.
 */
export function stepBail(
  launch: BoatLaunch,
  bailer: Bailer,
  input: TubeInput,
  stamina: number,
  dt: number,
): BailStep {
  const water: [number, number] = [...launch.water];
  let { stage } = launch;
  let { part, moving, handle } = bailer;
  // Vaihe vaihtui (toinen sai sarjan valmiiksi): uusi sarja alusta.
  if (bailer.stage !== stage) moving = stage === LaunchStage.bail ? null : 0;
  let scoop = 0;
  let advanced = false;
  let slipped = false;
  const arrow = arrowOf(input);
  const pressed = arrow !== Arrow.none && arrow !== bailer.arrow ? arrow : Arrow.none;
  handle = Math.min(1, handle + dt / INFLATE.handleTime);
  let st = Math.min(1, stamina + STAMINA.restRegen * INFLATE.regen * dt);
  const other = 1 - part;
  if (stage === LaunchStage.bail && moving === null && water[part]! <= 0 && water[other]! > 0)
    moving = 0;
  if (moving !== null && stage < LaunchStage.done) {
    if (pressed !== Arrow.none) {
      const kind = stage === LaunchStage.bail ? 10 + part : stage === LaunchStage.push ? 12 : 13;
      const seq = launchSequence(launch.seed, kind);
      if (seq[moving] === pressed) {
        moving++;
        if (moving >= seq.length) {
          advanced = true;
          if (stage === LaunchStage.bail) {
            part = other;
            moving = null;
          } else {
            stage++;
            moving = stage < LaunchStage.done ? 0 : null;
          }
        }
      } else {
        // Väärä nuoli: sarja alkaa alusta, ja osaa vaihtaessa vettä loiskahtaa takaisin.
        slipped = true;
        if (stage === LaunchStage.bail) {
          water[part] = Math.min(launch.full, water[part]! + LAUNCH.spill);
          moving = null;
        } else moving = 0;
      }
    }
  } else if (stage === LaunchStage.bail && input.main && water[part]! > 0) {
    scoop = handle;
    const amount = handle * staminaThrust(st);
    st = Math.max(0, st - INFLATE.strokeDrain * handle);
    handle = 0;
    const next = water[part]! - amount;
    water[part] = next <= 1e-9 ? 0 : next;
  }
  if (stage === LaunchStage.bail && water[0] <= 0 && water[1] <= 0) {
    stage = LaunchStage.push;
    moving = 0;
    advanced = true;
  }
  return {
    launch: { ...launch, water, stage },
    bailer: { part, moving, handle, arrow, stage },
    stamina: st,
    scoop,
    advanced,
    slipped,
  };
}

/** Äyskäröijän paikka laidan vieressä: keulan tai perän puolella, kukin omalla laidallaan. */
export function bailSpot(boat: { pos: Vec2; heading: number }, part: number, seat: number): Vec2 {
  const along = part === BoatPart.stern ? SEAT_OFFSET * 0.8 : -SEAT_OFFSET * 0.8;
  const side = seat === BoatSeat.stern ? -1 : 1;
  const c = Math.cos(boat.heading);
  const s = Math.sin(boat.heading);
  // Keulassa saman osan kaksi jäsentä eri laidoilla (soutaja ja keulan kalastaja).
  const out = LAUNCH.standOut * (seat === BoatSeat.bow ? -side : side);
  return { x: boat.pos.x + c * along - s * out, y: boat.pos.y + s * along + c * out };
}

/**
 * Rantaan nostettu vene: keula vesirajassa järvelle päin, perä maalla.
 * `slot` on täyttökisan rivin paikka (kalastajan katse järvelle).
 */
export function beachedBoat(
  water: ShoreWater,
  slot: Vec2,
  seed: number,
  crew: number,
): TubeState | null {
  const c = water.closestShorePoint(slot);
  if (!c || c.distance < 1e-6) return null;
  const k = water.isWater(slot) ? 1 : -1;
  const inland = {
    x: ((c.point.x - slot.x) * k) / c.distance,
    y: ((c.point.y - slot.y) * k) / c.distance,
  };
  // Soutajan paikka veneen keskellä; keula (−heading) osoittaa järvelle.
  const mid = -(SEAT_OFFSET + 0.45 - BOAT_HULL.length) + LAUNCH.inland;
  const pos = { x: c.point.x + inland.x * mid, y: c.point.y + inland.y * mid };
  // Laiturin kansi (#475) ei käy: vene nostetaan maapohjalle.
  if (!ground(water, pos)) return null;
  return {
    ...createTube(pos, Math.atan2(inland.y, inland.x)),
    launch: createLaunch(seed, crew),
    bailer: createBailer(BoatSeat.rower),
  };
}

/**
 * Soutajan paikka vesille lasketussa veneessä: keula edellä järveen, perä
 * rantaan. null = vettä ei löytynyt (vene jää paikalleen). Asiakas piirtää
 * veneen tänne jo airoja kiinnitettäessä (työntö vesille).
 */
export function launchedPos(boat: { pos: Vec2; heading: number }, water: ShoreWater): Vec2 | null {
  const c = water.closestShorePoint(boat.pos);
  const out = { x: -Math.cos(boat.heading), y: -Math.sin(boat.heading) };
  const from = c?.point ?? boat.pos;
  // Keula on soutajasta BOW-etäisyydellä: vene kokonaan veteen.
  const bow = BOAT_HULL.length - (SEAT_OFFSET + 0.45);
  for (let d = bow + LAUNCH.offshore; d < bow + 8; d += 0.5) {
    const pos = { x: from.x + out.x * d, y: from.y + out.y * d };
    if (water.isWater(pos)) return pos;
  }
  return null;
}

/** Valmis vene vesille: keula edellä järveen, perä rantaan. */
export function launchBoat(boat: TubeState, water: ShoreWater): TubeState {
  const { launch: _launch, bailer: _bailer, ...rest } = boat;
  const pos = launchedPos(boat, water);
  return pos ? { ...rest, pos, vel: { x: 0, y: 0 }, angVel: 0 } : { ...rest, vel: { x: 0, y: 0 } };
}

/** Kulkeeko venekunnan jäsen vielä rannalla (vene maissa). */
export const isLaunching = (t: TubeState): boolean =>
  t.launch !== undefined || t.bailer !== undefined;

/** Verkon kentät vesillelaskulle (PlayerState.launch…, bail…): 0 = ei. */
export interface LaunchNet {
  /** Veneen vaihe + 1; 0 = vene vesillä. */
  launch: number;
  water0: number;
  water1: number;
  waterFull: number;
  launchSeed: number;
  /** Äyskäröijän osa + 1; 0 = ei äyskäröi. */
  bail: number;
  /** Nuolisarjasta osuttuja + 1; 0 = äyskäröi. */
  bailMove: number;
  bailHandle: number;
  bailArrow: number;
  bailStage: number;
}

export function launchToNet(t: TubeState): LaunchNet {
  const l = t.launch;
  const b = t.bailer;
  return {
    launch: l ? l.stage + 1 : 0,
    water0: l?.water[0] ?? 0,
    water1: l?.water[1] ?? 0,
    waterFull: l?.full ?? 0,
    launchSeed: l?.seed ?? 0,
    bail: b ? b.part + 1 : 0,
    bailMove: b && b.moving !== null ? b.moving + 1 : 0,
    bailHandle: b?.handle ?? 0,
    bailArrow: b?.arrow ?? 0,
    bailStage: b?.stage ?? 0,
  };
}

export function launchFromNet(p: Partial<LaunchNet>): Pick<TubeState, 'launch' | 'bailer'> {
  const out: Pick<TubeState, 'launch' | 'bailer'> = {};
  if (p.launch)
    out.launch = {
      water: [p.water0 ?? 0, p.water1 ?? 0],
      full: p.waterFull ?? 0,
      stage: p.launch - 1,
      seed: p.launchSeed ?? 0,
    };
  if (p.bail)
    out.bailer = {
      part: p.bail - 1,
      moving: p.bailMove ? p.bailMove - 1 : null,
      handle: p.bailHandle ?? 0,
      arrow: p.bailArrow ?? 0,
      stage: p.bailStage ?? 0,
    };
  return out;
}
