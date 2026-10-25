import * as THREE from 'three';
import type { LakeMap, Vec2 } from '@lunki/shared';
import { toWorld } from '../world/lakeMesh';

/** Usvan kuvion yhden toiston koko ylhäältä (m). */
const PATCH_METERS = 45;
/**
 * Usvavallit ovat kameran ympärillä toistuvassa ruudussa (sivu m), joten
 * niitä riittää kaikkialle järvellä. Lähellä kameraa vallit ohenevat (m).
 */
const BANKS = 56;
const BANK_TILE = 500;
const NEAR_FADE: [number, number] = [8, 35];

/**
 * Läpinäkyvyys tehdään rasterina (osa pikseleistä jää pois), koska
 * puoliläpinäkyvä valkoinen vaihtaisi veden palettivärin harmaaksi.
 */
const BAYER = /* glsl */ `
  float bayer4(vec2 p) {
    int x = int(mod(p.x, 4.0));
    int y = int(mod(p.y, 4.0));
    int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
    return (float(m[x + y * 4]) + 0.5) / 16.0;
  }
`;

const PATCH_VERT = /* glsl */ `
  #include <fog_pars_vertex>
  uniform vec2 uOffset;
  varying vec2 vUv;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vUv = world.xz / ${PATCH_METERS.toFixed(1)} + uOffset;
    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

/** Ylhäältä: ajelehtivia usvalauttoja, joiden reunat on rasteroitu. */
const PATCH_FRAG = /* glsl */ `
  #include <fog_pars_fragment>
  uniform sampler2D uMap;
  uniform float uAmount;
  uniform vec3 uColor;
  varying vec2 vUv;
  ${BAYER}
  void main() {
    float n = texture2D(uMap, vUv).r * 0.7 + texture2D(uMap, vUv * 0.43 + vec2(0.31, 0.77)).r * 0.5;
    float edge = 1.2 - 0.4 * uAmount;
    float a = smoothstep(edge, edge + 0.2, n) * 0.7;
    if (a < bayer4(gl_FragCoord.xy)) discard;
    gl_FragColor = vec4(uColor, 1.0);
    #include <fog_fragment>
  }
`;

const BANK_VERT = /* glsl */ `
  #include <fog_pars_vertex>
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
    #include <fog_vertex>
  }
`;

/**
 * Kalastajan silmin: matalia usvavalleja veden päällä. Usva on tiheintä
 * vedenpinnassa ja ohenee ylöspäin; kameran lähellä vallit häviävät,
 * jottei kuva peity.
 */
const BANK_FRAG = /* glsl */ `
  #include <fog_pars_fragment>
  uniform sampler2D uMap;
  uniform float uAmount;
  uniform vec3 uColor;
  varying vec2 vUv;
  varying float vSeed;
  varying float vDist;
  ${BAYER}
  void main() {
    float n = texture2D(uMap, vec2(vUv.x * 0.6 + vSeed, vUv.y * 0.25 + vSeed * 0.37)).r;
    float a = uAmount * (1.0 - smoothstep(0.25, 1.0, vUv.y));
    a *= smoothstep(0.0, 0.3, vUv.x) * (1.0 - smoothstep(0.7, 1.0, vUv.x));
    a *= 0.65 + 0.9 * n;
    a *= smoothstep(${NEAR_FADE[0].toFixed(1)}, ${NEAR_FADE[1].toFixed(1)}, vDist);
    if (a < bayer4(gl_FragCoord.xy)) discard;
    gl_FragColor = vec4(uColor, 1.0);
    #include <fog_fragment>
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
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uMap: { value: null },
        uOffset: { value: new THREE.Vector2() },
        uAmount: { value: 0 },
        uColor: { value: new THREE.Color(0xc3cbd2) },
      },
    ]),
    depthWrite: false,
    fog: true,
    side: THREE.DoubleSide,
  });
  // UniformsUtils.merge kloonaisi kuvion, joten asetetaan se erikseen.
  material.uniforms.uMap!.value = map;
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

  constructor(
    private readonly isWater: (p: Vec2) => boolean,
    bounds: LakeMap['bounds'],
  ) {
    const map = createMistTexture();
    const { minX, minY, maxX, maxY } = bounds;
    this.patches = new THREE.Mesh(
      new THREE.PlaneGeometry(maxX - minX + 600, maxY - minY + 600),
      mistMaterial(PATCH_VERT, PATCH_FRAG, map),
    );
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
    this.offset.x += (dt * (0.03 + wind.x * 0.05)) / PATCH_METERS;
    this.offset.y -= (dt * (0.01 + wind.y * 0.05)) / PATCH_METERS;
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
