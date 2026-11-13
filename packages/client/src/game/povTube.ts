import * as THREE from 'three';
import { DEFAULT_APPEARANCE, EMOTE_DURATION, type Appearance, type EmoteId } from '@lunki/shared';
import { activeLook, smoothLook } from '../engine/look';
import { emoteIcon } from '../ui/emoteIcons';
import { playerColorMaterial, setPlayerColor } from './playerColor';

/**
 * Kalastajan silmin näkyvä kelluntarengas (#230): U-muotoisen renkaan
 * sivuponttoonien kärjet, reisien päällä oleva verkkotaso, sääret ja
 * räpylät veden alla. Kaikki on oikeita 3D-kappaleita kameran edessä, joten
 * vuorokaudenaika ja valaistus vaikuttavat niihin kuten muuhunkin maisemaan.
 *
 * Paikallinen koordinaatisto kuten `createTubeMesh`: +x katsesuuntaan,
 * +y ylös, +z oikealle; origo vedenpinnalla kalastajan kohdalla.
 */

/** Mitat (m). Silmät ovat 0,55 m pinnasta (povCamera). */
export const DIM = {
  /** Ponttoonin säde, keskilinjan etäisyys sivulle ja korkeus. */
  pontoonRadius: 0.15,
  pontoonSide: 0.5,
  pontoonY: 0.05,
  /** Ponttoonin kärki eteenpäin. */
  pontoonTip: 0.6,
  /** Verkkotaso: alku- ja loppureuna eteen, puolileveys ja korkeus. */
  apronFrom: 0.05,
  apronTo: 0.42,
  /**
   * Perhovarusteilla verkkotaso jatkuu polvien yli siimatasoksi tähän asti,
   * jotta löysä siima näkyy sen päällä. Muuten taso jää lyhyeksi, ettei se
   * peitä potkivia räpylöitä.
   */
  flapTo: 0.56,
  apronHalf: 0.3,
  apronY: 0.2,
  /** Polvet verkkotason alla, sääret viistosti eteen alas (kulma pystystä). */
  kneeY: 0.16,
  kneeSide: 0.16,
  shin: 0.85,
  shinAngle: 0.8,
  fin: 0.42,
} as const;

const COLOR = {
  apron: 0x1c232b,
  net: 0x5f6b78,
  legs: 0x3b4630,
  skin: 0xe0cf9c,
  water: 0x123a5c,
  foam: 0xeef2f3,
} as const;

/** Veden läpi piirrettävät osat; rengas piirretään niiden päälle. */
const UNDERWATER_ORDER = 3;
const SPLASHES = 12;
const SPLASH_LIFE = 0.45;

export interface PovTubeInput {
  /** Potkurytmi 0–1 (0 = ei potkita). */
  kickPhase: number;
  /** Pikapotku: rajumpi heilunta ja roiske. */
  sprint: boolean;
  /** Kääntymisen kulmanopeus (rad/s, + = vasemmalle). */
  angVel: number;
  /** Renkaan keinunta aalloissa (rad) ja nousu (m). */
  roll: number;
  pitch: number;
  lift: number;
  /** Kaatumisen kallistus (rad, 0–π). */
  capsize: number;
  /** Väsytys: siiman veto sivulle (-1 vasen … 1 oikea) kertaa kireys 0–1. */
  pull: number;
  /** Veden kirkkaus 0–1: päivällä räpylät erottuvat, yöllä tuskin. */
  clarity: number;
  /** Oma käsimerkki ja sen ikä (s). */
  emote: EmoteId | null;
  emoteAge: number;
}

/** Räpylän ja säären asento potkurytmissä: heilahdus (rad) eteen-taakse ja kääntö. */
export function finPose(
  kickPhase: number,
  sprint: boolean,
  angVel: number,
  side: -1 | 1,
  time: number,
): { swing: number; ankle: number; yaw: number } {
  const kicking = kickPhase > 0;
  // Vasen ja oikea vuorotellen; levossa räpylät huojuvat hiljaa.
  const phase = kickPhase * Math.PI * 2 + (side < 0 ? 0 : Math.PI);
  // Sääret heilahtavat vähän, räpylät läpsyvät nilkasta enemmän.
  const amp = kicking ? (sprint ? 0.22 : 0.12) : 0.03;
  const wave = kicking ? Math.sin(phase) : Math.sin(time * 1.3 + (side < 0 ? 0 : 1.7));
  // Käännöksessä räpylät kääntyvät eri suuntiin kuin peräsimet.
  const yaw = Math.max(-0.45, Math.min(0.45, angVel * 0.6)) * side;
  return { swing: wave * amp, ankle: -wave * amp * 3, yaw };
}

/** Oman käden nosto ruudun reunasta 0–1 eleen aikana. */
export function handRaise(age: number): number {
  if (age < 0 || age >= EMOTE_DURATION) return 0;
  const up = Math.min(1, age / 0.25);
  const down = Math.min(1, (EMOTE_DURATION - age) / 0.3);
  const k = Math.min(up, down);
  return k * k * (3 - 2 * k);
}

/** Kiekuroita enintään ja pisteitä kiekuraa kohden. */
const SLACK_COILS = 8;
const COIL_POINTS = 16;

/** Kiekuran paikka ja säteet (m) renkaan koordinaatistossa. */
export interface SlackCoil {
  x: number;
  y: number;
  z: number;
  rx: number;
  rz: number;
}

/**
 * Löysän siiman kiekurat kasana verkkotason päällä (ks. `slackPilePoint`): soikeat lenkit vähän eri
 * kohdissa vuorotellen keskilinjan kummallakin puolella, jokainen edellisen
 * päällä. Kiinteä "satunnainen" sijoittelu, jotta kasa ei elä kuvasta toiseen.
 */
export function slackCoilLayout(): SlackCoil[] {
  const coils: SlackCoil[] = [];
  for (let c = 0; c < SLACK_COILS; c++) {
    const side = c % 2 === 0 ? 1 : -1;
    coils.push({
      x: 0.36 + ((c * 29) % 6) * 0.022,
      y: DIM.apronY + 0.01 + c * 0.004,
      z: side * (0.02 + ((c * 17) % 5) * 0.014),
      rx: 0.05 + ((c * 37) % 5) * 0.007,
      rz: 0.08 + ((c * 53) % 7) * 0.007,
    });
  }
  return coils;
}

/**
 * Kasan piste: siima kiertää kiekuralta seuraavalle yhtenä viivana. `t` on
 * kierrosten määrä kasan pohjalta (0 … `SLACK_COILS`); kierroksen aikana
 * keskipiste ja säteet liukuvat kiekuralta seuraavalle, ja lenkki on vähän
 * kuhmurainen, ei täydellinen soikio.
 */
export function slackPilePoint(t: number, coils = slackCoilLayout()): THREE.Vector3 {
  const last = coils.length - 1;
  const c = Math.min(last, Math.floor(t));
  const f = Math.min(1, t - c);
  const k0 = coils[c]!;
  const k1 = coils[Math.min(last, c + 1)]!;
  const s = f * f * (3 - 2 * f);
  const mix = (a: number, b: number) => a + (b - a) * s;
  const a = t * Math.PI * 2;
  const r = 1 + 0.12 * Math.sin(a * 3 + c);
  return new THREE.Vector3(
    mix(k0.x, k1.x) + Math.cos(a) * mix(k0.rx, k1.rx) * r,
    mix(k0.y, k1.y),
    mix(k0.z, k1.z) + Math.sin(a) * mix(k0.rz, k1.rz) * r,
  );
}

/** Kelalta ja siimakädeltä kasaan riippuvan siiman pisteet. */
const HANG_POINTS = 10;
/** Löysää siimaa (m) yhtä kiekuraa kohden. */
const SLACK_PER_COIL = 2.5;

/**
 * Riippuva siima ylhäältä (`from`) kasaan (`to`): putoaa ensin lähes suoraan
 * alas ja kääntyy tasoa pitkin kasaan. Pisteet kirjoitetaan taulukkoon `out`.
 */
export function slackHang(from: THREE.Vector3, to: THREE.Vector3, out: THREE.Vector3[]): void {
  const cx = from.x + (to.x - from.x) * 0.25;
  const cz = from.z + (to.z - from.z) * 0.25;
  const cy = Math.min(from.y, to.y + 0.01);
  for (let i = 0; i < out.length; i++) {
    const u = i / (out.length - 1);
    const a = (1 - u) * (1 - u);
    const b = 2 * u * (1 - u);
    const c = u * u;
    out[i]!.set(
      a * from.x + b * cx + c * to.x,
      a * from.y + b * cy + c * to.y,
      a * from.z + b * cz + c * to.z,
    );
  }
}

/** Löysän siiman viiva: kelalta kasaan, kasan kiekurat ja kasasta siimakädelle. */
function slackLine(material: THREE.LineBasicMaterial): THREE.Line {
  const points = Array.from(
    { length: HANG_POINTS * 2 + SLACK_COILS * COIL_POINTS + 1 },
    () => new THREE.Vector3(),
  );
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material);
  line.geometry.setDrawRange(0, 0);
  line.frustumCulled = false;
  return line;
}

/** Kahden värin sekoitus. */
const mix = (a: number, b: number, k: number) =>
  new THREE.Color(a).lerp(new THREE.Color(b), k).getHex();

/** Verkon kuvio; `length` = verkon pituus eteen (m), jotta silmät ovat samankokoisia. */
function netTexture(length: number): THREE.CanvasTexture {
  const size = 16;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = `#${COLOR.apron.toString(16).padStart(6, '0')}`;
    g.fillRect(0, 0, size, size);
    g.fillStyle = `#${COLOR.net.toString(16).padStart(6, '0')}`;
    for (let i = 0; i < size; i += 4) {
      g.fillRect(i, 0, 1, size);
      g.fillRect(0, i, size, 1);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set((3 * length) / (DIM.apronTo - DIM.apronFrom), 2);
  return tex;
}

/** Verkkotason osa `from`–`to` (m eteen): tumma kehys ja harva verkko. */
function netPanel(from: number, to: number): THREE.Group {
  const panel = new THREE.Group();
  const len = to - from;
  const net = new THREE.Mesh(
    new THREE.PlaneGeometry(len, DIM.apronHalf * 2),
    new THREE.MeshLambertMaterial({ map: netTexture(len) }),
  );
  net.rotation.x = -Math.PI / 2;
  net.position.set(from + len / 2, DIM.apronY, 0);
  const frame = new THREE.MeshLambertMaterial({ color: COLOR.apron });
  const front = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.015, DIM.apronHalf * 2), frame);
  front.position.set(to, DIM.apronY, 0);
  panel.add(net, front);
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.015, 0.015), frame);
    rail.position.set(from + len / 2, DIM.apronY, side * DIM.apronHalf);
    panel.add(rail);
  }
  return panel;
}

/** Räpylä ylhäältä: kapea kantapää, leveä lapa ja lovi kärjessä. */
function finGeometry(): THREE.BufferGeometry {
  const L = DIM.fin;
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.06);
  shape.lineTo(L * 0.35, -0.08);
  shape.lineTo(L, -0.13);
  shape.lineTo(L * 0.9, 0);
  shape.lineTo(L, 0.13);
  shape.lineTo(L * 0.35, 0.08);
  shape.lineTo(0, 0.06);
  shape.closePath();
  const g = new THREE.ShapeGeometry(shape);
  g.rotateX(-Math.PI / 2);
  return g;
}

interface Leg {
  pivot: THREE.Group;
  shinWet: THREE.Mesh;
  ankle: THREE.Group;
  fin: THREE.Mesh;
}

interface Splash {
  mesh: THREE.Mesh;
  age: number;
  vel: THREE.Vector3;
}

export class PovTube {
  readonly group = new THREE.Group();
  /** Verkkotaso: perhokalastuksen irtosiima lepää tässä (#234). */
  readonly apron = new THREE.Group();
  /** Perhovarusteiden siimataso verkkotason jatkona. */
  private readonly flap = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly tubeMaterial: THREE.MeshLambertMaterial;
  private readonly finDry: THREE.MeshLambertMaterial;
  private readonly wetLeg = new THREE.MeshBasicMaterial({ color: COLOR.water });
  private readonly wetFin = new THREE.MeshBasicMaterial({
    color: COLOR.water,
    side: THREE.DoubleSide,
  });
  private readonly legs: Leg[] = [];
  private readonly hand = new THREE.Group();
  private readonly palmMaterial: THREE.MeshBasicMaterial;
  private readonly icons = new Map<string, THREE.CanvasTexture>();
  private readonly splashes: Splash[] = [];
  private finColor: number = DEFAULT_APPEARANCE.fins;
  private lastPhase = 0;
  private time = 0;
  private lastClarity = -1;
  /**
   * Perhon löysä siima (#234): yksi viiva kelalta verkkotasolle, tasolla
   * kiekuroina ja kasasta ylös siimakädelle.
   */
  private readonly slackMaterial = new THREE.LineBasicMaterial({ color: DEFAULT_APPEARANCE.line });
  private readonly slackLine: THREE.Line;
  private slackMeters = 0;
  private readonly slackCoils = slackCoilLayout();
  private readonly hang = Array.from({ length: HANG_POINTS }, () => new THREE.Vector3());
  private readonly slackFrom = new THREE.Vector3();

  constructor(appearance: Appearance = DEFAULT_APPEARANCE) {
    this.group.add(this.body);
    this.tubeMaterial = playerColorMaterial(appearance.tube);
    this.finDry = playerColorMaterial(appearance.fins);

    // Sivuponttoonit: pyöreä kärki edessä, U:n aukko kalastajan edessä.
    for (const side of [-1, 1]) {
      const len = DIM.pontoonTip + 0.5;
      const tube = new THREE.Mesh(
        new THREE.CylinderGeometry(DIM.pontoonRadius, DIM.pontoonRadius, len, 10, 1, true),
        this.tubeMaterial,
      );
      tube.rotation.z = Math.PI / 2;
      tube.position.set(DIM.pontoonTip - len / 2, DIM.pontoonY, side * DIM.pontoonSide);
      const tip = new THREE.Mesh(
        new THREE.SphereGeometry(DIM.pontoonRadius, 10, 6, 0, Math.PI * 2, 0, Math.PI),
        this.tubeMaterial,
      );
      tip.position.set(DIM.pontoonTip, DIM.pontoonY, side * DIM.pontoonSide);
      // Ponttoonin kärkeä kohti kapeneva sauma erottaa renkaan muodon.
      const seam = new THREE.Mesh(
        new THREE.BoxGeometry(len, 0.015, 0.015),
        new THREE.MeshLambertMaterial({ color: COLOR.apron }),
      );
      seam.position.set(
        DIM.pontoonTip - len / 2,
        DIM.pontoonY + DIM.pontoonRadius * 0.7,
        side * (DIM.pontoonSide - DIM.pontoonRadius * 0.7),
      );
      this.body.add(tube, tip, seam);
    }

    // Verkkotaso reisien päällä ja perhovarusteiden siimataso sen jatkona.
    this.apron.add(netPanel(DIM.apronFrom, DIM.apronTo));
    this.flap.add(netPanel(DIM.apronTo, DIM.flapTo));
    this.flap.visible = false;
    this.slackLine = slackLine(this.slackMaterial);
    this.slackLine.visible = false;
    // Kiekurat piirretään verkon jälkeen: muuten niiden syvyys estäisi verkon
    // piirron ja verkon alle jäävät räpylät näkyisivät viivojen kohdalla.
    this.slackLine.renderOrder = UNDERWATER_ORDER + 2;
    this.body.add(this.apron, this.flap, this.slackLine);
    // Rengas piirretään veden alla näkyvien räpylöiden jälkeen, jotta se peittää ne:
    // levossa räpylöistä näkyvät vain kärjet renkaan edessä.
    this.body.traverse((o) => {
      if (o instanceof THREE.Mesh) o.renderOrder = UNDERWATER_ORDER + 1;
    });

    // Sääret polvista viistosti eteen veteen; veden alla tummina.
    const legMat = new THREE.MeshLambertMaterial({ color: COLOR.legs });
    for (const side of [-1, 1] as const) {
      const pivot = new THREE.Group();
      pivot.position.set(DIM.apronTo, DIM.kneeY, side * DIM.kneeSide);
      const dry = DIM.kneeY / Math.cos(DIM.shinAngle);
      const shinDry = new THREE.Mesh(new THREE.BoxGeometry(0.1, dry, 0.1), legMat);
      shinDry.position.y = -dry / 2;
      const wet = DIM.shin - dry;
      const shinWet = new THREE.Mesh(new THREE.BoxGeometry(0.09, wet, 0.09), this.wetLeg);
      shinWet.position.y = -dry - wet / 2;
      const ankle = new THREE.Group();
      ankle.position.y = -DIM.shin;
      const fin = new THREE.Mesh(finGeometry(), this.wetFin);
      fin.position.x = -0.05;
      ankle.add(fin);
      pivot.add(shinDry, shinWet, ankle);
      pivot.rotation.z = DIM.shinAngle;
      // Veden alla olevat osat piirretään vedenpinnan läpi (vesi on läpinäkymätön).
      for (const m of [shinWet, fin]) {
        m.renderOrder = UNDERWATER_ORDER;
        (m.material as THREE.Material).depthTest = false;
      }
      this.body.add(pivot);
      this.legs.push({ pivot, shinWet, ankle, fin });
    }

    // Vasen käsi käsimerkkejä varten: kyynärvarsi nousee ruudun vasemmasta
    // alakulmasta, ja kämmen on eleen pikseli-ikoni katsojaan päin.
    const forearm = new THREE.Mesh(
      new THREE.BoxGeometry(0.055, 0.4, 0.055),
      playerColorMaterial(appearance.shirt),
    );
    forearm.name = 'shirt';
    forearm.position.set(0.02, -0.25, -0.06);
    forearm.rotation.set(0.3, 0, -0.25);
    // Ikonin värit sellaisinaan: varjostus muuttaisi ihon paletissa harmaaksi.
    this.palmMaterial = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.5 });
    const palm = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.13), this.palmMaterial);
    palm.rotation.y = -Math.PI / 2;
    this.hand.add(forearm, palm);
    this.hand.visible = false;
    this.body.add(this.hand);

    const foam = new THREE.MeshBasicMaterial({ color: COLOR.foam });
    for (let i = 0; i < SPLASHES; i++) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.016, 0.016), foam);
      mesh.visible = false;
      this.group.add(mesh);
      this.splashes.push({ mesh, age: SPLASH_LIFE, vel: new THREE.Vector3() });
    }
    this.setAppearance(appearance);
  }

  setAppearance(a: Appearance): void {
    setPlayerColor(this.tubeMaterial, a.tube);
    setPlayerColor(this.finDry, a.fins);
    this.finColor = a.fins;
    this.lastClarity = -1;
    this.hand.traverse((o) => {
      if (o.name === 'shirt' && o instanceof THREE.Mesh)
        setPlayerColor(o.material as THREE.MeshLambertMaterial, a.shirt);
    });
  }

  /** `origin` = renkaan kohta maailmassa vedenpinnalla, `heading` = katsesuunta. */
  /** Perhovarusteilla siimataso esiin ja sen päälle löysä siima (m), ks. `hangSlack`. */
  setFlyLine(fly: boolean, meters: number, color: number): void {
    this.flap.visible = fly;
    this.slackMeters = fly ? meters : 0;
    this.slackLine.visible = this.slackMeters > 0.2;
    this.slackMaterial.color.setHex(color);
  }

  /**
   * Piirtää löysän siiman: kelalta (`ends.reel`) alas verkkotasolle, tasolla
   * kiekuroina (yksi noin kahta ja puolta metriä kohden) ja kasasta ylös
   * siimakädelle (`ends.hand`). Pisteet ovat maailmassa; kutsutaan vavan
   * päivityksen jälkeen. Ilman vapaa (`null`) piirretään vain kasa.
   */
  hangSlack(ends: { reel: THREE.Vector3; hand: THREE.Vector3 } | null): void {
    if (!this.slackLine.visible) return;
    const coils = Math.min(SLACK_COILS, Math.max(0.5, this.slackMeters / SLACK_PER_COIL));
    const turns = Math.ceil(coils * COIL_POINTS);
    const attr = this.slackLine.geometry.getAttribute('position') as THREE.BufferAttribute;
    let n = 0;
    const put = (p: THREE.Vector3) => attr.setXYZ(n++, p.x, p.y, p.z);
    const first = slackPilePoint(0, this.slackCoils);
    const last = slackPilePoint(coils, this.slackCoils);
    if (ends) {
      this.body.updateWorldMatrix(true, false);
      slackHang(this.body.worldToLocal(this.slackFrom.copy(ends.reel)), first, this.hang);
      this.hang.forEach(put);
    } else put(first);
    for (let i = 1; i < turns; i++) put(slackPilePoint((i / turns) * coils, this.slackCoils));
    if (ends) {
      slackHang(this.body.worldToLocal(this.slackFrom.copy(ends.hand)), last, this.hang);
      for (let i = this.hang.length - 1; i >= 0; i--) put(this.hang[i]!);
    } else put(last);
    attr.needsUpdate = true;
    this.slackLine.geometry.setDrawRange(0, n);
  }

  update(origin: THREE.Vector3, heading: number, input: PovTubeInput, dt: number): void {
    this.time += dt;
    this.group.position.copy(origin);
    this.group.rotation.set(0, heading, 0);
    // Rengas keinuu ja kallistuu, vaikka kamera vakautetaan (steadyRoll):
    // kallistus näkyy reunan liikkeenä. Iso kala kääntää rengasta siiman suuntaan.
    const capsize = input.capsize;
    this.body.position.y = input.lift - 0.5 * (capsize / Math.PI);
    this.body.rotation.set(input.roll + input.pull * 0.12 + capsize * 0.35, 0, input.pitch, 'XYZ');

    this.updateWater(input.clarity);
    for (const [i, leg] of this.legs.entries()) {
      const side = i === 0 ? -1 : 1;
      const p = finPose(input.kickPhase, input.sprint, input.angVel, side, this.time);
      leg.pivot.rotation.set(0, p.yaw, DIM.shinAngle + p.swing);
      // Räpylä lähes vaakasuorassa, kärki hieman alaspäin.
      leg.ankle.rotation.z = -DIM.shinAngle - 0.1 + p.ankle;
      // Vesi väreilee: räpylä hieman huojuu sivuttain.
      leg.fin.position.z = Math.sin(this.time * 5 + i * 2) * 0.012;
    }

    // Roiskeet: pikapotkun tahdissa räpylöiden kohdalla, aallokossa ponttoonin kärjessä.
    const crossed = input.kickPhase > 0 && input.kickPhase < this.lastPhase;
    this.lastPhase = input.kickPhase;
    if (crossed && input.sprint) {
      const x = DIM.apronTo + DIM.shin * Math.sin(DIM.shinAngle);
      for (const z of [-DIM.kneeSide, DIM.kneeSide]) this.splash(x, 0.02, z, 2);
    }
    if (Math.abs(input.roll) > 0.16 && Math.random() < dt * 3) {
      const side = input.roll > 0 ? 1 : -1;
      this.splash(DIM.pontoonTip + 0.1, DIM.pontoonY + 0.12, side * DIM.pontoonSide, 4);
    }
    this.updateSplashes(dt);
    this.updateHand(input.emote, input.emoteAge);
  }

  /** Veden alla olevien osien sävy: kirkkaalla vedellä räpylän väri erottuu. */
  private updateWater(clarity: number): void {
    const k = Math.round(Math.max(0, Math.min(1, clarity)) * 8) / 8;
    if (k === this.lastClarity) return;
    this.lastClarity = k;
    this.wetFin.color.setHex(mix(COLOR.water, mix(this.finColor, COLOR.water, 0.35), k));
    this.wetLeg.color.setHex(mix(COLOR.water, mix(COLOR.legs, COLOR.water, 0.4), k));
  }

  private splash(x: number, y: number, z: number, n: number): void {
    for (const s of this.splashes) {
      if (n <= 0) break;
      if (s.age < SPLASH_LIFE) continue;
      s.age = 0;
      s.mesh.visible = true;
      s.mesh.position.set(x + (Math.random() - 0.5) * 0.15, y, z + (Math.random() - 0.5) * 0.15);
      s.vel.set(
        (Math.random() - 0.3) * 0.4,
        0.8 + Math.random() * 0.6,
        (Math.random() - 0.5) * 0.5,
      );
      n--;
    }
  }

  private updateSplashes(dt: number): void {
    for (const s of this.splashes) {
      if (s.age >= SPLASH_LIFE) continue;
      s.age += dt;
      s.vel.y -= 6 * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      s.mesh.visible = s.age < SPLASH_LIFE && s.mesh.position.y > -0.02;
    }
  }

  private updateHand(emote: EmoteId | null, age: number): void {
    const k = emote ? handRaise(age) : 0;
    this.hand.visible = k > 0;
    if (!emote || k === 0) return;
    const t = age;
    // Käsi nousee alhaalta vasemmalta katseen eteen.
    this.hand.position.set(0.5, 0.05 + k * 0.37, -0.36 + k * 0.06);
    let tilt = 0;
    let lift = 0;
    switch (emote) {
      case 'wave':
        tilt = 0.45 * Math.sin(t * 10);
        break;
      case 'fist':
        lift = 0.04 * Math.sin(t * 16);
        break;
      case 'comeHere':
        tilt = -0.2 + 0.35 * Math.sin(t * 8);
        break;
      case 'bigFish':
        // Käsi vetäytyy sivulle: "näin iso!"
        this.hand.position.z -= 0.06 * Math.min(1, t / 0.6);
        break;
      default:
        lift = 0.01 * Math.sin(t * 6);
    }
    this.hand.position.y += lift;
    this.hand.rotation.set(tilt, 0, 0);
    // Kuva ilmeen mukaan: Retrossa pikselit, Terävällä sileä versio.
    const sharp = smoothLook(activeLook());
    const key = `${emote}:${sharp}`;
    let icon = this.icons.get(key);
    if (!icon) {
      icon = new THREE.CanvasTexture(emoteIcon(emote));
      icon.colorSpace = THREE.SRGBColorSpace;
      icon.magFilter = sharp ? THREE.LinearFilter : THREE.NearestFilter;
      icon.minFilter = sharp ? THREE.LinearFilter : THREE.NearestFilter;
      icon.generateMipmaps = false;
      this.icons.set(key, icon);
    }
    if (this.palmMaterial.map !== icon) {
      this.palmMaterial.map = icon;
      this.palmMaterial.needsUpdate = true;
    }
  }
}
