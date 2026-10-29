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
import { strikeTaut } from './rodMotion';
import { lurePixels } from '../ui/lureArt';

// MALLI #391: vaihtoehdot vieheen merkiksi (?marker=1..4), ei yhdistetä.
const MOCK = Number(new URLSearchParams(location.search).get('marker') ?? '0');
function pixelTexture(width: number, height: number, data: number[]): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(width, height);
  data.forEach((c, i) => {
    if (c < 0) return;
    img.data[i * 4] = (c >> 16) & 0xff;
    img.data[i * 4 + 1] = (c >> 8) & 0xff;
    img.data[i * 4 + 2] = c & 0xff;
    img.data[i * 4 + 3] = 255;
  });
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const mockSprite = (tex: THREE.Texture) => {
  const sp = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, alphaTest: 0.5, sizeAttenuation: false }),
  );
  sp.visible = false;
  return sp;
};

/** Vieheen merkkien tahti (s), pohjakosketuksen raja (m) ja pohjan pölläys. */
const LURE_SIGNS = { followEvery: 0.8, bottomEvery: 0.7, touch: 0.05, mud: 0x8a6a42 } as const;

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
  /** Pelaajan valitsema siiman väri. */
  lineColor = 0xc3cbd2;
  private readonly aimLine: THREE.Line;
  private readonly aimMarker: THREE.Mesh;
  private readonly lure: THREE.Mesh;
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
  private mockLure: THREE.Sprite | null = null;
  private mockLureId = '';
  private readonly mockDiamond = mockSprite(
    pixelTexture(
      7,
      7,
      Array.from({ length: 49 }, (_, i) => {
        const x = (i % 7) - 3;
        const y = Math.floor(i / 7) - 3;
        const d = Math.abs(x) + Math.abs(y);
        return d <= 1 ? 0xffffff : d <= 2 ? 0xffffff : d === 3 ? 0x1c232b : -1;
      }),
    ),
  );
  private readonly mockDot = mockSprite(
    pixelTexture(3, 3, [-1, 0xe6f2ff, -1, 0xe6f2ff, 0xffffff, 0xe6f2ff, -1, 0xe6f2ff, -1]),
  );
  private readonly mockWake = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(Array.from({ length: 4 }, () => new THREE.Vector3())),
    new THREE.LineBasicMaterial({ color: 0xe6f2ff }),
  );
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
    this.group.add(this.mockDiamond, this.mockDot, this.mockWake);
    this.mockWake.visible = false;
    this.mockWake.frustumCulled = false;

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
      setLine(this.aimLine, toWorld(shownTip, tipY), toWorld(target, 0.05));
      this.aimLine.computeLineDistances();
      this.aimMarker.position.copy(toWorld(target, 0.04));
      const mat = this.aimMarker.material as THREE.MeshBasicMaterial;
      mat.color.setHex(s.stage === 'charging' ? 0xf6d04d : 0xfff3b0);
    }

    this.updateFlyLine(s, ctx, side);

    const out = s.stage === 'flight' || s.stage === 'water';
    // Nostossa kala itse näkyy pinnassa; vieheen merkki peittäisi sen POV:ssa.
    this.lure.visible = out && !s.landing;
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
      // Merkki kertoo vieheen tilan ilman luotainta: syvyys, pohja, rikka, tartunta.
      const bottom = ctx.depthAt(s.lure);
      const look = lureLook({
        depth: s.stage === 'water' ? s.depth : 0,
        bottom,
        onLand: s.onLand,
        snag: s.snag !== null,
        fouled: s.fouled,
      });
      (this.lure.material as THREE.MeshBasicMaterial).color.setHex(look.color);
      this.lure.scale.setScalar(look.scale * (1 + height * 0.08));
      if (s.stage === 'water') this.updateLureSigns(s, bottom, dt);
      // Siima roikkuu vavan kärjestä kaarena veteen ja jatkaa pinnalla fysiikan muotoa.
      this.taut += (tautness(s.tension) - this.taut) * Math.min(1, dt * 4);
      // Tärppi: kala nykii viehettä, ja siima kiristyy ja löystyy nykäyksittäin.
      if (s.struckId !== null && s.hookedId === null) this.taut = strikeTaut(s.strikeAge);
      const pts =
        s.stage === 'flight'
          ? flightLine(
              { x: shownTip.x, y: shownTip.y, h: tipY },
              { x: this.lure.position.x, y: -this.lure.position.z, h: this.lure.position.y },
              LINE_VERTS,
              SURFACE_Y,
            )
          : hangLine(s.line.points, tipY, this.taut, SURFACE_Y, offset);
      if (MOCK > 0) this.mock(s, pts, look.color, ctx.tubePos);
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

  private mock(s: FishingState, pts: LinePoint[], color: number, tube: Vec2): void {
    const pov = this.pov;
    this.lure.visible = false;
    const id = s.tackle.lure;
    if (!this.mockLure || this.mockLureId !== id) {
      const px = lurePixels(id, 0);
      if (this.mockLure) this.group.remove(this.mockLure);
      this.mockLure = mockSprite(pixelTexture(px.width, px.height, px.data));
      this.mockLureId = id;
      this.group.add(this.mockLure);
    }
    const sprite = this.mockLure;
    const at = toWorld(s.lure, pov ? 0.06 : 0.3);
    const near = Math.hypot(s.lure.x - tube.x, s.lure.y - tube.y) <= 6;
    const shallow = s.depth <= 0.6;
    // Pikselikoko ruudulla (sizeAttenuation false: korkeuden osuus).
    const px = (n: number) => (pov ? (n * 3) / 720 : n * this.metersPerPixel);
    for (const sp of [sprite, this.mockDiamond, this.mockDot])
      (sp.material as THREE.SpriteMaterial).sizeAttenuation = !pov;
    sprite.visible = MOCK === 3 || (MOCK === 1 && (!pov || shallow || near));
    sprite.position.copy(at);
    const k = MOCK === 3 ? 1 - 0.4 * Math.min(1, s.depth / 2.5) : 1;
    sprite.scale.set(px(16) * k, px(8) * k, 1);
    this.mockDiamond.visible = MOCK === 2 || (MOCK === 4 && !pov);
    this.mockDiamond.position.copy(at);
    this.mockDiamond.scale.set(px(7), px(7), 1);
    (this.mockDiamond.material as THREE.SpriteMaterial).color.setHex(color);
    // Siiman vesiraja: ensimmäinen piste pinnalla, ja vana poispäin kalastajasta.
    const entry = MOCK === 1 && pov ? pts[pts.length - 1] : undefined;
    this.mockDot.visible = this.mockWake.visible = entry !== undefined;
    if (!entry) return;
    this.mockDot.position.set(entry.x, SURFACE_Y + 0.02, -entry.y);
    this.mockDot.scale.set(px(3), px(3), 1);
    const away = Math.atan2(entry.y - tube.y, entry.x - tube.x);
    const pos = this.mockWake.geometry.getAttribute('position') as THREE.BufferAttribute;
    [-0.45, 0.45].forEach((a, i) => {
      pos.setXYZ(i * 2, entry.x, SURFACE_Y + 0.02, -entry.y);
      pos.setXYZ(
        i * 2 + 1,
        entry.x + Math.cos(away + a) * 1.0,
        SURFACE_Y + 0.02,
        -(entry.y + Math.sin(away + a) * 1.0),
      );
    });
    pos.needsUpdate = true;
  }

  /** Tärppi: pyörre vieheen kohdalla, kuin kala kääntyisi vieheen perässä. */
  strikeSwirl(at: Vec2): void {
    this.lureSigns.start(at, 0.8, 0.8);
    this.lureSigns.start(at, 0.45, 0.6);
  }

  /**
   * Seuraava kala nostaa pieniä pyörteitä vieheen taakse, ja pohjaa
   * hipova viehe pöllyttää ruskeaa rengasta.
   */
  private updateLureSigns(s: FishingState, bottom: number, dt: number): void {
    const free = s.hookedId === null && s.snag === null && !s.onLand;
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
