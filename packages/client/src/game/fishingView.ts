import * as THREE from 'three';
import {
  LINE_POINTS,
  castAngle,
  chargePower,
  predictLanding,
  rodTip,
  tackleCastFactor,
  type Fish,
  type FishingContext,
  type FishingEvents,
  type Difficulty,
  type FishingState,
  type SpeciesId,
  type Vec2,
} from '@lunki/shared';
import { toWorld } from '../world/lakeMesh';
import {
  AIR_SAMPLES,
  ROD_TIP_Y,
  flightLine,
  hangLine,
  rodSideOffset,
  tautness,
  writeLine,
  type LinePoint,
} from './lineHang';
import { lureLook } from './lureColor';
import { FLY_LINE_POINTS, flyLinePose, flyLineProfile, flyLineWorld } from './flyLine';
import { flyRodTip } from './povRod';
import { SplashRings } from './splashRings';
import { LandingView } from './landingView';
import { ROD_MOTION, strikeTaut, strikeTug, strikeTugs } from './rodMotion';
import { LURE_MARKER, LureMarker, markerPosition } from './lureMarker';

/** Vieheen merkkien tahti (s), pohjakosketuksen raja (m) ja pohjan pölläys. */
const LURE_SIGNS = { followEvery: 0.8, bottomEvery: 0.7, touch: 0.05, mud: 0x8a6a42 } as const;

/**
 * Tärppi näkyy vieheen merkissä ilman luotainta: merkki nykii siiman
 * nykäysten tahdissa poispäin kalastajasta (silmin painuu pinnan alle), ja
 * jokainen nykäys nostaa renkaan. Ylhäältä koot ovat kuvapisteinä, jotta ne
 * näkyvät kaikilla zoomeilla.
 */
const STRIKE_SIGNS = { jerkPx: 3, ringPx: 11, ringM: 0.8, time: 0.55, bigRing: 1.25 } as const;

/** Siiman piirtokorkeus pinnalla. */
const SURFACE_Y = 0.04;
/** Siiman kärkivälit: ilmassa roikkuva osuus ja pinnalla lepäävät pisteet. */
const LINE_VERTS = AIR_SAMPLES + LINE_POINTS;

/** Heittoviiva, osumakohta, viehe, siima ja roiskeet. */
export class FishingView {
  readonly group = new THREE.Group();
  /** Kalastajan silmin -näkymä. */
  pov = false;
  /** Ylhäältä-näkymän mittakaava (m kuvapisteelle). */
  metersPerPixel = 0.125;
  /** Silmin kuvapisteen koko metreinä metrin päässä (`PovCamera.pixelSize`). */
  povPixel = 0.005;
  /** Kalastaja on maissa (#457): maalta ei heitetä, joten tähtäystä ei näytetä. */
  ashore = false;
  /** Kalastuksen vaikeustaso: vieheen pyörteet (#391). */
  difficulty: Difficulty = 'normal';
  /** Pelaajan valitsema siiman väri. */
  lineColor = 0xc3cbd2;
  private readonly aimLine: THREE.Line;
  private readonly aimMarker: THREE.Mesh;
  /** Vieheen merkki (#391). */
  readonly marker = new LureMarker();
  private readonly lureShadow: THREE.Mesh;
  private readonly line: THREE.Line;
  /** Perhosiima ja perho ilmassa heiton aikana (#236). */
  private readonly flyLine: THREE.Line;
  private readonly fly: THREE.Mesh;
  private readonly splash = new SplashRings();
  /** Vieheen merkit: seuraava kala, pohjakosketus ja tärpin pyörre. */
  private readonly lureSigns = new SplashRings(5);
  private followTimer = 0;
  private bottomTimer = 0;
  /** Tärpin nykäykset, joista on jo noussut rengas. */
  private strikeRings = 0;
  /** Viehettä seuraavan kalan paikka (pyörteet vieheen takana), null = ei seuraajaa. */
  follower: Vec2 | null = null;
  private readonly fishShadow: THREE.Mesh;
  /** Väsynyt kala pinnassa ja nosto kyytiin (#366). */
  private readonly landing = new LandingView();
  private readonly flyPoints: LinePoint[] = [];
  /** Siiman kireys tasoitettuna, ettei roikkuma hypi jännityksen mukana. */
  private taut = 0;

  constructor() {
    this.aimLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineDashedMaterial({ color: 0xfff3b0, dashSize: 1, gapSize: 0.8 }),
    );
    this.group.add(this.aimLine);

    this.aimMarker = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.8, 8),
      new THREE.MeshBasicMaterial({ color: 0xfff3b0 }),
    );
    this.aimMarker.rotation.x = -Math.PI / 2;
    this.group.add(this.aimMarker);

    this.group.add(this.marker.group);

    this.lureShadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.15, 6),
      new THREE.MeshBasicMaterial({ color: 0x123a5c }),
    );
    this.lureShadow.rotation.x = -Math.PI / 2;
    this.group.add(this.lureShadow);

    this.line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(
        Array.from({ length: LINE_VERTS }, () => new THREE.Vector3()),
      ),
      new THREE.LineBasicMaterial({ color: 0xc3cbd2 }),
    );
    this.line.visible = false;
    this.group.add(this.line);

    this.flyLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(
        Array.from({ length: FLY_LINE_POINTS }, () => new THREE.Vector3()),
      ),
      new THREE.LineBasicMaterial({ color: 0xc3cbd2 }),
    );
    this.flyLine.visible = false;
    this.group.add(this.flyLine);
    this.fly = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 0.25, 0.25),
      new THREE.MeshBasicMaterial({ color: 0xf08a2c }),
    );
    this.fly.visible = false;
    this.group.add(this.fly);

    this.group.add(this.splash.group, this.lureSigns.group);

    // Pinnan lähellä väsytettävä kala näkyy tummana varjona.
    const shape = new THREE.Shape();
    shape.ellipse(0, 0, 0.5, 0.15, 0, Math.PI * 2, false, 0);
    shape.moveTo(-0.45, 0);
    shape.lineTo(-0.75, 0.18);
    shape.lineTo(-0.75, -0.18);
    this.fishShadow = new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      new THREE.MeshBasicMaterial({ color: 0x0d2238 }),
    );
    this.fishShadow.rotation.x = -Math.PI / 2;
    this.group.add(this.fishShadow);
    this.group.add(this.landing.group);
  }

  /** Siiman näkyvä väri (katkeamisvaroitus mukaan lukien). */
  get shownLineColor(): number {
    // Siiman materiaali päivittyy vasta heitossa: sitä ennen näytetään valittu väri.
    return this.line.visible
      ? (this.line.material as THREE.LineBasicMaterial).color.getHex()
      : this.lineColor;
  }

  /** Roiske osumakohtaan; `size` < 1 = perhon pieni roiske (#236). */
  startSplash(at: Vec2, size = 1): void {
    this.splash.start(at, size);
  }

  /** Kala nousi kyytiin: nostoanimaatio siimasta tai haavilla. */
  startLanding(
    landed: NonNullable<FishingEvents['landed']>,
    species: SpeciesId,
    weight: number,
  ): void {
    this.landing.start(landed, species, weight);
  }

  /** Perho ilmassa heiton aikana (muiden pelaajien tiedoksi), null = ei heittoa. */
  get flyInAir(): Vec2 | null {
    if (!this.flyLine.visible) return null;
    const p = this.flyPoints[this.flyPoints.length - 1];
    return p ? { x: p.x, y: p.y } : null;
  }

  update(
    s: FishingState,
    ctx: FishingContext,
    aim: Vec2,
    dt: number,
    hooked: Fish | null = null,
    rodEnd: LinePoint | null = null,
  ): void {
    // Nostovaiheessa kala näkyy kuvana pinnassa, ei varjona.
    this.fishShadow.visible = !!hooked && hooked.depth < 1.6 && !s.landing;
    if (hooked) {
      const len = Math.cbrt(hooked.weight / 0.012) / 10; // ahvenen pituus (m) painosta
      this.fishShadow.scale.setScalar(len / 1.1);
      this.fishShadow.position.copy(toWorld(hooked.pos, 0.02));
      this.fishShadow.rotation.z = hooked.heading;
    }
    const tip = rodTip(ctx.tubePos, ctx.heading);
    // Piirretty kärki on oikeassa kädessä pidetyn vavan päässä; vavan liike
    // (`rodEnd`, nosto ja taipuma) siirtää sitä, ja siima lähtee siitä.
    const side = rodSideOffset(ctx.heading);
    const shownTip = rodEnd
      ? { x: rodEnd.x, y: rodEnd.y }
      : { x: tip.x + side.x, y: tip.y + side.y };
    const tipY = rodEnd?.h ?? ROD_TIP_Y;
    const offset = { x: shownTip.x - tip.x, y: shownTip.y - tip.y };

    // Tähtäys näkyy aina, kun vapa on valmiina; latauksessa osumakohta seuraa voimaa.
    // Kalastajan silmin tähtäimenä on hiiri; osumakohta näkyy vasta latauksessa.
    const aiming =
      !this.ashore &&
      (this.pov ? s.stage === 'charging' : s.stage === 'idle' || s.stage === 'charging');
    this.aimLine.visible = aiming;
    this.aimMarker.visible = aiming;
    if (aiming) {
      const angle = castAngle(ctx, aim);
      const target =
        s.stage === 'charging'
          ? predictLanding(
              tip,
              angle,
              chargePower(s.charge),
              tackleCastFactor(s.tackle),
              1 / 60,
              ctx.wind,
            )
          : {
              x: tip.x + Math.cos(angle) * Math.hypot(aim.x - tip.x, aim.y - tip.y),
              y: tip.y + Math.sin(angle) * Math.hypot(aim.x - tip.x, aim.y - tip.y),
            };
      setLine(this.aimLine, toWorld(shownTip, tipY), toWorld(target, 0.05));
      this.aimLine.computeLineDistances();
      this.aimMarker.position.copy(toWorld(target, 0.04));
      const mat = this.aimMarker.material as THREE.MeshBasicMaterial;
      mat.color.setHex(s.stage === 'charging' ? 0xf6d04d : 0xfff3b0);
    }

    this.updateFlyLine(s, ctx, side);

    const out = s.stage === 'flight' || s.stage === 'water';
    this.line.visible = out;
    this.lureShadow.visible = s.stage === 'flight';
    if (!out || s.landing) this.marker.hide();
    if (out) {
      const height = s.flight?.height ?? 0;
      const lureAt = markerPosition(s.lure, height, this.pov);
      this.lureShadow.position.copy(toWorld(s.lure, 0.03));
      // Merkki kertoo vieheen tilan ilman luotainta: syvyys, pohja, rikka, tartunta.
      // Nostossa kala itse näkyy pinnassa, joten merkki piilotetaan.
      const bottom = ctx.depthAt(s.lure);
      const depth = s.stage === 'water' ? s.depth : 0;
      const strike = s.stage === 'water' && s.struckId !== null && s.hookedId === null;
      if (strike) this.strikeSigns(s);
      if (!s.landing)
        this.marker.update({
          at: s.lure,
          height,
          color: lureLook({
            depth,
            bottom,
            onLand: s.onLand,
            snag: s.snag !== null,
            fouled: s.fouled,
          }),
          pov: this.pov,
          pixel: this.pov ? this.povPixel : this.metersPerPixel,
          tug: strike ? this.strikeTugAt(s, shownTip) : undefined,
        });
      if (s.stage === 'water') this.updateLureSigns(s, bottom, dt);
      // Siima roikkuu vavan kärjestä kaarena veteen ja jatkaa pinnalla fysiikan muotoa.
      this.taut += (tautness(s.tension) - this.taut) * Math.min(1, dt * 4);
      // Tärppi: kala nykii viehettä, ja siima kiristyy ja löystyy nykäyksittäin.
      if (s.struckId !== null && s.hookedId === null) this.taut = strikeTaut(s.strikeAge);
      const pts =
        s.stage === 'flight'
          ? flightLine(
              { x: shownTip.x, y: shownTip.y, h: tipY },
              { x: lureAt.x, y: -lureAt.z, h: lureAt.y },
              LINE_VERTS,
              SURFACE_Y,
            )
          : hangLine(s.line.points, tipY, this.taut, SURFACE_Y, offset);
      const pos = this.line.geometry.getAttribute('position') as THREE.BufferAttribute;
      writeLine(pos, pts);
      pos.needsUpdate = true;
      this.line.geometry.computeBoundingSphere();
      (this.line.material as THREE.LineBasicMaterial).color.setHex(
        s.tension > s.drag * 0.95 ? lineWarning(this.lineColor) : this.lineColor,
      );
    }

    this.landing.pov = this.pov;
    this.landing.metersPerPixel = this.metersPerPixel;
    this.landing.update(
      s.landing ? hooked : null,
      !!s.landing?.net,
      toWorld(shownTip, tipY),
      ctx.tubePos,
      ctx.heading,
    );
    this.splash.update(dt);
    this.lureSigns.update(dt);
  }

  /**
   * Tärppi alkaa: rengas vieheen kohdalla heti, myös Helpolla, jolla koukku
   * tarttuu samassa hetkessä. Ensimmäinen nykäys lasketaan tähän.
   */
  strikeSwirl(at: Vec2, big = false): void {
    this.strikeRings = 1;
    this.strikeRing(at, big);
  }

  private strikeRing(at: Vec2, big: boolean): void {
    const size = this.pov
      ? STRIKE_SIGNS.ringM
      : Math.max(STRIKE_SIGNS.ringM, STRIKE_SIGNS.ringPx * this.metersPerPixel);
    this.lureSigns.start(at, size * (big ? STRIKE_SIGNS.bigRing : 1), STRIKE_SIGNS.time);
  }

  /** Tärpin aikana jokainen nykäys nostaa renkaan vieheen kohdalle. */
  private strikeSigns(s: FishingState): void {
    const tugs = strikeTugs(s.strikeAge);
    if (tugs <= this.strikeRings) return;
    this.strikeRings = tugs;
    this.strikeRing(s.lure, s.strikeBig);
  }

  /** Merkin nykäys: raskaassa tärpissä syvempi, kuten vavan nyökkäys. */
  private strikeTugAt(s: FishingState, tip: Vec2): { px: number; dir: Vec2 } {
    const dx = s.lure.x - tip.x;
    const dy = s.lure.y - tip.y;
    const len = Math.hypot(dx, dy) || 1;
    const heavy = s.strikeBig ? ROD_MOTION.strikeBigNod : 1;
    return {
      px: STRIKE_SIGNS.jerkPx * heavy * strikeTug(s.strikeAge),
      dir: { x: dx / len, y: dy / len },
    };
  }

  /**
   * Seuraava kala nostaa pieniä pyörteitä vieheen taakse, ja pohjaa
   * hipova viehe pöllyttää ruskeaa rengasta.
   */
  private updateLureSigns(s: FishingState, bottom: number, dt: number): void {
    // Tärpin aikana näkyvät vain tärpin renkaat.
    const free =
      LURE_MARKER.signs[this.difficulty] &&
      s.hookedId === null &&
      s.struckId === null &&
      s.snag === null &&
      !s.onLand;
    this.followTimer -= dt;
    if (free && this.follower && this.followTimer <= 0) {
      this.followTimer = LURE_SIGNS.followEvery;
      this.lureSigns.start(this.follower, 0.7, 0.9);
    }
    this.bottomTimer -= dt;
    const touching = s.depth >= bottom - LURE_SIGNS.touch && s.lureSpeed > 0.05;
    if (free && touching && this.bottomTimer <= 0) {
      this.bottomTimer = LURE_SIGNS.bottomEvery;
      this.lureSigns.start(s.lure, 0.6, 0.7, LURE_SIGNS.mud);
    }
  }

  /** Perhoheitossa siima ilmassa silmukkana vavan kärjestä perhoon (#236). */
  private updateFlyLine(s: FishingState, ctx: FishingContext, side: Vec2): void {
    const c = s.stage === 'casting' ? s.flyCast : null;
    this.flyLine.visible = this.fly.visible = c !== null;
    if (!c) return;
    const pts = flyLineWorld(
      flyLineProfile(flyLinePose(c, flyRodTip(c.rod))),
      ctx.tubePos,
      ctx.heading,
      ctx.heading + c.aim,
      side,
      this.flyPoints,
    );
    const pos = this.flyLine.geometry.getAttribute('position') as THREE.BufferAttribute;
    writeLine(pos, pts);
    pos.needsUpdate = true;
    this.flyLine.geometry.computeBoundingSphere();
    (this.flyLine.material as THREE.LineBasicMaterial).color.setHex(this.lineColor);
    const end = pts[pts.length - 1]!;
    this.fly.position.set(end.x, end.h, -end.y);
    this.fly.scale.setScalar(this.pov ? 0.4 : 1);
  }
}

function setLine(line: THREE.Line, a: THREE.Vector3, b: THREE.Vector3) {
  const pos = line.geometry.getAttribute('position') as THREE.BufferAttribute;
  pos.setXYZ(0, a.x, a.y, a.z);
  pos.setXYZ(1, b.x, b.y, b.z);
  pos.needsUpdate = true;
  line.geometry.computeBoundingSphere();
}

/** Katkeamisvaroitus: keltainen, ellei siima ole jo valmiiksi keltainen. */
const lineWarning = (color: number) => (color === 0xfff3b0 ? 0xd23a2a : 0xf6d04d);
