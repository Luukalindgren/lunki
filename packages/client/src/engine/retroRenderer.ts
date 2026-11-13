import * as THREE from 'three';
import { LOOK_UNIFORMS, lookDetail, smoothLook, type Look, type LookQuality } from './look';
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
  /** Kaukosumu (m): alku ja loppu usvan värillä; vain perspektiivikameralla. */
  fog?: [number, number] | null;
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
  uniform sampler2D tDepth;
  uniform vec3 uPalette[${PALETTE.length}];
  uniform int uMode; // 0 = dither, 1 = paletti, 2 = pois
  uniform float uDitherAmount;
  uniform vec3 uGradeMul;
  uniform vec3 uGradeAdd;
  uniform float uGradeSat;
  uniform vec3 uMist;
  uniform float uInvert;
  uniform vec2 uFog; // alku ja loppu (m); loppu 0 = ei sumua
  uniform vec2 uCamera; // kameran near ja far
  varying vec2 vUv;

  // Kaukosumu syvyyspuskurista: etäisyys kamerasta katseen suuntaan kuten
  // three.js:n Fog (pehmeä smoothstep alusta loppuun).
  float distanceFog() {
    if (uFog.y <= 0.0) return 0.0;
    float z = texture2D(tDepth, vUv).r;
    float d = uCamera.x * uCamera.y / (uCamera.y - z * (uCamera.y - uCamera.x));
    return smoothstep(uFog.x, uFog.y, d);
  }

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

  vec3 shade(vec4 scene, float fog) {
    vec3 c = linearToSrgb(clamp(scene.rgb, 0.0, 1.0));
    // Alfa 0 = taivas (ks. SkyView): se piirretään omina sävyinään ohi paletin,
    // jotta liukuvärit ja pilvet pysyvät pehmeinä. Hieno porrastus pitää
    // ilmeen silti pikselimäisenä.
    if (scene.a < 0.1)
      return uMode == 2 ? c : floor(c * 40.0 + bayer4(gl_FragCoord.xy) + 0.5) / 40.0;
    // Usva (alfakanava) ja kaukosumu ovat yksi kerros samalla värillä.
    float mist = clamp((1.0 - scene.a) / 0.8, 0.0, 1.0);
    mist = 1.0 - (1.0 - mist) * (1.0 - fog);
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
    vec3 c = shade(texture2D(tScene, vUv), distanceFog());
    gl_FragColor = vec4(mix(c, 1.0 - c, uInvert), 1.0);
  }
`;

/**
 * Reunanpehmennys Terävälle (FXAA): valmiista kuvasta etsitään jyrkät
 * kirkkauserot ja sekoitetaan reunan suuntaan. Tehdään vasta sävytyksen ja
 * usvan jälkeen, koska kohtauksen alfakanava on usvan tiheys eikä sitä voi
 * sekoittaa reunoilla (taivaan ja puun raja näkyisi usvana).
 */
const SMOOTH_FRAG = /* glsl */ `
  uniform sampler2D tImage;
  uniform vec2 uTexel;
  varying vec2 vUv;

  float luma(vec3 c) {
    return dot(c, vec3(0.299, 0.587, 0.114));
  }

  void main() {
    vec3 m = texture2D(tImage, vUv).rgb;
    float lNW = luma(texture2D(tImage, vUv + vec2(-1.0, -1.0) * uTexel).rgb);
    float lNE = luma(texture2D(tImage, vUv + vec2(1.0, -1.0) * uTexel).rgb);
    float lSW = luma(texture2D(tImage, vUv + vec2(-1.0, 1.0) * uTexel).rgb);
    float lSE = luma(texture2D(tImage, vUv + vec2(1.0, 1.0) * uTexel).rgb);
    float lM = luma(m);
    float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
    float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
    if (lMax - lMin < max(0.03, lMax * 0.1)) {
      gl_FragColor = vec4(m, 1.0);
      return;
    }
    vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
    float reduce = max((lNW + lNE + lSW + lSE) * 0.03125, 0.0078125);
    dir = clamp(dir / (min(abs(dir.x), abs(dir.y)) + reduce), -8.0, 8.0) * uTexel;
    vec3 a = 0.5 * (
      texture2D(tImage, vUv + dir * (1.0 / 3.0 - 0.5)).rgb +
      texture2D(tImage, vUv + dir * (2.0 / 3.0 - 0.5)).rgb);
    vec3 b = a * 0.5 + 0.25 * (
      texture2D(tImage, vUv - dir * 0.5).rgb +
      texture2D(tImage, vUv + dir * 0.5).rgb);
    float lB = luma(b);
    gl_FragColor = vec4(lB < lMin || lB > lMax ? a : b, 1.0);
  }
`;

/** Kerros, jolla Terävä piirtää viivat uudelleen (ks. `thickenLines`). */
const LINE_LAYER = 1;

const NO_GRADE: PaletteGrade = {
  mul: new THREE.Vector3(1, 1, 1),
  add: new THREE.Vector3(0, 0, 0),
  sat: 1,
};

/** Kohtauksen kohde; syvyys tekstuurina kaukosumua varten. */
function makeTarget(width: number, height: number) {
  return new THREE.WebGLRenderTarget(width, height, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: true,
    depthTexture: new THREE.DepthTexture(width, height),
    generateMipmaps: false,
  });
}

/**
 * Piirtää kohtauksen pieneen render targetiin ja kvantisoi sen pelin palettiin
 * suoraan canvasille, jonka piirtopuskuri on sisäisen resoluution kokoinen.
 * Selain skaalaa canvasin CSS:llä (image-rendering: pixelated)
 * kokonaislukukertoimella koko ruudulle, joten GPU:n työ ei riipu näytön
 * koosta lainkaan: 4K-näytölläkin piirretään vain n. 480×270 pikseliä.
 *
 * Terävä ilme (#674) piirtää saman kohtauksen näytön omalla tarkkuudella:
 * jokainen sisäinen pikseli on `scale` × `scale` piirrettyä kuvapistettä,
 * paletti jää pois ja reunat pehmennetään. `resolution` on kummassakin
 * ilmeessä sama sisäinen tarkkuus, joten kamerat, merkit ja HUD eivät tiedä
 * ilmeestä.
 *
 * Moderni (#650) piirtää kuten Terävä, ja laadun mukaan näytön tarkkuutta
 * tarkemmin (`lookDetail`): selain pienentää kuvan näytölle, jolloin reunat
 * pehmenevät. Monen näytteen puskuria ei käytetä, koska kohtauksen
 * alfakanava on usvan tiheys ja sekoittuisi reunoilla.
 */
export class RetroRenderer {
  readonly renderer: THREE.WebGLRenderer;
  /** Sisäinen (retron) tarkkuus: näkymän rajaus ja merkkien koko lasketaan tästä. */
  resolution: RetroResolution = { width: 1, height: 1, scale: 1 };
  paletteMode: PaletteMode = 'palette';

  private currentLook: Look = 'retro';
  private currentQuality: LookQuality = 'high';
  private readonly sceneTarget = makeTarget(1, 1);
  /** Terävän valmis kuva ennen reunanpehmennystä. */
  private readonly imageTarget = new THREE.WebGLRenderTarget(1, 1, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    generateMipmaps: false,
  });
  private readonly smoothMaterial: THREE.ShaderMaterial;
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
        tDepth: { value: this.sceneTarget.depthTexture },
        uPalette: { value: PALETTE.map(([r, g, b]) => new THREE.Vector3(r, g, b)) },
        uMode: { value: 0 },
        uDitherAmount: { value: 0.06 },
        uGradeMul: { value: new THREE.Vector3(1, 1, 1) },
        uGradeAdd: { value: new THREE.Vector3(0, 0, 0) },
        uGradeSat: { value: 1 },
        uMist: { value: new THREE.Color(0xc3cbd2) },
        uInvert: { value: 0 },
        uFog: { value: new THREE.Vector2() },
        uCamera: { value: new THREE.Vector2(0.1, 1000) },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.smoothMaterial = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: SMOOTH_FRAG,
      uniforms: {
        tImage: { value: this.imageTarget.texture },
        uTexel: { value: new THREE.Vector2(1, 1) },
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

  get look(): Look {
    return this.currentLook;
  }

  /** Vaihtaa ilmeen; sisäinen tarkkuus ei muutu, vain piirron tarkkuus ja paletti. */
  setLook(look: Look): void {
    if (look === this.currentLook) return;
    this.currentLook = look;
    this.paletteMode = smoothLook(look) ? 'off' : 'palette';
    this.resize();
  }

  get quality(): LookQuality {
    return this.currentQuality;
  }

  /** Modernin laatutaso: piirron tarkkuus muuttuu heti. */
  setQuality(quality: LookQuality): void {
    if (quality === this.currentQuality) return;
    this.currentQuality = quality;
    this.resize();
  }

  /** Piirretyn kuvan koko kuvapisteinä (Terävällä näytön tarkkuus, Modernilla laadun mukaan). */
  get renderSize(): { width: number; height: number } {
    const detail = LOOK_UNIFORMS.uLookDetail.value;
    return { width: this.resolution.width * detail, height: this.resolution.height * detail };
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
    const fog = u.uFog!.value as THREE.Vector2;
    if (grade?.fog && camera instanceof THREE.PerspectiveCamera) {
      fog.set(grade.fog[0], grade.fog[1]);
      (u.uCamera!.value as THREE.Vector2).set(camera.near, camera.far);
    } else fog.set(0, 0);
    r.info.reset();
    r.setRenderTarget(this.sceneTarget);
    r.render(scene, camera);
    this.thickenLines(scene, camera);

    this.paletteMaterial.uniforms.uMode!.value =
      this.paletteMode === 'dither' ? 0 : this.paletteMode === 'palette' ? 1 : 2;
    // Terävä ja Moderni: valmis kuva välikohteeseen ja siitä reunat pehmennettyinä ruudulle.
    const smooth = smoothLook(this.currentLook);
    this.quad.material = this.paletteMaterial;
    r.setRenderTarget(smooth ? this.imageTarget : null);
    r.render(this.quadScene, this.quadCamera);
    if (smooth) {
      this.quad.material = this.smoothMaterial;
      r.setRenderTarget(null);
      r.render(this.quadScene, this.quadCamera);
    }
  }

  /**
   * Viivat (siima, vapa, tähtäin, sade) ovat WebGL:ssä aina yhden kuvapisteen
   * levyisiä. Terävällä ne piirretään uudelleen kuvapisteen verran siirrettyinä,
   * kunnes viiva on sisäisen pikselin levyinen kuten Retrossa: muuten vierekkäin
   * piirretyt viivat (vapa) jäävät raidallisiksi ja siima katoaa isolla näytöllä.
   */
  private thickenLines(scene: THREE.Scene, camera: THREE.Camera): void {
    const detail = LOOK_UNIFORMS.uLookDetail.value;
    if (detail <= 1) return;
    if (!(camera instanceof THREE.PerspectiveCamera || camera instanceof THREE.OrthographicCamera))
      return;
    let lines = false;
    scene.traverseVisible((o) => {
      if (!(o as THREE.Line).isLine) return;
      o.layers.enable(LINE_LAYER);
      lines = true;
    });
    if (!lines) return;
    const r = this.renderer;
    const { width, height } = this.renderSize;
    const mask = camera.layers.mask;
    camera.layers.set(LINE_LAYER);
    // Taustaväri tyhjentäisi kuvan joka piirrolla.
    const background = scene.background;
    scene.background = null;
    r.autoClear = false;
    const first = -Math.floor((detail - 1) / 2);
    for (let k = first; k < first + detail; k++) {
      if (k === 0) continue;
      camera.setViewOffset(width, height, k, 0, width, height);
      r.render(scene, camera);
      camera.setViewOffset(width, height, 0, k, width, height);
      r.render(scene, camera);
    }
    camera.clearViewOffset();
    scene.background = background;
    camera.layers.mask = mask;
    r.autoClear = true;
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
    this.quad.material = this.paletteMaterial;
    done.push(compile(this.quadScene, this.quadCamera));
    r.setRenderTarget(target);
    return Promise.all(done);
  }

  dispose(): void {
    window.removeEventListener('resize', this.resize);
    this.sceneTarget.depthTexture?.dispose();
    this.sceneTarget.dispose();
    this.imageTarget.dispose();
    this.smoothMaterial.dispose();
    this.paletteMaterial.dispose();
    this.quad.geometry.dispose();
    this.renderer.dispose();
  }

  private resize = () => {
    const dpr = window.devicePixelRatio || 1;
    const res = computeResolution(window.innerWidth * dpr, window.innerHeight * dpr);
    this.resolution = res;
    const sharp = smoothLook(this.currentLook);
    // Terävä piirtää jokaisen sisäisen pikselin `scale` × `scale` kuvapisteenä,
    // jolloin kuva on näytön tarkkuudella ja rajaus täsmälleen sama kuin Retrossa.
    const detail = lookDetail(this.currentLook, this.currentQuality, res);
    LOOK_UNIFORMS.uLookSharp.value = sharp ? 1 : 0;
    LOOK_UNIFORMS.uLookModern.value = this.currentLook === 'modern' ? 1 : 0;
    LOOK_UNIFORMS.uLookDetail.value = detail;
    // Näyttöä tarkempi kuva pienennetään sileästi, muuten pikselit pysyvät terävinä.
    this.canvas.style.imageRendering = detail > res.scale ? 'auto' : '';
    const width = res.width * detail;
    const height = res.height * detail;
    this.renderer.setSize(width, height, false);
    // Yksi sisäinen pikseli = scale näytön fyysistä pikseliä. Canvas voi olla
    // hieman ikkunaa suurempi; ylijäämä leikkautuu oikealta ja alhaalta.
    this.canvas.style.width = `${(res.width * res.scale) / dpr}px`;
    this.canvas.style.height = `${(res.height * res.scale) / dpr}px`;
    this.sceneTarget.setSize(width, height);
    // Välikohde vie muistia vain Terävällä.
    this.imageTarget.setSize(sharp ? width : 1, sharp ? height : 1);
    (this.smoothMaterial.uniforms.uTexel!.value as THREE.Vector2).set(1 / width, 1 / height);
    for (const l of this.listeners) l(res);
  };
}
