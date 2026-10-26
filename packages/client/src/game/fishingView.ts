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
  type FishingState,
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
} from './lineHang';
import { lureColor } from './lureColor';

const SPLASH_TIME = 0.6;
/** Siiman piirtokorkeus pinnalla. */
const SURFACE_Y = 0.04;
/** Siiman kärkivälit: ilmassa roikkuva osuus ja pinnalla lepäävät pisteet. */
const LINE_VERTS = AIR_SAMPLES + LINE_POINTS;

/** Heittoviiva, osumakohta, viehe, siima ja roiskeet. */
export class FishingView {
  readonly group = new THREE.Group();
  /** Kalastajan silmin -näkymä. */
  pov = false;
  /** Pelaajan valitsema siiman väri. */
  lineColor = 0xc3cbd2;
  private readonly aimLine: THREE.Line;
  private readonly aimMarker: THREE.Mesh;
  private readonly lure: THREE.Mesh;
  private readonly lureShadow: THREE.Mesh;
  private readonly line: THREE.Line;
  private readonly splash: THREE.Mesh;
  private readonly fishShadow: THREE.Mesh;
  private splashAge = Infinity;
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

    this.lure = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.5, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xf08a2c }),
    );
    this.group.add(this.lure);

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

    this.splash = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 1, 12),
      new THREE.MeshBasicMaterial({ color: 0xeef2f3, transparent: true }),
    );
    this.splash.rotation.x = -Math.PI / 2;
    this.group.add(this.splash);

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
  }

  /** Siiman näkyvä väri (katkeamisvaroitus mukaan lukien). */
  get shownLineColor(): number {
    // Siiman materiaali päivittyy vasta heitossa: sitä ennen näytetään valittu väri.
    return this.line.visible
      ? (this.line.material as THREE.LineBasicMaterial).color.getHex()
      : this.lineColor;
  }

  startSplash(at: Vec2): void {
    this.splash.position.copy(toWorld(at, 0.05));
    this.splashAge = 0;
  }

  update(
    s: FishingState,
    ctx: FishingContext,
    aim: Vec2,
    dt: number,
    hooked: Fish | null = null,
  ): void {
    this.fishShadow.visible = !!hooked && hooked.depth < 1.6;
    if (hooked) {
      const len = Math.cbrt(hooked.weight / 0.012) / 10; // ahvenen pituus (m) painosta
      this.fishShadow.scale.setScalar(len / 1.1);
      this.fishShadow.position.copy(toWorld(hooked.pos, 0.02));
      this.fishShadow.rotation.z = hooked.heading;
    }
    const tip = rodTip(ctx.tubePos, ctx.heading);
    // Piirretty kärki on oikeassa kädessä pidetyn vavan päässä.
    const side = rodSideOffset(ctx.heading);
    const shownTip = { x: tip.x + side.x, y: tip.y + side.y };

    // Tähtäys näkyy aina, kun vapa on valmiina; latauksessa osumakohta seuraa voimaa.
    // Kalastajan silmin tähtäimenä on hiiri; osumakohta näkyy vasta latauksessa.
    const aiming = this.pov ? s.stage === 'charging' : s.stage === 'idle' || s.stage === 'charging';
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
      setLine(this.aimLine, toWorld(shownTip, ROD_TIP_Y), toWorld(target, 0.05));
      this.aimLine.computeLineDistances();
      this.aimMarker.position.copy(toWorld(target, 0.04));
      const mat = this.aimMarker.material as THREE.MeshBasicMaterial;
      mat.color.setHex(s.stage === 'charging' ? 0xf6d04d : 0xfff3b0);
    }

    const out = s.stage === 'flight' || s.stage === 'water';
    this.lure.visible = out;
    this.line.visible = out;
    this.lureShadow.visible = s.stage === 'flight';
    if (out) {
      const height = s.flight?.height ?? 0;
      // Ylhäältä katsottuna korkeus näkyy siirtymänä pohjoiseen varjosta.
      this.lure.position.copy(
        this.pov
          ? toWorld(s.lure, 0.15 + height)
          : toWorld({ x: s.lure.x, y: s.lure.y + height * 0.35 }, 0.3),
      );
      this.lureShadow.position.copy(toWorld(s.lure, 0.03));
      (this.lure.material as THREE.MeshBasicMaterial).color.setHex(lureColor(s.depth, s.onLand));
      this.lure.scale.setScalar(1 + height * 0.08);
      // Siima roikkuu vavan kärjestä kaarena veteen ja jatkaa pinnalla fysiikan muotoa.
      this.taut += (tautness(s.tension) - this.taut) * Math.min(1, dt * 4);
      const pts =
        s.stage === 'flight'
          ? flightLine(
              { x: shownTip.x, y: shownTip.y, h: ROD_TIP_Y },
              { x: this.lure.position.x, y: -this.lure.position.z, h: this.lure.position.y },
              LINE_VERTS,
              SURFACE_Y,
            )
          : hangLine(s.line.points, ROD_TIP_Y, this.taut, SURFACE_Y, side);
      const pos = this.line.geometry.getAttribute('position') as THREE.BufferAttribute;
      writeLine(pos, pts);
      pos.needsUpdate = true;
      this.line.geometry.computeBoundingSphere();
      (this.line.material as THREE.LineBasicMaterial).color.setHex(
        s.tension > s.drag * 0.95 ? lineWarning(this.lineColor) : this.lineColor,
      );
    }

    this.splashAge += dt;
    this.splash.visible = this.splashAge < SPLASH_TIME;
    if (this.splash.visible) {
      const t = this.splashAge / SPLASH_TIME;
      this.splash.scale.setScalar(0.4 + t * 1.6);
      (this.splash.material as THREE.MeshBasicMaterial).opacity = 1 - t;
    }
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
