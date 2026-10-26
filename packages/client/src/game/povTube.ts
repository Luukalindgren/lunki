import * as THREE from 'three';
import { DEFAULT_APPEARANCE, EMOTE_DURATION, type Appearance, type EmoteId } from '@lunki/shared';
import { emoteIcon } from '../ui/emoteIcons';

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
const DIM = {
  /** Ponttoonin säde, keskilinjan etäisyys sivulle ja korkeus. */
  pontoonRadius: 0.15,
  pontoonSide: 0.5,
  pontoonY: 0.05,
  /** Ponttoonin kärki eteenpäin. */
  pontoonTip: 0.6,
  /** Verkkotaso: alku- ja loppureuna eteen, puolileveys ja korkeus. */
  apronFrom: 0.05,
  apronTo: 0.42,
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

/**
 * Löysän siiman kiekurat vedessä renkaan edessä, räpylöiden molemmin puolin:
 * soikeat lenkit vähän eri kohdissa, vuorotellen kummallakin puolella.
 */
function slackCoils(material: THREE.LineBasicMaterial): THREE.LineSegments {
  const points: THREE.Vector3[] = [];
  for (let c = 0; c < SLACK_COILS; c++) {
    // Kiinteä "satunnainen" sijoittelu, jotta kasa ei elä kuvasta toiseen.
    const side = c % 2 === 0 ? 1 : -1;
    const cx = 0.75 + ((c * 29) % 6) * 0.08;
    const cz = side * (0.38 + ((c * 17) % 5) * 0.05);
    const rx = 0.08 + ((c * 37) % 5) * 0.012;
    const rz = 0.1 + ((c * 53) % 7) * 0.012;
    const at = (i: number) => {
      const a = (i / COIL_POINTS) * Math.PI * 2 + c;
      return new THREE.Vector3(cx + Math.cos(a) * rx, 0.02, cz + Math.sin(a) * rz);
    };
    for (let i = 0; i < COIL_POINTS; i++) points.push(at(i), at(i + 1));
  }
  const line = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), material);
  line.geometry.setDrawRange(0, 0);
  return line;
}

/** Kahden värin sekoitus. */
const mix = (a: number, b: number, k: number) =>
  new THREE.Color(a).lerp(new THREE.Color(b), k).getHex();

function netTexture(): THREE.CanvasTexture {
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
  tex.repeat.set(3, 2);
  return tex;
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
  private readonly icons = new Map<EmoteId, THREE.CanvasTexture>();
  private readonly splashes: Splash[] = [];
  private finColor: number = DEFAULT_APPEARANCE.fins;
  private lastPhase = 0;
  private time = 0;
  private lastClarity = -1;
  /** Perhon löysä siima kiekuroina verkkotasolla (#234). */
  private readonly slackMaterial = new THREE.LineBasicMaterial({ color: DEFAULT_APPEARANCE.line });
  private readonly slackLine: THREE.LineSegments;

  constructor(appearance: Appearance = DEFAULT_APPEARANCE) {
    this.group.add(this.body);
    this.tubeMaterial = new THREE.MeshLambertMaterial({ color: appearance.tube });
    this.finDry = new THREE.MeshLambertMaterial({ color: appearance.fins });

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

    // Verkkotaso reisien päällä: tumma kehys ja harva verkko.
    const apronLen = DIM.apronTo - DIM.apronFrom;
    const net = new THREE.Mesh(
      new THREE.PlaneGeometry(apronLen, DIM.apronHalf * 2),
      new THREE.MeshLambertMaterial({ map: netTexture() }),
    );
    net.rotation.x = -Math.PI / 2;
    net.position.set(DIM.apronFrom + apronLen / 2, DIM.apronY, 0);
    const frame = new THREE.MeshLambertMaterial({ color: COLOR.apron });
    const front = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.015, DIM.apronHalf * 2), frame);
    front.position.set(DIM.apronTo, DIM.apronY, 0);
    this.apron.add(net, front);
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(apronLen, 0.015, 0.015), frame);
      rail.position.set(DIM.apronFrom + apronLen / 2, DIM.apronY, side * DIM.apronHalf);
      this.apron.add(rail);
    }
    this.slackLine = slackCoils(this.slackMaterial);
    this.slackLine.visible = false;
    this.body.add(this.apron, this.slackLine);
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
      new THREE.MeshLambertMaterial({ color: appearance.shirt }),
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
    this.tubeMaterial.color.setHex(a.tube);
    this.finDry.color.setHex(a.fins);
    this.finColor = a.fins;
    this.lastClarity = -1;
    this.hand.traverse((o) => {
      if (o.name === 'shirt' && o instanceof THREE.Mesh)
        (o.material as THREE.MeshLambertMaterial).color.setHex(a.shirt);
    });
  }

  /** `origin` = renkaan kohta maailmassa vedenpinnalla, `heading` = katsesuunta. */
  /** Löysää siimaa (m) renkaan edessä: yksi kiekura noin kahta ja puolta metriä kohden. */
  setSlack(meters: number, color: number): void {
    const coils = Math.min(SLACK_COILS, Math.ceil(meters / 2.5));
    this.slackLine.visible = meters > 0.2;
    this.slackLine.geometry.setDrawRange(0, coils * COIL_POINTS * 2);
    this.slackMaterial.color.setHex(color);
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
    let icon = this.icons.get(emote);
    if (!icon) {
      icon = new THREE.CanvasTexture(emoteIcon(emote));
      icon.colorSpace = THREE.SRGBColorSpace;
      icon.magFilter = THREE.NearestFilter;
      icon.minFilter = THREE.NearestFilter;
      this.icons.set(emote, icon);
    }
    if (this.palmMaterial.map !== icon) {
      this.palmMaterial.map = icon;
      this.palmMaterial.needsUpdate = true;
    }
  }
}
