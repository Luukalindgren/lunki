import * as THREE from 'three';
import { moonAt, sunAt, type CelestialPosition, type Vec2 } from '@lunki/shared';

/**
 * Jälkikäsittelyn sävytys palettiin pyöristämisen jälkeen: väri =
 * (harmaa ↔ väri `sat`) × `mul` + `add`. Valaistusta ei himmennetä yöksi,
 * koska paletissa tummat sävyt sulautuisivat yhteen ja vihertyisivät;
 * sävytys vaihtaa koko paletin yön tai illan sävyihin kuten vanhoissa peleissä.
 * Taivas jää sävytyksen ja paletin ulkopuolelle (ks. RetroRenderer).
 */
export interface Grade {
  mul: THREE.Vector3;
  add: THREE.Vector3;
  sat: number;
  /** Usvan väri sRGB-arvoina (ks. MistView). */
  mist: THREE.Color;
  /** Salama aivan vieressä: kuva kääntyy hetkeksi negatiiviksi. */
  invert: boolean;
}

export const neutralGrade = (): Grade => ({
  mul: new THREE.Vector3(1, 1, 1),
  add: new THREE.Vector3(0, 0, 0),
  sat: 1,
  mist: new THREE.Color().setHex(0xc3cbd2, THREE.LinearSRGBColorSpace),
  invert: false,
});

type Rgb = [number, number, number];

/** Vuorokaudenajan ilme yhdellä hetkellä; hetkien välillä arvot liukuvat. */
interface Look {
  /** Taivaan liukuväri: zeniitti, keskikorkeus ja taivaanranta. */
  zenith: number;
  mid: number;
  horizon: number;
  /** Hehku auringon tai kuun ympärillä: sisin ja uloin väri. */
  glowIn: number;
  glowOut: number;
  glowAmount: number;
  /** Hehkun leveys (suurempi = laajempi). */
  glowSize: number;
  /** Pilvet: aurinkoon päin valaistu ja varjon puoli sekä pilvisyys 0–1 selkeällä säällä. */
  cloudLit: number;
  cloudShade: number;
  clouds: number;
  mul: Rgb;
  add: Rgb;
  sat: number;
  /** POV-näkymän sumu (m): alku ja loppu. */
  fog: [number, number];
  /** Usva vedenpinnalla 0–1. */
  mist: number;
  /** Tähtien kirkkaus 0–1. */
  stars: number;
  /** Ympäristövalon ja suoran valon kertoimet. */
  ambient: number;
  direct: number;
  /** Auringon tai kuun kimallus vedessä: väri ja voimakkuus. */
  glitter: number;
  glitterAmount: number;
}

const DAY: Look = {
  zenith: 0x2a6fb0,
  mid: 0x5d9fd6,
  horizon: 0xb4dbee,
  glowIn: 0xfffbe8,
  glowOut: 0xd6eefa,
  glowAmount: 0.5,
  glowSize: 0.03,
  cloudLit: 0xffffff,
  cloudShade: 0xa4b2c4,
  clouds: 0.35,
  mul: [1, 1, 1],
  add: [0, 0, 0],
  sat: 1,
  fog: [500, 2600],
  mist: 0,
  stars: 0,
  ambient: 1,
  direct: 1,
  glitter: 0xfff3b0,
  glitterAmount: 0.5,
};

/** Vuorokauden hetkiä; niiden välillä ilme liukuu pelikellon mukaan. */
const DAWN: Look = {
  // Sarastus: aurinko vielä horisontin alla, viimeiset tähdet ja paksu usva.
  zenith: 0x24406e,
  mid: 0x7b87b4,
  horizon: 0xf2c4a8,
  glowIn: 0xffeec0,
  glowOut: 0xf3a27a,
  glowAmount: 1,
  glowSize: 0.22,
  cloudLit: 0xffc4a4,
  cloudShade: 0x5e6286,
  clouds: 0.2,
  mul: [0.86, 0.86, 1],
  add: [0.06, 0.05, 0.1],
  sat: 0.75,
  fog: [40, 700],
  mist: 1,
  stars: 0.35,
  ambient: 0.9,
  direct: 0.5,
  glitter: 0xfff3b0,
  glitterAmount: 1,
};

const SUNRISE: Look = {
  // Aurinko noussut: lämmin aamuvalo, usva hälvenee.
  zenith: 0x3474b4,
  mid: 0x88b6dc,
  horizon: 0xf4e0c4,
  glowIn: 0xfffbe0,
  glowOut: 0xf8d49c,
  glowAmount: 0.85,
  glowSize: 0.12,
  cloudLit: 0xfff2dc,
  cloudShade: 0x9ea6ba,
  clouds: 0.3,
  mul: [1.08, 1, 0.88],
  add: [0.03, 0.02, 0],
  sat: 1.05,
  fog: [250, 1900],
  mist: 0.3,
  stars: 0,
  ambient: 1,
  direct: 0.9,
  glitter: 0xfff3b0,
  glitterAmount: 1,
};

const GOLDEN: Look = {
  // Kultainen tunti: aurinko matalalla lännessä, maisema kellertävän ruskea,
  // taivaanranta kultainen ja pilvet hunajaisia.
  zenith: 0x3a6696,
  mid: 0x9aa8b0,
  horizon: 0xf2c47c,
  glowIn: 0xfff0b4,
  glowOut: 0xf0a44a,
  glowAmount: 1.05,
  glowSize: 0.2,
  cloudLit: 0xffcc78,
  cloudShade: 0x8a7464,
  clouds: 0.35,
  mul: [1.18, 0.95, 0.84],
  add: [0.05, 0.02, 0],
  sat: 1.12,
  fog: [400, 2400],
  mist: 0,
  stars: 0,
  ambient: 1,
  direct: 0.9,
  glitter: 0xf6d04d,
  glitterAmount: 1,
};

const SUNSET: Look = {
  // Auringonlasku: oranssi hehku, punertava taivaanranta ja hehkuvat pilvet.
  zenith: 0x263a74,
  mid: 0x866496,
  horizon: 0xf0864c,
  glowIn: 0xfff0a0,
  glowOut: 0xee5c2c,
  glowAmount: 1.2,
  glowSize: 0.3,
  cloudLit: 0xff8c5a,
  cloudShade: 0x563c5c,
  clouds: 0.4,
  // Sininen kanava jätetään riittävän vahvaksi, ettei järvi muutu vihreäksi.
  mul: [1.12, 0.8, 0.74],
  add: [0.06, 0.02, 0.04],
  sat: 1.05,
  fog: [300, 2000],
  mist: 0.1,
  stars: 0,
  ambient: 0.95,
  direct: 0.6,
  glitter: 0xf08a2c,
  glitterAmount: 1,
};

const DUSK: Look = {
  // Hämärä: aurinko laskenut, taivaanrannassa punainen juova, tähdet syttyvät.
  zenith: 0x0c1836,
  mid: 0x282e5e,
  horizon: 0x9c3e4e,
  glowIn: 0xee7c40,
  glowOut: 0x9a2e40,
  glowAmount: 0.85,
  glowSize: 0.25,
  cloudLit: 0xb85a6a,
  cloudShade: 0x26223c,
  clouds: 0.3,
  mul: [0.58, 0.52, 0.74],
  add: [0.04, 0.02, 0.08],
  sat: 0.75,
  fog: [200, 1600],
  mist: 0.45,
  stars: 0.6,
  ambient: 0.9,
  direct: 0.3,
  glitter: 0xd23a2a,
  glitterAmount: 0.6,
};

const NIGHT: Look = {
  // Kuutamo: tähtitaivas, kuu kaakossa ja kuun silta järvellä.
  zenith: 0x040916,
  mid: 0x0c1834,
  horizon: 0x203252,
  glowIn: 0xc8d8f0,
  glowOut: 0x34507e,
  glowAmount: 1,
  glowSize: 0.05,
  cloudLit: 0x8496b8,
  cloudShade: 0x121a2e,
  clouds: 0.2,
  mul: [0.56, 0.68, 0.96],
  add: [0.01, 0.02, 0.06],
  sat: 0.5,
  fog: [150, 1400],
  mist: 0.35,
  stars: 1,
  ambient: 0.9,
  direct: 0.8,
  glitter: 0xeef2f3,
  glitterAmount: 0.8,
};

/**
 * Ilmeet pelikellon mukaan (tunti, ilme). Hetket on sovitettu kisapäivän
 * aurinkoon (ks. sunAt): aurinko nousee noin 5.55 ja laskee noin 21.00.
 */
export const LOOKS: [number, Look][] = [
  [0, NIGHT],
  [3.3, NIGHT],
  [4.75, DAWN],
  [7, SUNRISE],
  [9.5, DAY],
  [16.5, DAY],
  [19, GOLDEN],
  [20.9, SUNSET],
  [21.9, DUSK],
  [23, NIGHT],
  [24, NIGHT],
];

/**
 * Salaman välähdys sävyttää koko kuvan (paletin jälkeen) kirkkaaksi ja
 * kylmäksi: muodot ja itse salama näkyvät, eikä kuva peity valkoiseen.
 */
const FLASH_MUL: Rgb = [1.45, 1.5, 1.6];
const FLASH_ADD: Rgb = [0.1, 0.11, 0.14];
const FLASH_SAT = 0.55;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Pilvisen sään taivas: vuorokaudenajan taivaanranta harmaana (yöllä tumma,
 * päivällä vaalea), ja mitä synkempi sää, sitä tummempi.
 */
function overcastColor(look: Look, darkness: number): THREE.Color {
  const c = new THREE.Color(look.horizon);
  const lum = 0.75 * (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b);
  return new THREE.Color(lum * 0.94, lum, lum * 1.08)
    .lerp(c, 0.15)
    .multiplyScalar(1 - 0.85 * smoothstep(0.3, 0.8, darkness));
}

/** Suunta taivaalle Three.js-maailmassa (y ylös, z = -pohjoinen). */
export function skyDirection(p: CelestialPosition, out = new THREE.Vector3()): THREE.Vector3 {
  const c = Math.cos(p.elevation);
  return out.set(c * Math.cos(p.azimuth), Math.sin(p.elevation), -c * Math.sin(p.azimuth));
}

const COLOR_KEYS = [
  'zenith',
  'mid',
  'horizon',
  'glowIn',
  'glowOut',
  'cloudLit',
  'cloudShade',
  'glitter',
] as const;
const NUMBER_KEYS = [
  'glowAmount',
  'glowSize',
  'clouds',
  'sat',
  'mist',
  'stars',
  'ambient',
  'direct',
  'glitterAmount',
] as const;

/** Ilmeiden numeroarvot liukuvat; värit sekoitetaan lineaarisessa tilassa. */
function blend(a: Look, b: Look, t: number): Look {
  const out = { ...a };
  for (const k of COLOR_KEYS)
    out[k] = new THREE.Color(a[k]).lerp(new THREE.Color(b[k]), t).getHex();
  for (const k of NUMBER_KEYS) out[k] = lerp(a[k], b[k], t);
  const mixRgb = (x: Rgb, y: Rgb) => x.map((v, i) => lerp(v, y[i]!, t)) as Rgb;
  out.mul = mixRgb(a.mul, b.mul);
  out.add = mixRgb(a.add, b.add);
  out.fog = [lerp(a.fog[0], b.fog[0], t), lerp(a.fog[1], b.fog[1], t)];
  return out;
}

/** Ilme pelikellon aikaan `hours` (0–24). */
export function lookAt(hours: number): Look {
  const h = ((hours % 24) + 24) % 24;
  for (let i = 1; i < LOOKS.length; i++) {
    const [h1, b] = LOOKS[i]!;
    const [h0, a] = LOOKS[i - 1]!;
    if (h <= h1) return h1 === h0 ? b : blend(a, b, (h - h0) / (h1 - h0));
  }
  return LOOKS[LOOKS.length - 1]![1];
}

const DOME_RADIUS = 2800;
/** Auringon ja kuun kiekon säde (rad); liioiteltu, jotta ne erottuvat pienestä kuvasta. */
const SUN_RADIUS = 0.024;
const MOON_RADIUS = 0.02;

const DOME_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * Taivas: pehmeä liukuväri, auringon tai kuun hehku, tuikkivat tähdet,
 * aurinko, kuu ja tuulen mukana ajelehtivat pilvet. Taivas piirretään
 * paletin ohi (alfa 0 = taivas, ks. RetroRenderer), jotta liukuvärit ja
 * pilvet eivät hajoa pisteiksi.
 */
const DOME_FRAG = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uMid;
  uniform vec3 uHorizon;
  uniform vec3 uGlowIn;
  uniform vec3 uGlowOut;
  uniform vec3 uGlowDir;
  uniform float uGlowAmount;
  uniform float uGlowSize;
  uniform vec3 uSunDir;
  uniform float uSun;
  uniform vec3 uMoonDir;
  uniform float uMoon;
  uniform float uStars;
  uniform float uTime;
  uniform vec2 uCloudOffset;
  uniform float uClouds;
  uniform vec3 uCloudLit;
  uniform vec3 uCloudShade;
  uniform float uFlash;
  varying vec3 vDir;

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float hash13(vec3 p3) {
    p3 = fract(p3 * 0.1031);
    p3 += dot(p3, p3.zyx + 31.32);
    return fract((p3.x + p3.y) * p3.z);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
               mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p = p * 2.03 + vec2(1.7, 9.2);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 d = normalize(vDir);
    float h = max(d.y, 0.0);
    vec3 c = mix(uHorizon, uMid, smoothstep(0.0, 0.22, h));
    c = mix(c, uZenith, smoothstep(0.18, 0.75, h));

    // Hehku leviää taivaanrantaa pitkin enemmän kuin ylöspäin.
    float toGlow = dot(d, uGlowDir);
    float spread = exp((toGlow - 1.0) / max(uGlowSize, 1e-3));
    float low = 1.0 - smoothstep(0.0, 0.45, h) * 0.75;
    float g = uGlowAmount * spread * low;
    c = mix(c, uGlowOut, clamp(g, 0.0, 1.0));
    c = mix(c, uGlowIn, clamp(g * g * 0.9, 0.0, 1.0));

    // Tähdet: satunnaisia pisteitä suuntaruudukossa, tuikkivat hiljalleen.
    if (uStars > 0.0 && d.y > 0.03) {
      vec3 sp = d * 160.0;
      vec3 cell = floor(sp);
      float r = hash13(cell);
      if (r > 0.93) {
        vec3 starPos = cell + vec3(hash13(cell + 1.3), hash13(cell + 2.7), hash13(cell + 4.1));
        float dist = length(sp - starPos);
        float twinkle = 0.65 + 0.35 * sin(uTime * (1.5 + r * 3.0) + r * 40.0);
        float bright = (r - 0.93) / 0.07;
        float star = (1.0 - smoothstep(0.12, 0.32, dist)) * twinkle * (0.35 + 0.65 * bright);
        c += vec3(0.9, 0.93, 1.0) * star * uStars * smoothstep(0.03, 0.2, d.y);
      }
    }

    // Kuu: kiekko, jossa on tummempia "meriä", ja pehmeä kehä.
    if (uMoon > 0.0) {
      float a = acos(clamp(dot(d, uMoonDir), -1.0, 1.0));
      vec3 side = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0)));
      vec3 up = cross(side, uMoonDir);
      vec2 q = vec2(dot(d, side), dot(d, up)) / ${MOON_RADIUS.toFixed(4)};
      float disc = 1.0 - smoothstep(${(MOON_RADIUS * 0.85).toFixed(4)}, ${MOON_RADIUS.toFixed(4)}, a);
      float maria = smoothstep(0.45, 0.7, noise(q * 2.2 + 3.0)) * 0.22;
      c = mix(c, vec3(0.96, 0.94, 0.86) * (1.0 - maria), disc * uMoon);
      c += vec3(0.45, 0.55, 0.75) * exp(-a / 0.035) * 0.35 * uMoon * (1.0 - disc);
    }

    // Aurinko: kirkas kiekko, matalalla kellertävä.
    if (uSun > 0.0) {
      float a = acos(clamp(dot(d, uSunDir), -1.0, 1.0));
      float disc = 1.0 - smoothstep(${(SUN_RADIUS * 0.8).toFixed(4)}, ${SUN_RADIUS.toFixed(4)}, a);
      vec3 sunColor = mix(vec3(1.0, 0.72, 0.32), vec3(1.0, 0.98, 0.9), smoothstep(0.0, 0.25, uSunDir.y));
      c = mix(c, sunColor, disc * uSun);
    }

    // Pilvet: tasaiselle pilvikerrokselle projisoitu kohina, joka ajelehtii tuulen mukana.
    if (uClouds > 0.0 && d.y > 0.0) {
      vec2 uv = d.xz / (d.y + 0.08) * 0.9 + uCloudOffset;
      float n = fbm(uv);
      float edge = 1.0 - uClouds;
      float cover = smoothstep(edge * 0.75, edge * 0.75 + 0.22, n);
      cover *= smoothstep(0.0, 0.12, d.y);
      float toSun = max(dot(d, uGlowDir), 0.0);
      float thick = smoothstep(edge * 0.75, edge * 0.75 + 0.5, n);
      float lit = clamp(0.35 + 0.65 * pow(toSun, 6.0) + 0.3 * (1.0 - thick), 0.0, 1.0);
      vec3 cloud = mix(uCloudShade, uCloudLit, lit);
      // Kaukana taivaanrannassa pilvet häipyvät usvaan.
      cloud = mix(uHorizon, cloud, smoothstep(0.0, 0.18, d.y));
      c = mix(c, cloud, cover * 0.95);
    }

    c += vec3(0.55, 0.6, 0.75) * uFlash;
    gl_FragColor = vec4(c, 0.0);
  }
`;

/** Valaistus, jonka peli (WeatherController) ottaa käyttöön joka ruudulla. */
export interface SkyLighting {
  /** Ympäristövalon ja suoran valon kertoimet. */
  ambient: number;
  direct: number;
  /** Suora valo tulee tästä suunnasta (aurinko tai kuu, varjostusta varten korkealla). */
  lightDir: THREE.Vector3;
  /** Taivaanrannan väri: POV:n sumu ja tausta. */
  horizon: THREE.Color;
  fog: [number, number];
}

/**
 * Vuorokaudenajan näkyvä puoli: taivas, aurinko, kuu, tähdet, pilvet,
 * kimallus vedessä ja jälkikäsittelyn sävytys. Taivas näkyy vain POV:ssa;
 * usva ja sävytys myös ylhäältä.
 */
export class SkyView {
  /** Taivas seuraa kameraa (vain POV). */
  readonly dome = new THREE.Group();
  /** Usvan määrä 0–1 (ks. MistView). */
  mist = 0;
  readonly grade = neutralGrade();
  readonly lighting: SkyLighting = {
    ambient: 1,
    direct: 1,
    lightDir: new THREE.Vector3(-50, 100, -30).normalize(),
    horizon: new THREE.Color(DAY.horizon),
    fog: [500, 2600],
  };
  /** Kimallus vesishaderille: suunta, väri ja voimakkuus. */
  readonly glitter = {
    dir: new THREE.Vector3(0, 1, 0),
    color: new THREE.Color(0xfff3b0),
    amount: 0,
  };
  private readonly domeMaterial: THREE.ShaderMaterial;
  private clock = 0;
  private readonly cloudOffset = new THREE.Vector2();

  constructor() {
    const color = () => ({ value: new THREE.Color() });
    this.domeMaterial = new THREE.ShaderMaterial({
      vertexShader: DOME_VERT,
      fragmentShader: DOME_FRAG,
      uniforms: {
        uZenith: color(),
        uMid: color(),
        uHorizon: color(),
        uGlowIn: color(),
        uGlowOut: color(),
        uGlowDir: { value: new THREE.Vector3(0, 1, 0) },
        uGlowAmount: { value: 0 },
        uGlowSize: { value: 0.1 },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSun: { value: 0 },
        uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
        uMoon: { value: 0 },
        uStars: { value: 0 },
        uTime: { value: 0 },
        uCloudOffset: { value: this.cloudOffset },
        uClouds: { value: 0 },
        uCloudLit: color(),
        uCloudShade: color(),
        uFlash: { value: 0 },
      },
      side: THREE.BackSide,
      depthWrite: false,
      // Alfa 0 merkitsee taivaan: kirjoitetaan sellaisenaan ilman sekoitusta.
      blending: THREE.NoBlending,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(DOME_RADIUS, 32, 16), this.domeMaterial);
    dome.renderOrder = -10;
    dome.frustumCulled = false;
    this.dome.add(dome);
    this.dome.name = 'sky';
    this.dome.visible = false;
  }

  /**
   * Päivittää ilmeen pelikellon (tuntia 0–24), pilvisyyden (taivaan tummuus 0–1)
   * ja salaman välähdyksen (0–1, jo kerrottu iskun etäisyydellä) mukaan; `dt`
   * liikuttaa pilviä ja tähtien tuiketta.
   */
  update(hours: number, darkness: number, flash: number, wind: Vec2, dt = 0): void {
    const look = lookAt(hours);
    // Pilvisellä säällä taivas harmaantuu ja pilvet peittävät auringon, kuun ja tähdet.
    const cloud = smoothstep(0.15, 0.6, darkness);
    const overcast = overcastColor(look, darkness);
    const sunPos = sunAt(hours);
    const moonPos = moonAt(hours);
    const sunDir = skyDirection(sunPos);
    const moonUp = moonPos.elevation > -MOON_RADIUS;
    const moonDir = skyDirection(moonPos);
    // Hehku ja kimallus: aurinko, kun se on lähellä horisonttia tai ylempänä, muuten kuu.
    const byMoon = moonUp && sunPos.elevation < -0.1;
    const bodyDir = byMoon ? moonDir : sunDir;

    this.clock += dt;
    // Pilvet ajelehtivat tuulen mukana (kuvakulmassa hitaasti) ja aina vähän.
    this.cloudOffset.x += dt * (0.004 + wind.x * 0.004);
    this.cloudOffset.y -= dt * (0.002 + wind.y * 0.004);

    const u = this.domeMaterial.uniforms;
    const dim = (hex: number) =>
      new THREE.Color(hex).lerp(overcast, cloud * 0.85).multiplyScalar(1 - 0.35 * cloud);
    (u.uZenith!.value as THREE.Color).copy(dim(look.zenith));
    (u.uMid!.value as THREE.Color).copy(dim(look.mid));
    (u.uHorizon!.value as THREE.Color).copy(dim(look.horizon));
    (u.uGlowIn!.value as THREE.Color).set(look.glowIn);
    (u.uGlowOut!.value as THREE.Color).set(look.glowOut);
    (u.uGlowDir!.value as THREE.Vector3).copy(bodyDir);
    u.uGlowAmount!.value = look.glowAmount * (1 - cloud);
    u.uGlowSize!.value = look.glowSize;
    (u.uSunDir!.value as THREE.Vector3).copy(sunDir);
    u.uSun!.value = sunPos.elevation > -SUN_RADIUS ? 1 - cloud : 0;
    (u.uMoonDir!.value as THREE.Vector3).copy(moonDir);
    // Kuu kalpenee valoisalla taivaalla.
    u.uMoon!.value = moonUp
      ? (1 - cloud) * (1 - 0.7 * smoothstep(-0.1, 0.05, sunPos.elevation))
      : 0;
    u.uStars!.value = look.stars * (1 - cloud);
    u.uTime!.value = this.clock;
    u.uClouds!.value = Math.min(0.95, look.clouds + darkness * 1.1);
    (u.uCloudLit!.value as THREE.Color).copy(dim(look.cloudLit));
    (u.uCloudShade!.value as THREE.Color).copy(dim(look.cloudShade));
    u.uFlash!.value = flash * 0.8;

    // Tuuli hajottaa usvan.
    this.mist = look.mist * (1 - smoothstep(3, 8, Math.hypot(wind.x, wind.y)));

    const l = this.lighting;
    // Pilvisellä säällä valo on hajavaloa: varjot heikkenevät, mutta vaakapinnat
    // (vesi, maa) pysyvät yhtä kirkkaina, jotteivät niiden palettivärit vaihdu.
    // Synkkyys tulee sävytyksestä alempana.
    l.ambient = look.ambient + 0.4 * look.direct * cloud;
    l.direct = look.direct * (1 - 0.5 * cloud);
    // Varjostus pidetään korkealla: matala valo tummentaisi tasaisen veden ja maan.
    const shade = byMoon ? moonPos : sunPos;
    l.lightDir.copy(skyDirection({ ...shade, elevation: Math.max(shade.elevation, 0.98) }));
    l.horizon.copy(u.uHorizon!.value as THREE.Color);
    const fogScale = 1 - 0.3 * cloud;
    l.fog = [look.fog[0] * fogScale, look.fog[1] * fogScale];

    this.glitter.dir.copy(bodyDir);
    this.glitter.color.set(look.glitter);
    // Silta näkyy vain matalasta auringosta tai kuusta: korkealta paistaessa
    // peilikuva olisi aivan kalastajan edessä ja näyttäisi tikkailta.
    this.glitter.amount =
      bodyDir.y > -0.02
        ? look.glitterAmount * (1 - cloud) * (1 - smoothstep(0.4, 0.6, bodyDir.y))
        : 0;

    // Koko kuvan valo yhdessä paikassa: vuorokaudenaika, pilvisyys (himmentää
    // ja harmaannuttaa) ja salaman välähdys (kirkastaa hetkeksi).
    const g = this.grade;
    const gloom = 1 - 0.4 * darkness;
    const mix = (base: Rgb, scale: number, to: Rgb, out: THREE.Vector3) =>
      out.set(
        lerp(base[0] * scale, to[0], flash),
        lerp(base[1] * scale, to[1], flash),
        lerp(base[2] * scale, to[2], flash),
      );
    mix(look.mul, gloom, FLASH_MUL, g.mul);
    mix(look.add, 1, FLASH_ADD, g.add);
    g.sat = lerp(look.sat * (1 - 0.4 * darkness), FLASH_SAT, flash);
    // Usva saa taivaanrannan sävyn vaalennettuna; sRGB-arvot sellaisinaan jälkikäsittelyyn.
    g.mist
      .setHex(look.horizon, THREE.LinearSRGBColorSpace)
      .lerp(new THREE.Color().setHex(0xe8ecf0, THREE.LinearSRGBColorSpace), 0.35)
      .multiplyScalar(1 - 0.3 * cloud);
  }

  /** Taivas kameran ympärille. */
  follow(camera: THREE.Vector3): void {
    this.dome.position.copy(camera);
  }
}
