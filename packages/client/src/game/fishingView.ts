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

const SPLASH_TIME = 0.6;

/** Heittoviiva, osumakohta, viehe, siima ja roiskeet. */
export class FishingView {
  readonly group = new THREE.Group();
  /** Kalastajan silmin -näkymä. */
  pov = false;
  private readonly aimLine: THREE.Line;
  private readonly aimMarker: THREE.Mesh;
  private readonly lure: THREE.Mesh;
  private readonly lureShadow: THREE.Mesh;
  private readonly line: THREE.Line;
  private readonly splash: THREE.Mesh;
  private readonly fishShadow: THREE.Mesh;
  private splashAge = Infinity;

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
        Array.from({ length: LINE_POINTS + 1 }, () => new THREE.Vector3()),
      ),
      new THREE.LineBasicMaterial({ color: 0xc3cbd2 }),
    );
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
      setLine(this.aimLine, toWorld(tip, 1.2), toWorld(target, 0.05));
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
      const depthFade = Math.min(1, s.depth / 2);
      (this.lure.material as THREE.MeshBasicMaterial).color.setHex(
        s.onLand ? 0xf08a2c : depthFade > 0.6 ? 0x6b2d6e : depthFade > 0.1 ? 0xc05bb4 : 0xf08a2c,
      );
      this.lure.scale.setScalar(1 + height * 0.08);
      // Ensimmäinen piste on vavan kärjessä ilmassa, loput siimasta lepää pinnalla.
      const pos = this.line.geometry.getAttribute('position') as THREE.BufferAttribute;
      const top = toWorld(tip, 1.2);
      pos.setXYZ(0, top.x, top.y, top.z);
      if (s.stage === 'flight') {
        for (let i = 1; i <= LINE_POINTS; i++) {
          const t = i / LINE_POINTS;
          pos.setXYZ(
            i,
            top.x + (this.lure.position.x - top.x) * t,
            0.25,
            top.z + (this.lure.position.z - top.z) * t,
          );
        }
      } else {
        s.line.points.forEach((p, i) => pos.setXYZ(i + 1, p.x, 0.04, -p.y));
      }
      pos.needsUpdate = true;
      this.line.geometry.computeBoundingSphere();
      (this.line.material as THREE.LineBasicMaterial).color.setHex(
        s.tension > s.drag * 0.95 ? 0xf6d04d : s.tension > 0.3 ? 0xeef2f3 : 0x8e99a4,
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
