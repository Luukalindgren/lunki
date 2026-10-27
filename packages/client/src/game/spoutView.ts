import * as THREE from 'three';
import { SPOUT, flightPosition, type LakeMap, type SpoutFlight, type Vec2 } from '@lunki/shared';

const HEIGHT = 140;
/** Yhtä aikaa näkyvien trombien enimmäismäärä. */
const MAX = 3;
/** Imuvirran vaahtojuovat: montako kierrettä ja kuinka nopeasti ne kiertävät (rad/s). */
const ARMS = 5;
const ARM_TURN = Math.PI * 1.1;
const SWIRL_SPIN = 0.9;

/**
 * Vaahtojuovat imualueella: spiraalit reunalta suppilon juurelle. Kierre
 * kiertää vastapäivään, jolloin juovat näyttävät valuvan keskustaa kohti.
 * Juova kapenee ja ohenee reunaa kohti, jotta imualueen raja ei ole terävä.
 */
function swirlGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const alpha: number[] = [];
  const index: number[] = [];
  const steps = 40;
  const inner = 10;
  for (let a = 0; a < ARMS; a++) {
    const base = (a / ARMS) * Math.PI * 2;
    const first = pos.length / 3;
    for (let i = 0; i <= steps; i++) {
      const k = i / steps;
      const r = SPOUT.radius + (inner - SPOUT.radius) * k;
      // Kulma pienenee keskustaa kohti: vastapäivään kiertäessä juova liikkuu sisään.
      const ang = base - ARM_TURN * k * k;
      const half = 0.4 + 1.6 * k;
      const cx = Math.cos(ang);
      const cy = Math.sin(ang);
      // Vedenpinnan tasossa: x itään, -z pohjoiseen.
      pos.push((r - half) * cx, 0, -(r - half) * cy, (r + half) * cx, 0, -(r + half) * cy);
      const fade = Math.min(1, k * 2.5);
      alpha.push(fade, fade);
      if (i > 0) {
        const j = first + i * 2;
        index.push(j - 2, j - 1, j, j - 1, j + 1, j);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('alpha', new THREE.Float32BufferAttribute(alpha, 1));
  g.setIndex(index);
  return g;
}

/** Vesimaskin tarkkuus (m/pikseli). */
const MASK_CELL = 2;

/**
 * Järven vesialue tekstuurina (valkoinen = vettä), jotta vaahtojuovat eivät
 * piirry rannalle eikä saarille. Piirretään 2D-kanvaasille, mikä on nopeaa.
 */
function waterMask(map: LakeMap): { texture: THREE.Texture; bounds: THREE.Vector4 } {
  const b = map.bounds;
  const w = Math.ceil((b.maxX - b.minX) / MASK_CELL);
  const h = Math.ceil((b.maxY - b.minY) / MASK_CELL);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const ring = (points: readonly Vec2[], color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (const p of points) ctx.lineTo((p.x - b.minX) / MASK_CELL, (p.y - b.minY) / MASK_CELL);
    ctx.fill();
  };
  ring(map.shore, '#fff');
  for (const island of map.islands) ring(island, '#000');
  const texture = new THREE.CanvasTexture(canvas);
  // Kanvaasin rivi 0 on y = minY, joten kuvaa ei käännetä.
  texture.flipY = false;
  texture.magFilter = THREE.LinearFilter;
  return { texture, bounds: new THREE.Vector4(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY) };
}

const swirlMaterial = () =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uMask: { value: null },
      // Ilman maskia (leveys 0) juovat piirretään kaikkialle.
      uMaskBounds: { value: new THREE.Vector4(0, 0, 0, 0) },
    },
    vertexShader: `
      attribute float alpha;
      varying float vAlpha;
      varying vec2 vMap;
      void main() {
        vAlpha = alpha;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vMap = vec2(world.x, -world.z);
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: `
      uniform sampler2D uMask;
      uniform vec4 uMaskBounds;
      varying float vAlpha;
      varying vec2 vMap;
      void main() {
        float water = 1.0;
        if (uMaskBounds.z > 0.0) water = texture2D(uMask, (vMap - uMaskBounds.xy) / uMaskBounds.zw).r;
        float a = vAlpha * 0.55 * step(0.5, water);
        if (a <= 0.0) discard;
        gl_FragColor = vec4(0.93, 0.95, 0.96, a);
      }`,
  });

/**
 * Trombi: harmaa, raidallinen suppilo pilvistä veteen ja vaahtoava rengas
 * sen juurella. Suppilo pyörii, joten pyörre erottuu kaukaakin. Vedessä
 * kiertävät vaahtojuovat näyttävät, kuinka laajalta trombi imee.
 */
export class SpoutView {
  readonly group = new THREE.Group();
  private readonly spouts: THREE.Group[] = [];
  private readonly swirls: THREE.Mesh[] = [];
  private readonly swirlMat = swirlMaterial();
  private map: LakeMap | null = null;
  private spin = 0;
  private swirlSpin = 0;

  constructor() {
    const funnel = new THREE.CylinderGeometry(22, 2.5, HEIGHT, 12, 6, true);
    funnel.translate(0, HEIGHT / 2, 0);
    // Pystyraidat kärkien väreinä: pyöriessä raidat näyttävät pyörteen.
    const colors: number[] = [];
    const pos = funnel.getAttribute('position');
    const dark = new THREE.Color(0x5f6b78);
    const light = new THREE.Color(0x8e99a4);
    for (let i = 0; i < pos.count; i++) {
      const a = Math.atan2(pos.getZ(i), pos.getX(i)) + pos.getY(i) * 0.02;
      const c = Math.sin(a * 3) > 0 ? dark : light;
      colors.push(c.r, c.g, c.b);
    }
    funnel.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const funnelMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const spray = new THREE.RingGeometry(3, 12, 16);
    spray.rotateX(-Math.PI / 2);
    const sprayMat = new THREE.MeshBasicMaterial({ color: 0xeef2f3, side: THREE.DoubleSide });
    const swirl = swirlGeometry();
    for (let i = 0; i < MAX; i++) {
      const g = new THREE.Group();
      const f = new THREE.Mesh(funnel, funnelMat);
      f.frustumCulled = false;
      const s = new THREE.Mesh(spray, sprayMat);
      s.position.y = 0.1;
      const w = new THREE.Mesh(swirl, this.swirlMat);
      w.position.y = 0.08;
      w.frustumCulled = false;
      this.swirls.push(w);
      g.add(f, s);
      // Juovat kiertävät eri tahtia kuin suppilo, joten ne ovat ryhmän rinnalla.
      this.group.add(w);
      g.visible = false;
      this.spouts.push(g);
      this.group.add(g);
    }
    this.group.name = 'spouts';
  }

  /** Vaahtojuovat vain järven vesialueelle (maski tehdään, kun trombi ilmestyy). */
  clipToWater(map: LakeMap): void {
    this.map = map;
  }

  update(dt: number, positions: readonly Vec2[]): void {
    if (this.map && positions.length > 0) {
      const mask = waterMask(this.map);
      this.swirlMat.uniforms.uMask!.value = mask.texture;
      this.swirlMat.uniforms.uMaskBounds!.value = mask.bounds;
      this.map = null;
    }
    this.spin += dt * 2.5;
    this.swirlSpin += dt * SWIRL_SPIN;
    this.spouts.forEach((g, i) => {
      const p = positions[i];
      const w = this.swirls[i]!;
      g.visible = w.visible = p !== undefined;
      if (!p) return;
      g.position.set(p.x, 0, -p.y);
      w.position.set(p.x, w.position.y, -p.y);
      // Pyörre vastapäivään ylhäältä katsottuna.
      g.rotation.y = this.spin;
      w.rotation.y = this.swirlSpin;
    });
  }
}

/**
 * Lennon asento hetkellä k = 0…1: paikka, korkeus (m), kieppuminen pystyakselin
 * ympäri ja kellahtelu (rad). Viimeisellä viidenneksellä kaari kääntyy kohti
 * renkaan todellista paikkaa `actual`, jotta laskeutuminen ei nytkähdä.
 */
export function flightPose(
  f: SpoutFlight,
  k: number,
  actual: Vec2,
): { pos: Vec2; height: number; spin: number; tumble: number } {
  const blend = Math.min(1, Math.max(0, (k - 0.8) / 0.2));
  const to = {
    x: f.to.x + (actual.x - f.to.x) * blend,
    y: f.to.y + (actual.y - f.to.y) * blend,
  };
  const { pos, height } = flightPosition({ from: f.from, to }, k);
  // Pyörre kieputtaa nopeasti nousussa ja hidastuu pudotessa.
  const spin = Math.PI * 7 * Math.sqrt(Math.min(1, Math.max(0, k)));
  return { pos, height, spin, tumble: Math.sin(Math.PI * 2 * k) * 0.9 };
}
