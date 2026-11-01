import type { Vec2 } from '../vec2';
import { createInflate, inflated, stepInflate, type InflateState } from './inflate';
import { STAMINA, TUBE_RADIUS, wrapAngle, type TubeInput, type TubeState } from './tube';

/**
 * Rantautuminen (#457): kelluntarenkaalla voi nousta maihin mihin tahansa
 * rantaan, kävellä maalla kapealla kaistalla rantaviivan tuntumassa ja nousta
 * rannalta takaisin kyytiin. Jaettu asiakkaan ja palvelimen kesken kuten
 * renkaan fysiikka, joten kaikki on deterministista.
 *
 * Maalla `TubeState.pos` on kalastajan paikka ja `heading` hänen katseensa;
 * rengas on maassa kohdassa `shore.tube` tai kalastajan vyötäröllä. Näin
 * kamera, äänet, salama ja muiden näkymä seuraavat kalastajaa itseään.
 */
export interface ShoreState {
  /** Rengas maassa (kannettaessa sama kuin kalastajan paikka). */
  tube: Vec2;
  /** Renkaan suunta maassa. */
  tubeHeading: number;
  /** Rengas kalastajan vyötäröllä. */
  carrying: boolean;
  /** Kyytiin hyppy käynnissä 0–1 (`tube` on silloin jo vedessä); puuttuu = ei hypätä. */
  board?: number;
  /**
   * Juuri maihin noustu: kävely odottaa, kunnes potku päästetään irti, ettei
   * maihin vienyt S-näppäin kävelytä kalastajaa heti takaperin metsään.
   */
  settle?: boolean;
  /**
   * Täyttökisa (#458): rengas on vielä tyhjä, ja kalastaja pumppaa sitä
   * paikallaan. Puuttuu, kun rengas on täynnä (tai kisa alkoi vedestä).
   */
  inflate?: InflateState;
}

export const SHORE = {
  /** Kävelykaista rantaviivasta maalle päin (m). Luuka: aluksi 5 m. */
  band: 5,
  /** Selkä edellä rantaa vasten potkimista maihin nousuun (s). */
  landTime: 1,
  /** Rantaa näin lähellä (m renkaan reunasta) potku vie maihin. */
  landReach: 0.3,
  /** Potkun suunnan pitää osoittaa näin suoraan rantaan (kosini). */
  landAim: 0.5,
  /** Kävely- ja kantonopeus (m/s); takaperin hitaammin. */
  walkSpeed: 1.2,
  carrySpeed: 0.8,
  backFactor: 0.5,
  /** Kääntyminen maalla (rad/s). */
  turnRate: 2.4,
  /** Askelrytmi: askelvaihe kiertää 0–1 tällä matkalla (m). */
  stride: 1.4,
  /** Renkaan ottaminen: kalastajan ja renkaan keskipisteiden suurin etäisyys (m). */
  reach: 1.6,
  /** Kyytiin hypätään, kun rantaviiva on näin lähellä (m). */
  waterline: 2.2,
  /** Hyppy kestää (s). */
  boardTime: 0.8,
  /** Rengas laskeutuu veteen näin kauas rantaviivasta (m). */
  boardOut: TUBE_RADIUS + 0.4,
  /** Maihin noustessa rengas jää rantaviivasta maalle tähän (m) ja kalastaja tähän. */
  tubeInland: 0.9,
  anglerInland: 2,
  /** Kantaessa kunto palautuu tällä kertoimella levosta. */
  carryRegen: 0.4,
} as const;

/** Mitä rantautuminen tarvitsee vesialueesta (WaterBody). */
export interface ShoreWater {
  isWater(p: Vec2): boolean;
  isLand(p: Vec2): boolean;
  closestShorePoint(p: Vec2, maxDistance?: number): { point: Vec2; distance: number } | null;
  resolveCircle(p: Vec2, radius: number): { position: Vec2; normal: Vec2 } | null;
  /** Laiturin kansi (#475): maata kävellä, mutta ei maapohjaa. */
  onPier?(p: Vec2): boolean;
}

/** Maapohjaa: maata eikä laiturin kantta (täyttökisan rivi ja rantaan nostettu vene). */
export function ground(water: ShoreWater, p: Vec2): boolean {
  return water.isLand(p) && !water.onPier?.(p);
}

/** Voiko kalastaja seistä pisteessä: maata ja enintään kaistan päässä rantaviivasta. */
export function canStand(water: ShoreWater, p: Vec2): boolean {
  if (!water.isLand(p)) return false;
  const c = water.closestShorePoint(p, SHORE.band + 1);
  return c !== null && c.distance <= SHORE.band;
}

/** Rantapiste ja suunta vedestä maalle, kun rengas on rannassa kiinni; null = ei rantaa. */
function shoreContact(
  water: ShoreWater,
  p: Vec2,
  reach: number,
): { point: Vec2; inland: Vec2 } | null {
  const c = water.closestShorePoint(p, reach);
  if (!c || c.distance < 1e-6) return null;
  return {
    point: c.point,
    inland: { x: (c.point.x - p.x) / c.distance, y: (c.point.y - p.y) / c.distance },
  };
}

/**
 * Maihin nousun askel vedessä: selkä edellä rantaa vasten potkiminen
 * kerryttää `landing`-aikaa, ja täynnä kalastaja nousee maihin. Rengas jää
 * rantaan ja kalastaja seisoo sen takana katse järvelle. Palauttaa tilan
 * ennallaan, jos maihin ei voi nousta (liian kapea niemi).
 */
export function stepLanding(
  t: TubeState,
  input: TubeInput,
  water: ShoreWater,
  dt: number,
): TubeState {
  const backing = input.kick > 0 && !t.anchor;
  const contact = backing ? shoreContact(water, t.pos, TUBE_RADIUS + SHORE.landReach) : null;
  // Selkä on katseen vastakkaisella puolella: sen pitää osoittaa rantaan.
  const aim = contact
    ? -Math.cos(t.heading) * contact.inland.x - Math.sin(t.heading) * contact.inland.y
    : 0;
  if (!contact || aim < SHORE.landAim) {
    if (t.landing === undefined) return t;
    const { landing: _, ...rest } = t;
    return rest;
  }
  const landing = (t.landing ?? 0) + dt;
  if (landing < SHORE.landTime) return { ...t, landing };
  const { point, inland } = contact;
  const at = (d: number) => ({ x: point.x + inland.x * d, y: point.y + inland.y * d });
  const angler = [SHORE.anglerInland, 1.5, 1.1].map(at).find((p) => canStand(water, p));
  const tube = at(SHORE.tubeInland);
  if (!angler || !water.isLand(tube)) return { ...t, landing: SHORE.landTime };
  const { landing: _, anchor: __, ...rest } = t;
  return {
    ...rest,
    pos: angler,
    vel: { x: 0, y: 0 },
    angVel: 0,
    kickPhase: 0,
    shore: { tube, tubeHeading: t.heading, carrying: false, settle: true },
  };
}

/**
 * Askel maalla: kävely ja kääntyminen samoilla liiketoiminnoilla kuin
 * potkiminen (W eteen, S taakse, A/D kääntyy), sekä pääkonteksti
 * (`input.main`): renkaan otto, lasku maahan ja vesirajassa kyytiin hyppy.
 * Kalastaja pysyy kaistalla: este liu'uttaa seinän suuntaisesti.
 */
export function stepShore(
  t: TubeState,
  input: TubeInput,
  water: ShoreWater,
  dt: number,
): TubeState {
  const shore = t.shore!;
  if (shore.board !== undefined) {
    const board = shore.board + dt / SHORE.boardTime;
    if (board < 1) return { ...t, shore: { ...shore, board } };
    // Kalastaja istuu renkaassa vedessä: tavallinen rengas jatkaa tästä.
    const { shore: _, ...rest } = t;
    return {
      ...rest,
      pos: { ...shore.tube },
      vel: { x: 0, y: 0 },
      heading: shore.tubeHeading,
      angVel: 0,
      kickPhase: 0,
    };
  }
  if (shore.inflate) {
    // Pumpatessa seistään paikallaan: liikenäppäimet ovat letkun nuolia.
    const r = stepInflate(shore.inflate, input, t.stamina, dt);
    const { inflate: _, ...ready } = shore;
    return {
      ...t,
      vel: { x: 0, y: 0 },
      angVel: 0,
      kickPhase: 0,
      stamina: r.stamina,
      shore: inflated(r.state) ? ready : { ...shore, inflate: r.state },
    };
  }
  const settling = !!shore.settle && input.kick !== 0;
  const turn = Math.max(-1, Math.min(1, input.turn));
  const angVel = turn * SHORE.turnRate;
  const heading = wrapAngle(t.heading + angVel * dt);
  // W (kick -1) eteenpäin katseen suuntaan, S (kick 1) takaperin hitaammin.
  const kick = settling ? 0 : Math.max(-1, Math.min(1, input.kick));
  const speed =
    -kick *
    (shore.carrying ? SHORE.carrySpeed : SHORE.walkSpeed) *
    (kick > 0 ? SHORE.backFactor : 1);
  const step = { x: Math.cos(heading) * speed * dt, y: Math.sin(heading) * speed * dt };
  let pos = t.pos;
  if (speed !== 0) {
    const tries = [step, { x: step.x, y: 0 }, { x: 0, y: step.y }];
    for (const d of tries) {
      const p = { x: t.pos.x + d.x, y: t.pos.y + d.y };
      if ((d.x !== 0 || d.y !== 0) && canStand(water, p)) {
        pos = p;
        break;
      }
    }
  }
  const moved = Math.hypot(pos.x - t.pos.x, pos.y - t.pos.y);
  const kickPhase = moved > 0 ? (t.kickPhase + moved / SHORE.stride) % 1 : 0;
  const regen = STAMINA.restRegen * (shore.carrying ? SHORE.carryRegen : 1);
  const stamina = Math.min(1, t.stamina + regen * dt);
  let next: ShoreState = shore;
  if (shore.settle && !settling) {
    const { settle: _, ...rest } = shore;
    next = rest;
  }
  if (next.carrying) next = { ...next, tube: { ...pos }, tubeHeading: heading };
  if (input.main) next = shoreAction(next, pos, heading, water);
  return {
    ...t,
    pos,
    vel: { x: (pos.x - t.pos.x) / dt, y: (pos.y - t.pos.y) / dt },
    heading,
    angVel,
    kickPhase,
    stamina,
    shore: next,
  };
}

/** Mitä pääkonteksti tekisi nyt maalla (napin teksti ja ohje). */
export type ShoreAction = 'pump' | 'pickUp' | 'putDown' | 'board' | null;

/** Pääkontekstin toiminto maalla nykyisessä paikassa. */
export function shoreActionAt(t: TubeState, water: ShoreWater): ShoreAction {
  const s = t.shore;
  if (!s || s.board !== undefined) return null;
  if (s.inflate) return s.inflate.moving === null ? 'pump' : null;
  if (!s.carrying)
    return Math.hypot(s.tube.x - t.pos.x, s.tube.y - t.pos.y) <= SHORE.reach ? 'pickUp' : null;
  return boardingSpot(t.pos, water) ? 'board' : 'putDown';
}

/** Paikka vedessä, johon rengas lasketaan kyytiin hypätessä; null = ei vesirajassa. */
function boardingSpot(p: Vec2, water: ShoreWater): { pos: Vec2; heading: number } | null {
  const c = water.closestShorePoint(p, SHORE.waterline);
  if (!c || c.distance < 1e-6) return null;
  const out = { x: (c.point.x - p.x) / c.distance, y: (c.point.y - p.y) / c.distance };
  const guess = { x: c.point.x + out.x * SHORE.boardOut, y: c.point.y + out.y * SHORE.boardOut };
  const fix = water.resolveCircle(guess, TUBE_RADIUS);
  const pos = fix ? fix.position : guess;
  if (!water.isWater(pos) || water.resolveCircle(pos, TUBE_RADIUS * 0.9)) return null;
  // Kyytiin mennään takaperin: katse jää rantaan, ja tavallinen potku vie ulos.
  return { pos, heading: Math.atan2(-out.y, -out.x) };
}

function shoreAction(s: ShoreState, pos: Vec2, heading: number, water: ShoreWater): ShoreState {
  if (!s.carrying) {
    const near = Math.hypot(s.tube.x - pos.x, s.tube.y - pos.y) <= SHORE.reach;
    return near ? { tube: { ...pos }, tubeHeading: heading, carrying: true } : s;
  }
  const spot = boardingSpot(pos, water);
  if (spot) return { tube: spot.pos, tubeHeading: spot.heading, carrying: false, board: 0 };
  // Rengas maahan eteen, jos siinä on maata; muuten jalkoihin.
  const ahead = { x: pos.x + Math.cos(heading) * 0.9, y: pos.y + Math.sin(heading) * 0.9 };
  return { tube: water.isLand(ahead) ? ahead : { ...pos }, tubeHeading: heading, carrying: false };
}

/** Kalastaja on maalla (myös kyytiin hypätessä). */
export const isAshore = (t: TubeState): boolean =>
  t.shore !== undefined || t.launch !== undefined || t.bailer !== undefined;

/** Verkon kentät maalla ololle (PlayerState.shore…): 0 = vedessä. */
export interface ShoreNet {
  /** 0 vedessä, 1 maalla, 2 kantaa, 3 hyppää kyytiin; +4 = odottaa potkun irrotusta. */
  shore: number;
  shoreX: number;
  shoreY: number;
  shoreHeading: number;
  shoreBoard: number;
  /** Maihin potkittu aika (s); 0 = ei. */
  landing: number;
  /** Täyttökisa (#458): 0 = ei täytettävää, muuten letkun ponttooni + 1. */
  inflate: number;
  /** Letkun siirto: osuttuja nuolia + 1; 0 = letku kiinni. */
  inflateMove: number;
  fill0: number;
  fill1: number;
  fill2: number;
  pumpHandle: number;
  pumpArrow: number;
  inflateSeed: number;
}

export function shoreToNet(t: TubeState): ShoreNet {
  const s = t.shore;
  const f = s?.inflate;
  return {
    shore: !s ? 0 : (s.board !== undefined ? 3 : s.carrying ? 2 : 1) + (s.settle ? 4 : 0),
    shoreX: s?.tube.x ?? 0,
    shoreY: s?.tube.y ?? 0,
    shoreHeading: s?.tubeHeading ?? 0,
    shoreBoard: s?.board ?? 0,
    landing: t.landing ?? 0,
    inflate: f ? f.valve + 1 : 0,
    inflateMove: f && f.moving !== null ? f.moving + 1 : 0,
    fill0: f?.fill[0] ?? 0,
    fill1: f?.fill[1] ?? 0,
    fill2: f?.fill[2] ?? 0,
    pumpHandle: f?.handle ?? 0,
    pumpArrow: f?.arrow ?? 0,
    inflateSeed: f?.seed ?? 0,
  };
}

/** Maalla olon ja maihin potkimisen kentät verkon tilasta TubeStateen. */
export function shoreFromNet(p: Partial<ShoreNet>): Pick<TubeState, 'shore' | 'landing'> {
  const kind = (p.shore ?? 0) & 3;
  const out: Pick<TubeState, 'shore' | 'landing'> = {};
  if (p.landing) out.landing = p.landing;
  if (kind === 0) return out;
  out.shore = {
    tube: { x: p.shoreX ?? 0, y: p.shoreY ?? 0 },
    tubeHeading: p.shoreHeading ?? 0,
    carrying: kind === 2,
    ...(kind === 3 && { board: p.shoreBoard ?? 0 }),
    ...(((p.shore ?? 0) & 4) !== 0 && { settle: true }),
    ...(p.inflate && {
      inflate: {
        fill: [p.fill0 ?? 0, p.fill1 ?? 0, p.fill2 ?? 0],
        valve: p.inflate - 1,
        moving: p.inflateMove ? p.inflateMove - 1 : null,
        handle: p.pumpHandle ?? 0,
        arrow: p.pumpArrow ?? 0,
        seed: p.inflateSeed ?? 0,
      },
    }),
  };
  return out;
}

/** Täyttökisan rivi (#458): kalastajat 4 m välein rannan suuntaisesti. */
export const INFLATE_ROW = {
  spacing: 4,
  /** Kalastaja ja tyhjä rengas maalla rantaviivasta (m). */
  angler: 2.6,
  tube: 1.2,
} as const;

/**
 * Täyttökisan aloituspaikat: rivi lähimmälle rannalle pisteestä `near`
 * (vedessä tai rannalla). Rivi seuraa rantaviivaa; paikat, joihin ei mahdu
 * (laituri, kapea niemi), ohitetaan. Kalastaja katsoo järvelle, ja tyhjä
 * rengas on hänen edessään.
 */
export function inflateRow(
  water: ShoreWater,
  near: Vec2,
  count: number,
  seed: number,
): TubeState[] {
  const base = water.closestShorePoint(near);
  if (!base) return [];
  const inlandAt = (p: Vec2, c: { point: Vec2; distance: number }): Vec2 | null => {
    if (c.distance < 1e-6) return null;
    const k = water.isWater(p) ? 1 : -1;
    return { x: ((c.point.x - p.x) * k) / c.distance, y: ((c.point.y - p.y) * k) / c.distance };
  };
  const n0 = inlandAt(near, base) ?? { x: 1, y: 0 };
  const along = { x: -n0.y, y: n0.x };
  const out: TubeState[] = [];
  for (let k = 0; out.length < count && k < count * 6; k++) {
    // Keskeltä vuorotellen molempiin suuntiin.
    const step = k === 0 ? 0 : (k % 2 === 1 ? 1 : -1) * Math.ceil(k / 2);
    const p = {
      x: base.point.x + along.x * step * INFLATE_ROW.spacing - n0.x,
      y: base.point.y + along.y * step * INFLATE_ROW.spacing - n0.y,
    };
    const c = water.closestShorePoint(p);
    if (!c) continue;
    const inland = inlandAt(p, c) ?? n0;
    const at = (d: number) => ({ x: c.point.x + inland.x * d, y: c.point.y + inland.y * d });
    const angler = at(INFLATE_ROW.angler);
    const tube = at(INFLATE_ROW.tube);
    // Laituri on maata kävellä (#475), mutta rivi ja rengas vaativat maapohjan.
    if (!canStand(water, angler) || !ground(water, angler) || !ground(water, tube)) continue;
    const far = out.every(
      (o) => Math.hypot(o.pos.x - angler.x, o.pos.y - angler.y) >= INFLATE_ROW.spacing * 0.8,
    );
    if (!far) continue;
    const heading = Math.atan2(-inland.y, -inland.x);
    out.push({
      pos: angler,
      vel: { x: 0, y: 0 },
      heading,
      angVel: 0,
      kickPhase: 0,
      stamina: 1,
      shore: { tube, tubeHeading: heading, carrying: false, inflate: createInflate(seed) },
    });
  }
  return out;
}
