import * as THREE from 'three';
import type { LakeMap, Vec2 } from '@lunki/shared';
import { toWorld, type WaterWaves } from '../world/lakeMesh';

/** Usvalauttojen tyypillinen koko ylhäältä (m). */
const PATCH_METERS = 120;
/**
 * Usvavallit ovat kameran ympärillä toistuvassa ruudussa (sivu m), joten
 * niitä riittää kaikkialle järvellä. Lähellä kameraa vallit ohenevat (m).
 */
const BANKS = 56;
const BANK_TILE = 500;
const NEAR_FADE: [number, number] = [8, 35];

/**
 * Usva ei piirrä värejä: se kirjoittaa tiheytensä kuvan alfakanavaan, ja
 * jälkikäsittely sekoittaa usvan värin vasta palettiin pyöristämisen
 * jälkeen (ks. RetroRenderer). Näin usva on pehmeä verho eikä vaihda
 * veden palettiväriä harmaaksi.
 */
const PATCH_VERT = /* glsl */ `
  uniform vec2 uOffset;
  varying vec2 vWorld;
  varying vec2 vMap;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xz - uOffset;
    vMap = vec2(world.x, -world.z);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

/**
 * Ylhäältä: ajelehtivia, epäsäännöllisiä usvalauttoja. Kuvio lasketaan
 * kohinasta maailman koordinaateista, joten se ei toistu ruutuina. Usva
 * pysyy veden päällä: vesimaskin sumennettu kanava (ks. lakeMesh) häivyttää
 * sen rannalla, ja reuna ulottuu muutaman metrin rantaniitylle.
 */
const PATCH_FRAG = /* glsl */ `
  uniform float uAmount;
  uniform sampler2D uWaterMask;
  uniform vec4 uWaterMaskBounds;
  varying vec2 vWorld;
  varying vec2 vMap;
  float mistHash(vec2 p) {
    // Ilman sin()-funktiota, jottei kuvio nauhoitu puhelinten GPU:illa.
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float mistNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mistHash(i), mistHash(i + vec2(1.0, 0.0)), u.x),
      mix(mistHash(i + vec2(0.0, 1.0)), mistHash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }
  float mistFbm(vec2 p) {
    float sum = 0.0;
    float amp = 0.5;
    for (int k = 0; k < 5; k++) {
      sum += amp * mistNoise(p);
      p = mat2(1.6, 1.2, -1.2, 1.6) * p + vec2(3.1, 1.7);
      amp *= 0.5;
    }
    return sum;
  }
  void main() {
    vec2 p = vWorld / ${PATCH_METERS.toFixed(1)};
    // Vääristetty kohina tekee lautoista pilvimäisiä eikä pyöreitä läikkiä.
    vec2 warp = vec2(mistFbm(p * 0.5), mistFbm(p * 0.5 + vec2(5.2, 1.3)));
    float n = mistFbm(p + 1.6 * warp);
    float edge = 0.66 - 0.16 * uAmount;
    // Ohut verho: vesi, viehe ja kalat näkyvät paksuimmankin usvan läpi.
    float a = smoothstep(edge, edge + 0.22, n) * 0.45;
    a *= smoothstep(0.15, 0.6, texture2D(uWaterMask, (vMap - uWaterMaskBounds.xy) / uWaterMaskBounds.zw).g);
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0 - 0.8 * a);
  }
`;

const BANK_VERT = /* glsl */ `
  attribute float aSeed;
  varying vec2 vUv;
  varying float vSeed;
  varying float vDist;
  void main() {
    vUv = uv;
    vSeed = aSeed;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vDist = -mvPosition.z;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

/**
 * Kalastajan silmin: matalia usvavalleja veden päällä. Usva on tiheintä
 * vedenpinnassa ja ohenee ylöspäin; kameran lähellä vallit häviävät,
 * jottei kuva peity.
 */
const BANK_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uAmount;
  varying vec2 vUv;
  varying float vSeed;
  varying float vDist;
  void main() {
    float n = texture2D(uMap, vec2(vUv.x * 0.6 + vSeed, vUv.y * 0.25 + vSeed * 0.37)).r;
    float a = uAmount * (1.0 - smoothstep(0.25, 1.0, vUv.y));
    a *= smoothstep(0.0, 0.3, vUv.x) * (1.0 - smoothstep(0.7, 1.0, vUv.x));
    a *= 0.65 + 0.9 * n;
    a *= smoothstep(${NEAR_FADE[0].toFixed(1)}, ${NEAR_FADE[1].toFixed(1)}, vDist);
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0 - 0.8 * clamp(a * 0.7, 0.0, 0.85));
  }
`;

/** Pehmeitä läikkiä saumattomasti toistuvaan kuvioon. */
function createMistTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  let seed = 23;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 46; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 10 + rand() * 26;
    // Piirretään yhdeksään kohtaan, jotta kuvio jatkuu reunojen yli.
    for (const ox of [-size, 0, size])
      for (const oy of [-size, 0, size]) {
        const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        g.addColorStop(0, 'rgba(255,255,255,0.45)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function mistMaterial(vertexShader: string, fragmentShader: string, map: THREE.Texture) {
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uMap: { value: map },
      uOffset: { value: new THREE.Vector2() },
      uAmount: { value: 0 },
    },
    depthWrite: false,
    transparent: true,
    side: THREE.DoubleSide,
    // Värit jäävät ennalleen; alfaan jää paksuimman usvan arvo (1 - 0,8 × tiheys).
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.ZeroFactor,
    blendDst: THREE.OneFactor,
    blendEquationAlpha: THREE.MinEquation,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneFactor,
  });
  return material;
}

/**
 * Usva järvellä: ylhäältä ajelehtivina lauttoina, kalastajan silmin
 * matalina valleina, joiden takaa vastaranta näkyy himmeänä.
 */
export class MistView {
  readonly group = new THREE.Group();
  private readonly patches: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly banks = new THREE.Group();
  private readonly bankMaterial: THREE.ShaderMaterial;
  private readonly offset: THREE.Vector2;
  /** Vallien paikat ruudun sisällä (m) ja onko valli nyt veden päällä. */
  private readonly bankBase: Vec2[] = [];

  /** `waterMask` = vesimaskin uniformit (createWaterWaves, täyttyy createSwellPatchissa). */
  constructor(
    private readonly isWater: (p: Vec2) => boolean,
    bounds: LakeMap['bounds'],
    waterMask: Pick<WaterWaves, 'uWaterMask' | 'uWaterMaskBounds'>,
  ) {
    const map = createMistTexture();
    const { minX, minY, maxX, maxY } = bounds;
    this.patches = new THREE.Mesh(
      new THREE.PlaneGeometry(maxX - minX + 600, maxY - minY + 600),
      mistMaterial(PATCH_VERT, PATCH_FRAG, map),
    );
    Object.assign(this.patches.material.uniforms, {
      uWaterMask: waterMask.uWaterMask,
      uWaterMaskBounds: waterMask.uWaterMaskBounds,
    });
    this.patches.rotation.x = -Math.PI / 2;
    this.patches.position.copy(toWorld({ x: (minX + maxX) / 2, y: (minY + maxY) / 2 }, 0.3));
    this.patches.renderOrder = 1;
    this.offset = this.patches.material.uniforms.uOffset!.value as THREE.Vector2;

    this.bankMaterial = mistMaterial(BANK_VERT, BANK_FRAG, map);
    let seed = 77;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < BANKS; i++) {
      this.bankBase.push({ x: rand() * BANK_TILE, y: rand() * BANK_TILE });
      const width = 30 + rand() * 50;
      const height = 6 + rand() * 8;
      const g = new THREE.PlaneGeometry(width, height);
      g.translate(0, height / 2, 0);
      const s = rand() * 10;
      g.setAttribute('aSeed', new THREE.Float32BufferAttribute([s, s, s, s], 1));
      const bank = new THREE.Mesh(g, this.bankMaterial);
      bank.position.set(NaN, 0, NaN);
      bank.renderOrder = 1;
      this.banks.add(bank);
    }
    this.group.add(this.patches, this.banks);
    this.group.name = 'mist';
  }

  /** `amount` = usvan määrä 0–1; usva ajelehtii hitaasti tuulen `wind` (m/s) mukana. */
  update(dt: number, amount: number, wind: Vec2, pov: boolean): void {
    this.offset.x += dt * (0.3 + wind.x * 0.5);
    this.offset.y -= dt * (0.1 + wind.y * 0.5);
    this.group.visible = amount > 0.02;
    this.patches.visible = !pov;
    this.banks.visible = pov;
    this.patches.material.uniforms.uAmount!.value = amount;
    this.bankMaterial.uniforms.uAmount!.value = amount;
  }

  /**
   * Vallit siirtyvät kameran mukana (ruudun yli mennyt valli tulee vastakkaiselta
   * reunalta) ja kääntyvät kameraan päin. Vain veden päällä olevat näkyvät.
   */
  follow(camera: THREE.Vector3): void {
    const wrap = (base: number, at: number) =>
      base + Math.round((at - base) / BANK_TILE) * BANK_TILE;
    this.banks.children.forEach((bank, i) => {
      const base = this.bankBase[i]!;
      const x = wrap(base.x, camera.x);
      const z = wrap(base.y, camera.z);
      if (x !== bank.position.x || z !== bank.position.z) {
        bank.position.set(x, 0, z);
        bank.visible = this.isWater({ x, y: -z });
      }
      bank.rotation.y = Math.atan2(camera.x - x, camera.z - z);
    });
  }
}
