import * as THREE from 'three';
import { CAST, REEL, type FishingState, type Vec2 } from '@lunki/shared';
import { toWorld } from '../world/lakeMesh';
import { ROD_TIP_Y } from './lineHang';

/** Vavan ja kelan värit paletista. */
const COLOR = {
  rod: 0xf6d04d,
  rodShade: 0x8a6a42,
  cork: 0xb99a68,
  corkShade: 0x5e432b,
  seat: 0x1c232b,
  body: 0x39424d,
  dark: 0x1c232b,
  rotor: 0x5f6b78,
  light: 0xc3cbd2,
  knob: 0xe0cf9c,
} as const;

/**
 * Vavan mitat (m). Kelan istukka on oikeassa kädessä vähän silmien alapuolella,
 * niin ylhäällä, ettei vieheluotaimen ruutu peitä kelaa.
 */
const ROD = {
  seatForward: 0.55,
  seatSide: 0.28,
  seatHeight: 0.38,
  /** Kahva istukasta taaksepäin ja etukahva eteenpäin. */
  butt: 0.38,
  seatLength: 0.035,
  foreGrip: 0.07,
  /** Siimanohjaimet: paikka vavan pituuden osuutena ja korkeus vavan alla (m). */
  guides: [
    [0.3, 0.045],
    [0.5, 0.022],
    [0.66, 0.015],
    [0.79, 0.011],
    [0.9, 0.008],
  ],
} as const;

/** Vavan pituus istukasta kärkeen lepoasennossa. */
const ROD_LENGTH = Math.hypot(CAST.rodReach - ROD.seatForward, ROD_TIP_Y - ROD.seatHeight);
/** Lepoasennon kulma vaakatasosta. */
const ROD_REST = Math.atan2(ROD_TIP_Y - ROD.seatHeight, CAST.rodReach - ROD.seatForward);
/** Takaheiton pysäytys (vapa hieman pystyn yli, kello 1). */
const ROD_BACK = THREE.MathUtils.degToRad(115);

/**
 * Perhoheitossa (#235) vavan kulma -1 (taakse) … +1 (eteen): kärjen
 * etäisyys renkaan keskeltä eteenpäin ja korkeus. +1 on lepoasento.
 */
export function flyRodTip(rod: number): { forward: number; height: number } {
  const k = (1 - Math.max(-1, Math.min(1, rod))) / 2;
  const angle = ROD_REST + (ROD_BACK - ROD_REST) * k;
  return {
    forward: ROD.seatForward + Math.cos(angle) * ROD_LENGTH,
    height: ROD.seatHeight + Math.sin(angle) * ROD_LENGTH,
  };
}

/** Kelan osien paikat kelan omassa kehyksessä: x = vapaa pitkin eteen, y = ylös, z = oikealle. */
const SPOOL = { x: 0.04, y: -0.05, radius: 0.018, lip: 0.021, half: 0.012 };
const BAIL_RADIUS = 0.024;
const ROTOR_X = 0.016;
/** Kelan välityssuhde: roottori kiertää näin monta kierrosta kammen kierroksella. */
const GEAR_RATIO = 5.2;
/** Kammen kierrosnopeus (kierrosta/s) normaalilla vaihteella. */
const CRANK_RPS = 1.6;
/** Ruudun kiertonopeuden yläraja (rad/s): nopeampi kierto näyttäisi seisovan. */
const MAX_SPIN = 40;

interface RodPiece {
  /** Siirtymä vavan keskiviivasta pikseleinä (+ = vavan alapuoli ruudulla). */
  off: number;
  from: number;
  /** `null` = vavan kärki. */
  to: number | null;
}

/** Yhden pikselin levyiset viivat, jotka yhdessä piirtävät vavan. */
const ROD_PARTS: { color: number; pieces: RodPiece[] }[] = (() => {
  const s0 = -ROD.seatLength;
  const s1 = ROD.seatLength;
  const grip = (off: number): RodPiece[] => [
    { off, from: -ROD.butt, to: s0 },
    { off, from: s1, to: ROD.foreGrip },
  ];
  return [
    {
      color: COLOR.rod,
      pieces: [{ off: 0, from: ROD.foreGrip, to: null }],
    },
    {
      color: COLOR.rodShade,
      pieces: [{ off: 1, from: ROD.foreGrip, to: null }],
    },
    { color: COLOR.cork, pieces: [...grip(-1), ...grip(0)] },
    { color: COLOR.corkShade, pieces: grip(1) },
    {
      color: COLOR.seat,
      pieces: [-1, 0, 1].map((off) => ({ off, from: s0, to: s1 })),
    },
  ];
})();

const COIL_POINTS = 13;

/**
 * Kalastajan silmin näkyvä virveli: vapa on siimaa pikselin paksumpi, siima
 * kulkee kelalta ohjainten kautta vavan kärkeen ja kela on kahvan alla.
 *
 * Vapa piirretään pikselin levyisinä viivoina, jotka siirretään toistensa
 * viereen ruudun pikseleinä, joten se on terävä kaikilla etäisyyksillä.
 * Kela on oikea pieni kappale: kampi ja roottori pyörivät kelatessa, ja
 * heitossa kaari on auki ja siima kiertää kelan reunalta ulos.
 */
export class PovRod {
  readonly group = new THREE.Group();
  private readonly rodLines: { line: THREE.LineSegments; pieces: RodPiece[] }[];
  private readonly along: THREE.Line;
  private readonly coil: THREE.Line;
  private readonly reel = new THREE.Group();
  private readonly rotor = new THREE.Group();
  private readonly bail = new THREE.Group();
  private readonly roller: THREE.Mesh;
  private readonly spool = new THREE.Group();
  private readonly spoolLine: THREE.Mesh;
  private readonly crank = new THREE.Group();
  private readonly lineMaterials: { color: THREE.Color }[] = [];

  private prevLength = 0;
  private rate = 0;
  private crankAngle = 0;
  private coilAngle = 0;
  private lastTime = NaN;
  /** Ruudun akseli, jonka suuntaan vavan rivit siirtyvät (vaihtuu hystereesillä). */
  private sideways = true;

  private readonly v = {
    seat: new THREE.Vector3(),
    tip: new THREE.Vector3(),
    f: new THREE.Vector3(),
    u: new THREE.Vector3(),
    r: new THREE.Vector3(),
    camFwd: new THREE.Vector3(),
    camAxis: new THREE.Vector3(),
    a: new THREE.Vector3(),
    b: new THREE.Vector3(),
    m: new THREE.Matrix4(),
  };

  constructor() {
    this.rodLines = ROD_PARTS.map(({ color, pieces }) => {
      const line = new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(
          Array.from({ length: pieces.length * 2 }, () => new THREE.Vector3()),
        ),
        new THREE.LineBasicMaterial({ color }),
      );
      line.frustumCulled = false;
      // Vapa piirretään siiman päälle, kun ne osuvat samoihin pikseleihin kärjessä.
      line.renderOrder = 2;
      this.group.add(line);
      return { line, pieces };
    });

    this.along = this.lineObject(ROD.guides.length + 2);
    this.along.renderOrder = 1;
    this.coil = this.lineObject(COIL_POINTS);
    this.group.add(this.along, this.coil);

    const box = (
      w: number,
      h: number,
      d: number,
      color: number,
      x: number,
      y: number,
      z: number,
    ) => {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshBasicMaterial({ color }),
      );
      m.position.set(x, y, z);
      return m;
    };
    const drum = (r: number, len: number, color: number, x: number, mat?: THREE.Material) => {
      const m = new THREE.Mesh(
        new THREE.CylinderGeometry(r, r, len, 10),
        mat ?? new THREE.MeshBasicMaterial({ color }),
      );
      m.rotation.z = Math.PI / 2;
      m.position.x = x;
      return m;
    };

    // Jalka vavan alla, varsi ja runko.
    this.reel.add(box(0.05, 0.005, 0.01, COLOR.dark, 0.005, -0.004, 0));
    this.reel.add(box(0.012, 0.03, 0.007, COLOR.dark, 0, -0.02, 0));
    this.reel.add(box(0.04, 0.032, 0.024, COLOR.body, -0.01, SPOOL.y, 0));

    // Roottori: kuppi, kaaren varret, kaari ja rulla.
    this.rotor.position.set(ROTOR_X, SPOOL.y, 0);
    this.rotor.add(drum(0.017, 0.016, COLOR.rotor, 0));
    for (const z of [-1, 1]) {
      this.rotor.add(box(0.03, 0.004, 0.004, COLOR.rotor, 0.014, 0, z * 0.019));
    }
    this.bail.position.x = SPOOL.x - ROTOR_X;
    const bailLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(
        Array.from({ length: 9 }, (_, i) => {
          const a = (i / 8) * Math.PI;
          return new THREE.Vector3(0, -Math.sin(a) * BAIL_RADIUS, Math.cos(a) * BAIL_RADIUS);
        }),
      ),
      new THREE.LineBasicMaterial({ color: COLOR.light }),
    );
    this.bail.add(bailLine);
    this.roller = box(0.005, 0.005, 0.005, COLOR.light, 0, 0, BAIL_RADIUS);
    this.bail.add(this.roller);
    this.rotor.add(this.bail);
    this.reel.add(this.rotor);

    // Puola: siimakerros pelaajan siiman värisenä, etureuna ja jarrun merkki.
    this.spool.position.set(SPOOL.x, SPOOL.y, 0);
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xc3cbd2 });
    this.lineMaterials.push(lineMat);
    this.spoolLine = drum(SPOOL.radius, SPOOL.half * 2 - 0.004, 0, 0, lineMat);
    this.spool.add(this.spoolLine);
    this.spool.add(drum(SPOOL.lip, 0.004, COLOR.light, SPOOL.half));
    this.spool.add(drum(0.008, 0.006, COLOR.dark, SPOOL.half + 0.004));
    this.spool.add(box(0.005, 0.006, 0.004, COLOR.dark, SPOOL.half, SPOOL.lip, 0));
    this.reel.add(this.spool);

    // Kampi kelan vasemmalla puolella: akseli, varsi ja nuppi.
    const handle = new THREE.Group();
    handle.position.set(-0.01, SPOOL.y, -0.012);
    handle.add(box(0.004, 0.004, 0.016, COLOR.dark, 0, 0, -0.008));
    this.crank.position.z = -0.016;
    this.crank.add(box(0.005, 0.036, 0.004, COLOR.dark, 0, 0.018, 0));
    this.crank.add(box(0.008, 0.009, 0.013, COLOR.knob, 0, 0.036, -0.007));
    handle.add(this.crank);
    this.reel.add(handle);

    this.group.add(this.reel);
  }

  private lineObject(points: number): THREE.Line {
    const material = new THREE.LineBasicMaterial({ color: 0xc3cbd2 });
    this.lineMaterials.push(material);
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(
        Array.from({ length: points }, () => new THREE.Vector3()),
      ),
      material,
    );
    line.frustumCulled = false;
    return line;
  }

  /**
   * `tip` = piirretyn kärjen paikka (oikeassa kädessä), `pixelSize` = pikselin
   * koko metrin päässä kamerasta, `cranking` = pelaaja kelaa.
   */
  update(
    camera: THREE.PerspectiveCamera,
    pixelSize: number,
    pos: Vec2,
    heading: number,
    tip: Vec2,
    s: FishingState,
    cranking: boolean,
    lineColor: number,
    tipY = ROD_TIP_Y,
  ): void {
    const now = performance.now() / 1000;
    const dt = Number.isFinite(this.lastTime) ? Math.min(0.1, Math.max(0, now - this.lastTime)) : 0;
    this.lastTime = now;
    const v = this.v;

    // Istukka pysyy kuvassa myös kapealla (pystyasentoisella) ruudulla.
    const halfWidth = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
    const side = Math.min(ROD.seatSide, ROD.seatForward * halfWidth * 0.7);
    const seat2 = {
      x: pos.x + Math.cos(heading) * ROD.seatForward + Math.cos(heading - Math.PI / 2) * side,
      y: pos.y + Math.sin(heading) * ROD.seatForward + Math.sin(heading - Math.PI / 2) * side,
    };
    v.seat.copy(toWorld(seat2, ROD.seatHeight));
    v.tip.copy(toWorld(tip, tipY));
    const length = v.seat.distanceTo(v.tip);
    v.f.subVectors(v.tip, v.seat).normalize();
    v.u.set(0, 1, 0).addScaledVector(v.f, -v.f.y).normalize();
    v.r.crossVectors(v.f, v.u);

    camera.updateMatrixWorld();
    camera.getWorldDirection(v.camFwd);
    const sign = this.chooseAxis(camera);
    const along = (sAlong: number, out: THREE.Vector3) =>
      out.copy(v.seat).addScaledVector(v.f, sAlong);
    // Siirtää pisteen `px` pikseliä valitulla ruudun akselilla.
    const shift = (p: THREE.Vector3, px: number) => {
      const depth = Math.max(0.05, v.a.subVectors(p, camera.position).dot(v.camFwd));
      return p.addScaledVector(v.camAxis, px * sign * depth * pixelSize);
    };

    for (const { line, pieces } of this.rodLines) {
      const attr = line.geometry.getAttribute('position') as THREE.BufferAttribute;
      pieces.forEach((piece, i) => {
        shift(along(piece.from, v.b), piece.off);
        attr.setXYZ(i * 2, v.b.x, v.b.y, v.b.z);
        shift(along(piece.to ?? length, v.b), piece.off);
        attr.setXYZ(i * 2 + 1, v.b.x, v.b.y, v.b.z);
      });
      attr.needsUpdate = true;
    }

    // Kela vavan alle: x vapaa pitkin, y vavan yläpuoli, z oikealle.
    v.m.makeBasis(v.f, v.u, v.r);
    this.reel.quaternion.setFromRotationMatrix(v.m);
    this.reel.position.copy(v.seat);
    this.animateReel(s, cranking, dt);
    this.reel.updateMatrixWorld(true);

    for (const m of this.lineMaterials) m.color.setHex(lineColor);
    const bailOpen = s.stage === 'charging' || s.stage === 'flight';
    const exit = bailOpen
      ? this.reel.localToWorld(
          v.b.set(
            SPOOL.x + SPOOL.half,
            SPOOL.y + Math.cos(this.coilAngle) * SPOOL.radius,
            Math.sin(this.coilAngle) * SPOOL.radius,
          ),
        )
      : this.roller.getWorldPosition(v.b);
    const attr = this.along.geometry.getAttribute('position') as THREE.BufferAttribute;
    attr.setXYZ(0, exit.x, exit.y, exit.z);
    ROD.guides.forEach(([at, drop], i) => {
      along(at * length, v.b);
      // Ohjain riippuu vavan alla; vähintään kahden pikselin päässä, jotta siima erottuu vavasta.
      const depth = v.a.subVectors(v.b, camera.position).dot(v.camFwd);
      shift(v.b, Math.max(2, Math.round(drop / (depth * pixelSize))));
      attr.setXYZ(i + 1, v.b.x, v.b.y, v.b.z);
    });
    attr.setXYZ(ROD.guides.length + 1, v.tip.x, v.tip.y, v.tip.z);
    attr.needsUpdate = true;

    this.updateCoil(bailOpen && this.rate > 0.5, now);
  }

  /**
   * Valitsee ruudun akselin, jonka suuntaan rivit siirretään: jyrkkä vapa
   * paksunee sivuttain, loiva pystysuunnassa. Palauttaa suunnan merkin, joka
   * vie siirtymän vavan alapuolelle (kelan ja ohjainten puolelle).
   */
  private chooseAxis(camera: THREE.PerspectiveCamera): number {
    const v = this.v;
    const a = v.a.copy(v.seat).project(camera);
    const b = v.b.copy(v.tip).project(camera);
    const dx = Math.abs(b.x - a.x) * camera.aspect;
    const dy = Math.abs(b.y - a.y);
    if (this.sideways ? dx > dy * 1.2 : dy > dx * 1.2) this.sideways = !this.sideways;
    v.camAxis
      .set(this.sideways ? 1 : 0, this.sideways ? 0 : 1, 0)
      .applyQuaternion(camera.quaternion);
    // Kumpaan suuntaan vavan alapuoli (kela) näkyy tällä akselilla: perspektiivi
    // ratkaisee, joten verrataan ruutupisteitä eikä suuntavektoreita.
    v.a.copy(v.seat).lerp(v.tip, 0.3);
    v.b.copy(v.a).addScaledVector(v.u, -0.05).project(camera);
    v.a.project(camera);
    const below = this.sideways ? (v.b.x - v.a.x) * camera.aspect : v.b.y - v.a.y;
    return below < 0 ? -1 : 1;
  }

  private animateReel(s: FishingState, cranking: boolean, dt: number): void {
    const out = s.stage === 'flight' || s.stage === 'water';
    const length = out ? s.lineLength : 0;
    const raw = dt > 0 && out ? (length - this.prevLength) / dt : 0;
    this.prevLength = length;
    // Siiman pituus muuttuu kiinteillä askelilla: tasoitetaan ruudun nopeudeksi.
    this.rate += (Math.max(-5, Math.min(40, raw)) - this.rate) * Math.min(1, dt * 10);
    if (!out) this.rate = 0;

    const bailOpen = s.stage === 'charging' || s.stage === 'flight';
    // Kaari käännetään heiton ajaksi auki taaksepäin.
    this.bail.rotation.z = bailOpen ? 1.7 : 0;
    if (cranking && !bailOpen) {
      const rps = (CRANK_RPS * (REEL.gears[s.gear] ?? 0.9)) / REEL.gears[1];
      // Kymmenen kammen kierrosta = 52 roottorin kierrosta: kulmat pysyvät jatkuvina.
      this.crankAngle = (this.crankAngle + rps * Math.PI * 2 * dt) % (Math.PI * 20);
    }
    this.crank.rotation.z = -this.crankAngle;
    this.rotor.rotation.x = this.crankAngle * GEAR_RATIO;
    // Heitossa siima kiertää puolan reunalta; kiinni olevalla kaarella jarru antaa ja puola pyörii.
    const spin = Math.min(MAX_SPIN, Math.max(0, this.rate) / SPOOL.radius) * dt;
    if (bailOpen) this.coilAngle = (this.coilAngle + spin) % (Math.PI * 2);
    else if (this.rate > 0.05)
      this.spool.rotation.x = (this.spool.rotation.x - spin) % (Math.PI * 2);
    // Puolalla on sitä vähemmän siimaa, mitä enemmän sitä on ulkona.
    const fill = 0.75 + 0.25 * (1 - Math.min(1, length / REEL.spool));
    this.spoolLine.scale.set(fill, 1, fill);
  }

  /** Heitossa puolalta purkautuva siima näkyy huojuvana kierteenä puolan edessä. */
  private updateCoil(visible: boolean, now: number): void {
    this.coil.visible = visible;
    if (!visible) return;
    const attr = this.coil.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < COIL_POINTS; i++) {
      const a = (i / (COIL_POINTS - 1)) * Math.PI * 2 + this.coilAngle;
      const wobble = Math.sin(a * 3 + now * 23) * 0.004;
      this.v.b.set(
        SPOOL.x + SPOOL.half + 0.008 + Math.sin(a * 2 + now * 17) * 0.004,
        SPOOL.y + Math.cos(a) * (SPOOL.lip + 0.004 + wobble),
        Math.sin(a) * (SPOOL.lip + 0.004 + wobble),
      );
      this.reel.localToWorld(this.v.b);
      attr.setXYZ(i, this.v.b.x, this.v.b.y, this.v.b.z);
    }
    attr.needsUpdate = true;
  }
}
