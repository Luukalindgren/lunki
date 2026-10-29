/**
 * Perhoheitto (#235): vapaa heilutetaan edestakaisin, ja siima kantaa
 * painottoman perhon. Puhtaat funktiot, jotta heiton voi testata ilman selainta.
 *
 * Vavan kulma `rod` on -1 (takaheiton pysäytys, kello 1) … +1 (eteenheiton
 * pysäytys, kello 10). Koko liikerata 2 vastaa noin 120°:ta. Jokainen liike
 * päättyy pysäytykseen, joka muodostaa siimaan silmukan. Silmukka aukeaa ajassa
 * siiman pituus / siiman nopeus, ja vasta kun siima on suorassa, saa vaihtaa
 * suuntaa. Siimakäsi (`grip`) pitää siimaa: liikkeen aikana auki oleva käsi
 * jättää vavan latautumatta, pysäytyksen jälkeen avattu käsi päästää siimaa
 * luistamaan ulos (valeheitoilla siimaa pidennetään, viimeisessä eteenheitossa
 * löysä ammutaan perään).
 */
export const FLY_CAST = {
  /** Liike alkaa, kun vavan nopeus ylittää tämän (liikerata/s), ja pysähtyy alle tämän. */
  moveStart: 0.8,
  moveStop: 0.35,
  /** Hidas liike näin kauan (s) on pysäytys; yksittäinen tyhjä askel ei vielä ole. */
  stopHold: 0.025,
  /** Samaan suuntaan näin pian (s) jatkuva liike on yhä sama liike. */
  resumeTime: 0.12,
  /** Ihannekaari (osuus liikeradasta) lyhyellä ja pitkällä siimalla (≈30° ja 80°). */
  arcShort: 0.5,
  arcLong: 1.35,
  lineShort: 5,
  lineLong: 18,
  /** Siiman nopeus (m/s) vavan huippunopeutta kohden. */
  speedPerRod: 4,
  maxLineSpeed: 32,
  /** Siima jaksaa aueta, kun sen nopeus on vähintään tämä siiman metriä kohden (1/s). */
  minSpeedPerLength: 0.9,
  /** Terävä pysäytys: huippunopeudesta pysähdykseen enintään tämä aika (s). */
  crispStop: 0.15,
  /** Siimakäden veto (haul) lisää siiman nopeutta. */
  haulBoost: 1.25,
  /** Näin vähän (s) ennen liikkeen alkua painettu veto lasketaan liikkeeseen (#398). */
  haulEarly: 0.15,
  /** Kesken liikkeen auki ollut siimakäsi: vapa ei lataudu. */
  looseGrip: 0.35,
  /** Siimaa luistaa silmukan auetessa tällä osuudella siiman nopeudesta. */
  slipShare: 0.35,
  /** Viimeisessä eteenheitossa ammuttu löysä lentää tällä osuudella nopeudesta. */
  shootShare: 0.8,
  /** Ilmassa oleva siima heiton alussa (vavan mitta ja peruke) ja enintään. */
  startAerial: 3,
  maxAerial: 22,
  /** Vedestä voi nostaa heittoon enintään näin pitkän siiman (m). */
  pickupMax: 10,
  /** Rullaheitto renkaasta: enintään (m). */
  rollMax: 12,
  /** Takana tarttuneen tai hattuun osuneen perhon irrotus (s). */
  untangleTime: 4,
  /** Tuulisolmu heikentää siimaa tähän osaan. */
  knotStrength: 0.6,
} as const;

/** Ajoitusikkunat ja avut (vaikeustason mukaan, ks. DIFFICULTIES). */
export interface FlyCastAssist {
  /** Suunnan vaihto ennen tätä silmukan aukeamisen osuutta läimäyttää piiskana. */
  early: number;
  /**
   * Siima putoaa, kun suunta ei vaihdu tämän osuuden (silmukan ajasta) kuluessa
   * suoristumisesta, kuitenkin aikaisintaan `lateMin` sekunnissa: lyhyellä
   * siimalla silmukka aukeaa niin nopeasti, ettei siihen ehtisi reagoida.
   */
  late: number;
  lateMin: number;
  /** HUD näyttää "nyt!"-merkin, kun siima on suorassa. */
  marker: boolean;
  /** Siima luistaa silmukan auetessa ilman siimakättä. */
  autoSlip: boolean;
  /** Läimäys katkaisee perhon, tuulisolmut ja perho omaan hattuun. */
  harsh: boolean;
  /** Virheet heikentävät heittoa. */
  errors: boolean;
}

export type FlyCastPhase = 'ready' | 'stroke' | 'loop';

export interface FlyCastState {
  phase: FlyCastPhase;
  /** Vavan kulma -1 (takana) … +1 (edessä). */
  rod: number;
  /** Nykyisen tai viimeisimmän liikkeen suunta: -1 taakse, +1 eteen. */
  dir: -1 | 1;
  /** Ilmassa oleva siima vavan kärjestä (m). */
  aerial: number;
  /** Siima on vedessä: eteenpäin liike on rullaheitto, taaksepäin nosto. */
  inWater: boolean;
  /** Heittosuunnan poikkeama katsesuunnasta (rad, ±30°). */
  aim: number;
  /** Liikkeen seuranta. */
  strokeStart: number;
  strokeTime: number;
  slowTime: number;
  peak: number;
  peakAt: number;
  gripLost: boolean;
  hauled: boolean;
  /** Ennen liikettä painettu veto odottaa liikkeen alkua (s jäljellä). */
  haulQueued: number;
  /** Silmukka: siiman nopeus (m/s), ikä ja aukeamisaika (s). */
  lineSpeed: number;
  loopAge: number;
  loopTime: number;
  /** Leveä silmukka (pitkä liike lyhyelle siimalle tai laimea pysäytys): tuuli vie. */
  wide: boolean;
  /** Suoristuminen on jo ilmoitettu. */
  straight: boolean;
  /** Liikkeitä tässä heitossa. */
  strokes: number;
  /** Perho kiinni takana tai hatussa: odotus ennen jatkoa (s). */
  busy: number;
}

export interface FlyCastInput {
  /** Vavan kulman muutos tällä askeleella (+ eteen, - taakse; koko liikerata = 2). */
  rod: number;
  /** Siimakäsi puristaa siimaa. */
  grip: boolean;
  /** Siimakäden veto (haul) tällä askeleella. */
  haul?: boolean;
  /** Heittosuunnan siirto (rad). */
  aim?: number;
}

export interface FlyCastEnv {
  assist: FlyCastAssist;
  /** Varusteiden kerroin siiman nopeudelle (vapa, siima, perhon koko). */
  power: number;
  /** Osuuko takaheitto (siiman mitta taakse) maahan, puihin tai kaislikkoon. */
  blockedBehind?(distance: number): boolean;
  /** Sivutuuli heittokäden puolelta (m/s, + = oikealta). */
  sideWind?: number;
  /** Satunnaisluku 0–1 (virheiden arvonta). */
  random(): number;
}

export interface FlyCastEvents {
  /** Siimakäden veto osui liikkeeseen (#398). */
  haul?: boolean;
  /** Pysäytys: suunta ja siiman nopeus. */
  stop?: { dir: -1 | 1; speed: number };
  /** Siima suoristui (nykäys): nyt pitää vaihtaa suuntaa. */
  straight?: -1 | 1;
  /** Suunnan vaihto liian aikaisin: piiskan läimäys. */
  crack?: boolean;
  /** Realistisella läimäys katkaisi perhon. */
  flyLost?: boolean;
  /** Takaheitto putosi veteen. */
  fell?: boolean;
  /** Liian heikko heitto luhistui. */
  collapsed?: boolean;
  /** Siimaa luisti ulos (m) tällä askeleella. */
  slipped?: number;
  /** Siima laskeutui eteen: matka vavan kärjestä (m), suunnan poikkeama, leveä silmukka. */
  landed?: { distance: number; aim: number; wide: boolean; roll: boolean };
  /** Takaheitto osui rantaan tai kaislikkoon: perho kiinni takana. */
  snagBehind?: boolean;
  /** Tuulisolmu (häntäsilmukka). */
  knot?: boolean;
  /** Kova sivutuuli vei perhon omaan hattuun. */
  hat?: boolean;
}

export function createFlyCast(aerial: number, inWater: boolean): FlyCastState {
  return {
    phase: 'ready',
    rod: inWater ? 0.3 : 0.6,
    dir: 1,
    aerial: Math.max(FLY_CAST.startAerial, Math.min(FLY_CAST.maxAerial, aerial)),
    inWater,
    aim: 0,
    strokeStart: 0,
    strokeTime: 0,
    slowTime: 0,
    peak: 0,
    peakAt: 0,
    gripLost: false,
    hauled: false,
    haulQueued: 0,
    lineSpeed: 0,
    loopAge: 0,
    loopTime: 0,
    wide: false,
    straight: false,
    strokes: 0,
    busy: 0,
  };
}

/** Ihannekaari siiman pituudelle: lyhyellä siimalla pieni liike, pitkällä laaja. */
export function idealArc(aerial: number): number {
  const k = Math.max(
    0,
    Math.min(1, (aerial - FLY_CAST.lineShort) / (FLY_CAST.lineLong - FLY_CAST.lineShort)),
  );
  return FLY_CAST.arcShort + (FLY_CAST.arcLong - FLY_CAST.arcShort) * k;
}

/** Silmukan aukeamisen osuus 0–1 (HUD:n ajoitusmittari). */
export const loopProgress = (c: FlyCastState) =>
  c.phase === 'loop' && c.loopTime > 0 ? Math.min(1, c.loopAge / c.loopTime) : 0;

/** Etenee yhden askeleen. Muokkaa tilaa paikallaan ja palauttaa tapahtumat. */
export function stepFlyCast(
  c: FlyCastState,
  input: FlyCastInput,
  env: FlyCastEnv,
  dt: number,
): FlyCastEvents {
  const ev: FlyCastEvents = {};
  if (c.busy > 0) {
    c.busy = Math.max(0, c.busy - dt);
    return ev;
  }
  c.aim = Math.max(-Math.PI / 6, Math.min(Math.PI / 6, c.aim + (input.aim ?? 0)));
  c.haulQueued = Math.max(0, c.haulQueued - dt);
  if (input.haul && c.phase !== 'stroke') c.haulQueued = FLY_CAST.haulEarly;
  const before = c.rod;
  c.rod = Math.max(-1, Math.min(1, c.rod + input.rod));
  const v = (c.rod - before) / dt;

  if (c.phase !== 'stroke' && Math.abs(v) >= FLY_CAST.moveStart) {
    const dir: -1 | 1 = v > 0 ? 1 : -1;
    // Heitto alkaa takaheitolla: eteenpäin heilautus valmiusasennosta vain siirtää vapaa.
    if (c.phase === 'ready' && !c.inWater && dir > 0) return ev;
    if (c.phase === 'loop' && dir === c.dir && c.loopAge < FLY_CAST.resumeTime) {
      // Hetken katkos samaan suuntaan (hiiren tapahtumat askelten välissä): sama liike jatkuu.
      c.phase = 'stroke';
      c.strokes--;
      c.strokeTime += c.loopAge;
      c.slowTime = 0;
    } else if (startStroke(c, dir, before, env, ev)) return ev;
  }

  if (c.phase === 'stroke') {
    c.strokeTime += dt;
    if (!input.grip) c.gripLost = true;
    if ((input.haul || c.haulQueued > 0) && !c.hauled) {
      c.hauled = true;
      c.haulQueued = 0;
      ev.haul = true;
    }
    const along = v * c.dir;
    // Lähes huippunopeus lasketaan huipuksi: tasainen liike pysähtyy terävästi.
    if (along >= c.peak * 0.98) {
      c.peakAt = c.strokeTime;
      c.peak = Math.max(c.peak, along);
    }
    // Pysäytys: liike hidastuu (tai vapa osuu ääriasentoon), tai suunta kääntyy.
    if (along < 0) stop(c, env, ev);
    else if (along < FLY_CAST.moveStop) {
      c.slowTime += dt;
      if (c.slowTime >= FLY_CAST.stopHold) stop(c, env, ev);
    } else c.slowTime = 0;
    return ev;
  }

  if (c.phase === 'loop') {
    c.loopAge += dt;
    const u = c.loopAge / c.loopTime;
    // Siimakäsi auki silmukan auetessa: siimaa luistaa ulos (eteen ammuttaessa enemmän).
    const open = !input.grip;
    if ((open || env.assist.autoSlip) && u < 1 && c.aerial < FLY_CAST.maxAerial) {
      const share = c.dir > 0 && open ? FLY_CAST.shootShare : FLY_CAST.slipShare;
      const out = Math.min(FLY_CAST.maxAerial - c.aerial, c.lineSpeed * share * dt);
      c.aerial += out;
      ev.slipped = out;
    }
    if (c.dir < 0 && u > 0.7 && env.blockedBehind?.(c.aerial)) {
      ev.snagBehind = true;
      reset(c);
      c.busy = FLY_CAST.untangleTime;
      return ev;
    }
    if (!c.straight && u >= 1) {
      c.straight = true;
      ev.straight = c.dir;
    }
    if (c.loopAge >= c.loopTime + Math.max(c.loopTime * env.assist.late, env.assist.lateMin)) {
      if (c.dir < 0) {
        // Renkaasta istutaan matalalla: myöhästynyt takaheitto osuu veteen.
        ev.fell = true;
        reset(c);
        c.inWater = true;
      } else land(c, ev, false);
    }
  }
  return ev;
}

/**
 * Uusi liike alkaa. Suunnan vaihto ennen kuin silmukka on auennut läimäyttää
 * siimaa kuin piiskaa; realistisella perho voi katketa (palauttaa true).
 */
function startStroke(
  c: FlyCastState,
  dir: -1 | 1,
  rod: number,
  env: FlyCastEnv,
  ev: FlyCastEvents,
): boolean {
  if (c.phase === 'loop' && dir !== c.dir && c.loopAge / c.loopTime < env.assist.early) {
    ev.crack = true;
    if (env.assist.harsh && env.random() < 0.5) {
      ev.flyLost = true;
      reset(c);
      return true;
    }
  }
  c.phase = 'stroke';
  c.dir = dir;
  c.strokeStart = rod;
  c.strokeTime = 0;
  c.slowTime = 0;
  c.peak = 0;
  c.peakAt = 0;
  // Läimäyksen jälkeen vapa ei lataudu kunnolla.
  c.gripLost = ev.crack === true;
  c.hauled = false;
  return false;
}

/** Liike pysähtyi: silmukka lähtee, ja sen nopeus kertoo liikkeen laadun. */
function stop(c: FlyCastState, env: FlyCastEnv, ev: FlyCastEvents): void {
  const arc = Math.abs(c.rod - c.strokeStart);
  const moveTime = Math.max(c.strokeTime - c.slowTime, 1e-3);
  const crisp = c.strokeTime - c.peakAt <= FLY_CAST.crispStop;
  let speed = c.peak * FLY_CAST.speedPerRod * env.power;
  if (c.gripLost) speed *= FLY_CAST.looseGrip;
  if (c.hauled) speed *= FLY_CAST.haulBoost;
  const ratio = arc / idealArc(c.aerial);
  // Liian lyhyt liike pitkälle siimalle ei jaksa; liian laaja tai laimea avaa silmukan.
  if (env.assist.errors && ratio < 0.6) speed *= ratio / 0.6;
  c.wide = ratio > 1.6 || !crisp;
  if (env.assist.errors && c.wide) speed *= 0.8;
  // Häntäsilmukka: koko kiihdytys äkkiä liikkeen lopussa.
  const tail = arc > 0.2 && c.peak > (arc / moveTime) * 2.5 && c.peakAt >= moveTime * 0.75;
  if (tail && env.assist.harsh) ev.knot = true;
  else if (tail && env.assist.errors) speed *= 0.85;
  speed = Math.min(FLY_CAST.maxLineSpeed, speed);
  c.lineSpeed = speed;
  c.strokes++;
  ev.stop = { dir: c.dir, speed };

  // Rullaheitto: siima vedessä ja liike eteenpäin.
  if (c.inWater && c.dir > 0) {
    const quality = Math.min(1, speed / (c.aerial * 1.5));
    c.aerial = Math.min(FLY_CAST.rollMax, c.aerial * (0.6 + 0.6 * quality));
    land(c, ev, true);
    return;
  }
  c.inWater = false;
  if (speed < c.aerial * FLY_CAST.minSpeedPerLength) {
    // Siima ei jaksa aueta: takana se putoaa veteen, edessä luhistuu kasaan.
    ev.collapsed = true;
    if (c.dir < 0) {
      ev.fell = true;
      reset(c);
      c.inWater = true;
    } else {
      c.aerial *= 0.5;
      land(c, ev, false);
    }
    return;
  }
  // Kova sivutuuli heittokäden puolelta ja hidas tai leveä silmukka: perho hattuun.
  if (
    env.assist.harsh &&
    c.dir > 0 &&
    (env.sideWind ?? 0) > 5 &&
    (c.wide || speed < 12) &&
    env.random() < 0.3
  ) {
    ev.hat = true;
    reset(c);
    c.busy = FLY_CAST.untangleTime;
    return;
  }
  c.phase = 'loop';
  c.loopAge = 0;
  c.loopTime = c.aerial / speed;
  c.straight = false;
}

function land(c: FlyCastState, ev: FlyCastEvents, roll: boolean): void {
  ev.landed = { distance: c.aerial, aim: c.aim, wide: c.wide, roll };
  reset(c);
}

function reset(c: FlyCastState): void {
  c.phase = 'ready';
  c.strokes = 0;
  c.lineSpeed = 0;
  c.loopAge = 0;
  c.inWater = false;
}
