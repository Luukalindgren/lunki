import * as THREE from 'three';
import { PALETTE } from './palette';
import { computeResolution, type RetroResolution } from './resolution';

/** Paletin sävytys (ks. SkyView): (harmaa ↔ väri `sat`) × `mul` + `add`. */
export interface PaletteGrade {
  mul: THREE.Vector3;
  add: THREE.Vector3;
  sat: number;
  /** Usvan väri (sRGB); usvan tiheys tulee kuvan alfakanavasta (ks. MistView). */
  mist?: THREE.Color;
  /** Koko kuva negatiiviksi (salama aivan vieressä). */
  invert?: boolean;
}

export type PaletteMode = 'dither' | 'palette' | 'off';

const FULLSCREEN_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const PALETTE_FRAG = /* glsl */ `
  uniform sampler2D tScene;
  uniform vec3 uPalette[${PALETTE.length}];
  uniform int uMode; // 0 = dither, 1 = paletti, 2 = pois
  uniform float uDitherAmount;
  uniform vec3 uGradeMul;
  uniform vec3 uGradeAdd;
  uniform float uGradeSat;
  uniform vec3 uMist;
  uniform float uInvert;
  varying vec2 vUv;

  // Vuorokaudenaika sävyttää palettivärit vasta pyöristyksen jälkeen, jolloin
  // kuva säilyttää yhtä monta sävyä yölläkin (paletin vaihto).
  vec3 grade(vec3 c) {
    float luma = dot(c, vec3(0.299, 0.587, 0.114));
    return clamp(mix(vec3(luma), c, uGradeSat) * uGradeMul + uGradeAdd, 0.0, 1.0);
  }

  vec3 linearToSrgb(vec3 c) {
    vec3 lo = c * 12.92;
    vec3 hi = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;
    return mix(lo, hi, step(vec3(0.0031308), c));
  }

  float bayer4(vec2 p) {
    int x = int(mod(p.x, 4.0));
    int y = int(mod(p.y, 4.0));
    int i = x + y * 4;
    // 4×4 Bayer-matriisi, arvot 0–15
    int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
    return (float(m[i]) + 0.5) / 16.0 - 0.5;
  }

  vec3 shade(vec4 scene) {
    vec3 c = linearToSrgb(clamp(scene.rgb, 0.0, 1.0));
    // Alfa 0 = taivas (ks. SkyView): se piirretään omina sävyinään ohi paletin,
    // jotta liukuvärit ja pilvet pysyvät pehmeinä. Hieno porrastus pitää
    // ilmeen silti pikselimäisenä.
    if (scene.a < 0.1)
      return uMode == 2 ? c : floor(c * 40.0 + bayer4(gl_FragCoord.xy) + 0.5) / 40.0;
    float mist = clamp((1.0 - scene.a) / 0.8, 0.0, 1.0);
    if (uMode == 2) return mix(grade(c), uMist, mist);
    if (uMode == 0) c += bayer4(gl_FragCoord.xy) * uDitherAmount;
    vec3 best = uPalette[0];
    float bestDist = 1e9;
    for (int i = 0; i < ${PALETTE.length}; i++) {
      vec3 d = uPalette[i] - c;
      float dist = dot(d * d, vec3(0.299, 0.587, 0.114));
      if (dist < bestDist) {
        bestDist = dist;
        best = uPalette[i];
      }
    }
    return mix(grade(best), uMist, mist);
  }

  void main() {
    vec3 c = shade(texture2D(tScene, vUv));
    gl_FragColor = vec4(mix(c, 1.0 - c, uInvert), 1.0);
  }
`;

const NO_GRADE: PaletteGrade = {
  mul: new THREE.Vector3(1, 1, 1),
  add: new THREE.Vector3(0, 0, 0),
  sat: 1,
};

function makeTarget(width: number, height: number, depth: boolean) {
  return new THREE.WebGLRenderTarget(width, height, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: depth,
    generateMipmaps: false,
  });
}

/**
 * Piirtää kohtauksen pieneen render targetiin ja kvantisoi sen pelin palettiin
 * suoraan canvasille, jonka piirtopuskuri on sisäisen resoluution kokoinen.
 * Selain skaalaa canvasin CSS:llä (image-rendering: pixelated)
 * kokonaislukukertoimella koko ruudulle, joten GPU:n työ ei riipu näytön
 * koosta lainkaan: 4K-näytölläkin piirretään vain n. 480×270 pikseliä.
 */
export class RetroRenderer {
  readonly renderer: THREE.WebGLRenderer;
  resolution: RetroResolution = { width: 1, height: 1, scale: 1 };
  paletteMode: PaletteMode = 'palette';

  private readonly sceneTarget = makeTarget(1, 1, true);
  private readonly quadCamera = new THREE.Camera();
  private readonly quad: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly paletteMaterial: THREE.ShaderMaterial;
  private readonly quadScene = new THREE.Scene();
  private readonly listeners = new Set<(r: RetroResolution) => void>();

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(1);
    this.renderer.autoClear = true;
    // Tilastot kerätään koko ruudulta (kolme vaihetta), ei vain viimeisestä.
    this.renderer.info.autoReset = false;

    this.paletteMaterial = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: PALETTE_FRAG,
      uniforms: {
        tScene: { value: this.sceneTarget.texture },
        uPalette: { value: PALETTE.map(([r, g, b]) => new THREE.Vector3(r, g, b)) },
        uMode: { value: 0 },
        uDitherAmount: { value: 0.06 },
        uGradeMul: { value: new THREE.Vector3(1, 1, 1) },
        uGradeAdd: { value: new THREE.Vector3(0, 0, 0) },
        uGradeSat: { value: 1 },
        uMist: { value: new THREE.Color(0xc3cbd2) },
        uInvert: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.paletteMaterial);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);

    window.addEventListener('resize', this.resize);
    this.resize();
  }

  /** Kuuntelee sisäisen resoluution muutoksia (esim. kameran kuvasuhde). */
  onResize(listener: (r: RetroResolution) => void): void {
    this.listeners.add(listener);
    listener(this.resolution);
  }

  /** Muuntaa näytön CSS-pikselin sisäisen resoluution pikseliksi. */
  screenToInternal(x: number, y: number): { x: number; y: number } {
    const dpr = window.devicePixelRatio || 1;
    return {
      x: Math.floor((x * dpr) / this.resolution.scale),
      y: Math.floor((y * dpr) / this.resolution.scale),
    };
  }

  /** `grade` = vuorokaudenajan sävytys; puuttuu = ei sävytystä. */
  render(scene: THREE.Scene, camera: THREE.Camera, grade?: PaletteGrade): void {
    const r = this.renderer;
    const u = this.paletteMaterial.uniforms;
    (u.uGradeMul!.value as THREE.Vector3).copy(grade?.mul ?? NO_GRADE.mul);
    (u.uGradeAdd!.value as THREE.Vector3).copy(grade?.add ?? NO_GRADE.add);
    u.uGradeSat!.value = grade?.sat ?? 1;
    if (grade?.mist) (u.uMist!.value as THREE.Color).copy(grade.mist);
    u.uInvert!.value = grade?.invert ? 1 : 0;
    r.info.reset();
    r.setRenderTarget(this.sceneTarget);
    r.render(scene, camera);

    this.paletteMaterial.uniforms.uMode!.value =
      this.paletteMode === 'dither' ? 0 : this.paletteMode === 'palette' ? 1 : 2;
    r.setRenderTarget(null);
    r.render(this.quadScene, this.quadCamera);
  }

  /**
   * Kääntää kohtauksen varjostimet etukäteen samalle piirtokohteelle kuin
   * render(), jotta ensimmäinen ruutu ei nyi. Selain kääntää ne taustalla,
   * jos se tukee rinnakkaista kääntämistä, muuten heti (#327).
   */
  precompile(scenes: readonly THREE.Scene[], camera: THREE.Camera): Promise<unknown> {
    const r = this.renderer;
    // Ilman laajennusta three.js varoittaisi joka kerta: käännetään silloin heti.
    const compile = r.extensions.has('KHR_parallel_shader_compile')
      ? (scene: THREE.Scene, cam: THREE.Camera) => r.compileAsync(scene, cam)
      : (scene: THREE.Scene, cam: THREE.Camera) => Promise.resolve(r.compile(scene, cam));
    const target = r.getRenderTarget();
    r.setRenderTarget(this.sceneTarget);
    const done = scenes.map((scene) => compile(scene, camera));
    r.setRenderTarget(null);
    done.push(compile(this.quadScene, this.quadCamera));
    r.setRenderTarget(target);
    return Promise.all(done);
  }

  dispose(): void {
    window.removeEventListener('resize', this.resize);
    this.sceneTarget.dispose();
    this.paletteMaterial.dispose();
    this.quad.geometry.dispose();
    this.renderer.dispose();
  }

  private resize = () => {
    const dpr = window.devicePixelRatio || 1;
    const res = computeResolution(window.innerWidth * dpr, window.innerHeight * dpr);
    this.resolution = res;
    this.renderer.setSize(res.width, res.height, false);
    // Yksi sisäinen pikseli = scale näytön fyysistä pikseliä. Canvas voi olla
    // hieman ikkunaa suurempi; ylijäämä leikkautuu oikealta ja alhaalta.
    this.canvas.style.width = `${(res.width * res.scale) / dpr}px`;
    this.canvas.style.height = `${(res.height * res.scale) / dpr}px`;
    this.sceneTarget.setSize(res.width, res.height);
    for (const l of this.listeners) l(res);
  };
}
