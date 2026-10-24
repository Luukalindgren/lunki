import * as THREE from 'three';
import { PALETTE } from './palette';
import { computeResolution, type RetroResolution } from './resolution';

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
  varying vec2 vUv;

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

  void main() {
    vec3 c = linearToSrgb(clamp(texture2D(tScene, vUv).rgb, 0.0, 1.0));
    if (uMode == 2) {
      gl_FragColor = vec4(c, 1.0);
      return;
    }
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
    gl_FragColor = vec4(best, 1.0);
  }
`;

const BLIT_FRAG = /* glsl */ `
  uniform sampler2D tSource;
  uniform vec2 uSourceSize;
  uniform float uScale;
  uniform float uScreenHeight;
  void main() {
    // Ylävasen kulma ankkurina: sisäinen pikseli = uScale × uScale näytön pikseliä.
    vec2 frag = vec2(gl_FragCoord.x, uScreenHeight - gl_FragCoord.y);
    vec2 px = floor(frag / uScale);
    vec2 uv = (px + 0.5) / uSourceSize;
    uv.y = 1.0 - uv.y;
    gl_FragColor = texture2D(tSource, uv);
  }
`;

function makeTarget(width: number, height: number, depth: boolean) {
  return new THREE.WebGLRenderTarget(width, height, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: depth,
    generateMipmaps: false,
  });
}

/**
 * Piirtää kohtauksen pieneen render targetiin, kvantisoi sen pelin palettiin
 * ja skaalaa lopuksi kokonaislukukertoimella koko ruudulle. Paletin haku tehdään
 * pienessä resoluutiossa, joten raskain osa ei riipu näytön koosta.
 */
export class RetroRenderer {
  readonly renderer: THREE.WebGLRenderer;
  resolution: RetroResolution = { width: 1, height: 1, scale: 1 };
  paletteMode: PaletteMode = 'palette';

  private readonly sceneTarget = makeTarget(1, 1, true);
  private readonly paletteTarget = makeTarget(1, 1, false);
  private readonly quadCamera = new THREE.Camera();
  private readonly quad: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly paletteMaterial: THREE.ShaderMaterial;
  private readonly blitMaterial: THREE.ShaderMaterial;
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

    this.paletteMaterial = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: PALETTE_FRAG,
      uniforms: {
        tScene: { value: this.sceneTarget.texture },
        uPalette: { value: PALETTE.map(([r, g, b]) => new THREE.Vector3(r, g, b)) },
        uMode: { value: 0 },
        uDitherAmount: { value: 0.06 },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.blitMaterial = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: BLIT_FRAG,
      uniforms: {
        tSource: { value: this.paletteTarget.texture },
        uSourceSize: { value: new THREE.Vector2(1, 1) },
        uScale: { value: 1 },
        uScreenHeight: { value: 1 },
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

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    const r = this.renderer;
    r.setRenderTarget(this.sceneTarget);
    r.render(scene, camera);

    this.paletteMaterial.uniforms.uMode!.value =
      this.paletteMode === 'dither' ? 0 : this.paletteMode === 'palette' ? 1 : 2;
    this.quad.material = this.paletteMaterial;
    r.setRenderTarget(this.paletteTarget);
    r.render(this.quadScene, this.quadCamera);

    this.quad.material = this.blitMaterial;
    r.setRenderTarget(null);
    r.render(this.quadScene, this.quadCamera);
  }

  dispose(): void {
    window.removeEventListener('resize', this.resize);
    this.sceneTarget.dispose();
    this.paletteTarget.dispose();
    this.paletteMaterial.dispose();
    this.blitMaterial.dispose();
    this.quad.geometry.dispose();
    this.renderer.dispose();
  }

  private resize = () => {
    const dpr = window.devicePixelRatio || 1;
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;
    const screenW = Math.floor(cssW * dpr);
    const screenH = Math.floor(cssH * dpr);
    this.renderer.setSize(screenW, screenH, false);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;

    const res = computeResolution(screenW, screenH);
    this.resolution = res;
    this.sceneTarget.setSize(res.width, res.height);
    this.paletteTarget.setSize(res.width, res.height);
    const u = this.blitMaterial.uniforms;
    (u.uSourceSize!.value as THREE.Vector2).set(res.width, res.height);
    u.uScale!.value = res.scale;
    u.uScreenHeight!.value = screenH;
    for (const l of this.listeners) l(res);
  };
}
