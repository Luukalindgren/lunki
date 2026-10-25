import * as THREE from 'three';
import { moonAt, sunAt, type CelestialPosition, type TimeOfDay, type Vec2 } from '@lunki/shared';

/**
 * Jälkikäsittelyn sävytys palettiin pyöristämisen jälkeen: väri =
 * (harmaa ↔ väri `sat`) × `mul` + `add`. Valaistusta ei himmennetä yöksi,
 * koska paletissa tummat sävyt sulautuisivat yhteen ja vihertyisivät;
 * sävytys vaihtaa koko paletin yön tai illan sävyihin kuten vanhoissa peleissä.
 */
export interface Grade {
  mul: THREE.Vector3;
  add: THREE.Vector3;
  sat: number;
}

export const neutralGrade = (): Grade => ({
  mul: new THREE.Vector3(1, 1, 1),
  add: new THREE.Vector3(0, 0, 0),
  sat: 1,
});

type Rgb = [number, number, number];

/** Vuorokaudenajan ilme yhdellä hetkellä; hetkien välillä arvot liukuvat. */
interface Look {
  /** Taivaan kaistat horisontista ylöspäin: [väri, alaraja (korkeuden sini)]. */
  bands: [number, number][];
  /** Hehku auringon tai kuun ympärillä: [väri, kynnys] ulommasta sisimpään. */
  glow: [number, number][];
  glowAmount: number;
  /** Hehkun leveys (suurempi = laajempi). */
  glowSize: number;
  mul: Rgb;
  add: Rgb;
  sat: number;
  /** POV-näkymän sumu (m): alku ja loppu. */
  fog: [number, number];
  /** Usva vedenpinnalla 0–1. */
  mist: number;
  /** Tähdet näkyvissä (>0,5). */
  stars: number;
  /** Ympäristövalon ja suoran valon kertoimet. */
  ambient: number;
  direct: number;
  /** Auringon tai kuun kimallus vedessä: väri ja voimakkuus. */
  glitter: number;
  glitterAmount: number;
}

const DAY: Look = {
  bands: [
    [0x83c2db, -1],
    [0x4d9cc2, 0.14],
    [0x2b7aa6, 0.32],
    [0x2b7aa6, 2],
  ],
  glow: [
    [0xc3cbd2, 0.5],
    [0xeef2f3, 0.8],
    [0xfff3b0, 0.95],
  ],
  glowAmount: 1,
  glowSize: 0.01,
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

/** Ilmeet kisan etenemisen mukaan (0 = alku, 1 = loppu). */
export const LOOKS: Record<TimeOfDay, [number, Look][]> = {
  morning: [
    [
      0,
      {
        // Sarastus: aurinko vielä horisontin alla, järvellä paksu usva.
        bands: [
          [0xc3cbd2, -1],
          [0x83c2db, 0.1],
          [0x4d9cc2, 0.26],
          [0x2b7aa6, 0.45],
        ],
        glow: [
          [0xe0cf9c, 0.25],
          [0xf6d04d, 0.55],
          [0xfff3b0, 0.85],
        ],
        glowAmount: 1,
        glowSize: 0.22,
        mul: [0.92, 0.92, 0.98],
        add: [0.05, 0.05, 0.07],
        sat: 0.8,
        fog: [40, 700],
        mist: 1,
        stars: 0,
        ambient: 0.9,
        direct: 0.5,
        glitter: 0xfff3b0,
        glitterAmount: 1,
      },
    ],
    [
      1,
      {
        bands: [
          [0xc3cbd2, -1],
          [0x83c2db, 0.06],
          [0x4d9cc2, 0.22],
          [0x2b7aa6, 0.42],
        ],
        glow: [
          [0xe0cf9c, 0.3],
          [0xf6d04d, 0.75],
          [0xf6d04d, 2],
        ],
        glowAmount: 0.8,
        glowSize: 0.12,
        mul: [1, 0.99, 0.97],
        add: [0.03, 0.03, 0.03],
        sat: 0.9,
        fog: [250, 1900],
        mist: 0.3,
        stars: 0,
        ambient: 1,
        direct: 0.9,
        glitter: 0xfff3b0,
        glitterAmount: 1,
      },
    ],
  ],
  day: [[0, DAY]],
  evening: [
    [
      0,
      {
        // Kultainen tunti: aurinko matalalla luoteessa.
        bands: [
          [0xe0cf9c, -1],
          [0x83c2db, 0.08],
          [0x4d9cc2, 0.24],
          [0x2b7aa6, 0.45],
        ],
        glow: [
          [0xe0cf9c, 0.3],
          [0xf6d04d, 0.7],
          [0xf6d04d, 2],
        ],
        glowAmount: 0.9,
        glowSize: 0.12,
        mul: [1.04, 0.95, 0.82],
        add: [0.02, 0.01, 0],
        sat: 1,
        fog: [400, 2400],
        mist: 0,
        stars: 0,
        ambient: 1,
        direct: 0.9,
        glitter: 0xf6d04d,
        glitterAmount: 1,
      },
    ],
    [
      0.55,
      {
        // Auringonlasku: oranssi hehku ja punertava taivaanranta.
        bands: [
          [0xc05bb4, -1],
          [0x8e99a4, 0.07],
          [0x4d9cc2, 0.2],
          [0x1b5a84, 0.4],
        ],
        glow: [
          [0xf08a2c, 0.2],
          [0xf6d04d, 0.6],
          [0xf6d04d, 0.9],
        ],
        glowAmount: 1.1,
        glowSize: 0.17,
        mul: [1, 0.82, 0.74],
        add: [0.04, 0, 0.02],
        sat: 0.95,
        fog: [300, 2000],
        mist: 0.1,
        stars: 0,
        ambient: 0.95,
        direct: 0.6,
        glitter: 0xf08a2c,
        glitterAmount: 1,
      },
    ],
    [
      1,
      {
        // Hämärä: aurinko laskenut, taivaanrannassa punainen juova.
        bands: [
          [0x6b2d6e, -1],
          [0x39424d, 0.06],
          [0x123a5c, 0.2],
          [0x0d2238, 0.42],
        ],
        glow: [
          [0x8c1c1c, 0.25],
          [0xd23a2a, 0.55],
          [0xf08a2c, 0.85],
        ],
        glowAmount: 0.8,
        glowSize: 0.2,
        mul: [0.62, 0.55, 0.72],
        add: [0.03, 0.01, 0.06],
        sat: 0.7,
        fog: [200, 1600],
        mist: 0.45,
        stars: 0.6,
        ambient: 0.9,
        direct: 0.3,
        glitter: 0xd23a2a,
        glitterAmount: 0.6,
      },
    ],
  ],
  night: [
    [
      0,
      {
        // Kuutamo: tähtitaivas, kuu kaakossa ja kuun silta järvellä.
        bands: [
          [0x1c232b, -1],
          [0x0d2238, 0.1],
          [0x0b0f14, 0.4],
          [0x0b0f14, 2],
        ],
        glow: [
          [0x39424d, 0.3],
          [0x5f6b78, 0.65],
          [0x8e99a4, 0.9],
        ],
        glowAmount: 1,
        glowSize: 0.02,
        mul: [0.42, 0.52, 0.78],
        add: [0, 0.01, 0.04],
        sat: 0.5,
        fog: [150, 1400],
        mist: 0.35,
        stars: 1,
        ambient: 0.85,
        direct: 0.6,
        glitter: 0xc3cbd2,
        glitterAmount: 0.5,
      },
    ],
  ],
};

/** Pilvinen taivas palettisävyinä portaittain: [tummuus vähintään, väri]. */
const CLOUDY_SKIES: [number, number][] = [
  [0.65, 0x39424d],
  [0.45, 0x5f6b78],
  [0.2, 0x8e99a4],
  [0, 0xc3cbd2],
];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Suunta taivaalle Three.js-maailmassa (y ylös, z = -pohjoinen). */
export function skyDirection(p: CelestialPosition, out = new THREE.Vector3()): THREE.Vector3 {
  const c = Math.cos(p.elevation);
  return out.set(c * Math.cos(p.azimuth), Math.sin(p.elevation), -c * Math.sin(p.azimuth));
}

/** Ilmeiden numeroarvot liukuvat; värit sekoitetaan lineaarisessa tilassa. */
function blend(a: Look, b: Look, t: number): Look {
  const mixHex = (x: number, y: number) => new THREE.Color(x).lerp(new THREE.Color(y), t).getHex();
  const mixList = (x: [number, number][], y: [number, number][]) =>
    x.map(([c, v], i) => [mixHex(c, y[i]![0]), lerp(v, y[i]![1], t)] as [number, number]);
  const mixRgb = (x: Rgb, y: Rgb) => x.map((v, i) => lerp(v, y[i]!, t)) as Rgb;
  return {
    bands: mixList(a.bands, b.bands),
    glow: mixList(a.glow, b.glow),
    glowAmount: lerp(a.glowAmount, b.glowAmount, t),
    glowSize: lerp(a.glowSize, b.glowSize, t),
    mul: mixRgb(a.mul, b.mul),
    add: mixRgb(a.add, b.add),
    sat: lerp(a.sat, b.sat, t),
    fog: [lerp(a.fog[0], b.fog[0], t), lerp(a.fog[1], b.fog[1], t)],
    mist: lerp(a.mist, b.mist, t),
    stars: lerp(a.stars, b.stars, t),
    ambient: lerp(a.ambient, b.ambient, t),
    direct: lerp(a.direct, b.direct, t),
    glitter: mixHex(a.glitter, b.glitter),
    glitterAmount: lerp(a.glitterAmount, b.glitterAmount, t),
  };
}

/** Vuorokaudenajan ilme kisan etenemän mukaan. */
export function lookAt(time: TimeOfDay, progress: number): Look {
  const keys = LOOKS[time];
  if (progress <= keys[0]![0]) return keys[0]![1];
  const last = keys[keys.length - 1]!;
  if (progress >= last[0]) return last[1];
  for (let i = 1; i < keys.length; i++) {
    const [p1, b] = keys[i]!;
    const [p0, a] = keys[i - 1]!;
    if (progress <= p1) return blend(a, b, (progress - p0) / (p1 - p0));
  }
  return last[1];
}

const DOME_RADIUS = 2800;
const BODY_DISTANCE = 2600;

const DOME_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * Taivas palettiväreinä: kaistat vaihtuvat korkeuden mukaan, ja reunat
 * rasteroidaan Bayer-kuviolla kuten vanhoissa peleissä. Auringon tai kuun
 * ympärillä on oma hehkunsa, joka leviää taivaanrantaa pitkin.
 */
const DOME_FRAG = /* glsl */ `
  uniform vec3 uBand[4];
  uniform float uStop[4];
  uniform vec3 uGlow[3];
  uniform float uGlowStop[3];
  uniform vec3 uGlowDir;
  uniform float uGlowAmount;
  uniform float uGlowSize;
  varying vec3 vDir;

  float bayer4(vec2 p) {
    int x = int(mod(p.x, 4.0));
    int y = int(mod(p.y, 4.0));
    int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
    return (float(m[x + y * 4]) + 0.5) / 16.0 - 0.5;
  }

  void main() {
    vec3 d = normalize(vDir);
    float dither = bayer4(gl_FragCoord.xy);
    float h = d.y + dither * 0.035;
    vec3 c = uBand[0];
    for (int i = 1; i < 4; i++) if (h > uStop[i]) c = uBand[i];
    float near = exp((dot(d, uGlowDir) - 1.0) / max(uGlowSize, 1e-3));
    float g = uGlowAmount * near * (1.0 - smoothstep(-0.05, 0.5, d.y) * 0.6) + dither * 0.08;
    for (int i = 0; i < 3; i++) if (g > uGlowStop[i]) c = uGlow[i];
    gl_FragColor = vec4(c, 1.0);
  }
`;

/** Tähdet yläpuoliskolle kiinteällä siemenellä. */
function createStars(): THREE.Points {
  const count = 260;
  const positions = new Float32Array(count * 3);
  let seed = 101;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < count; i++) {
    const az = rand() * Math.PI * 2;
    // Enemmän tähtiä ylempänä; matalalla usva ja metsä peittävät.
    const el = Math.asin(0.08 + rand() * 0.92);
    const c = Math.cos(el) * BODY_DISTANCE;
    positions.set([c * Math.cos(az), Math.sin(el) * BODY_DISTANCE, c * Math.sin(az)], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(
    g,
    new THREE.PointsMaterial({
      color: 0xeef2f3,
      size: 1,
      sizeAttenuation: false,
      fog: false,
      depthWrite: false,
    }),
  );
  points.renderOrder = -9;
  points.frustumCulled = false;
  return points;
}

function createDisc(radius: number, color: number): THREE.Mesh {
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 16),
    new THREE.MeshBasicMaterial({ color, fog: false, depthWrite: false }),
  );
  disc.renderOrder = -8;
  disc.frustumCulled = false;
  return disc;
}

/** Valaistus, jonka SoloGame ottaa käyttöön joka ruudulla. */
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
 * Vuorokaudenajan näkyvä puoli: taivas, aurinko, kuu, tähdet, usva,
 * kimallus vedessä ja jälkikäsittelyn sävytys. Taivas ja taivaankappaleet
 * näkyvät vain POV:ssa; usva ja sävytys myös ylhäältä.
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
    horizon: new THREE.Color(0x83c2db),
    fog: [500, 2600],
  };
  /** Kimallus vesishaderille: suunta, väri ja voimakkuus. */
  readonly glitter = {
    dir: new THREE.Vector3(0, 1, 0),
    color: new THREE.Color(0xfff3b0),
    amount: 0,
  };
  private readonly domeMaterial: THREE.ShaderMaterial;
  private readonly stars = createStars();
  private readonly sun = createDisc(64, 0xfff3b0);
  private readonly moon = createDisc(52, 0xeef2f3);

  constructor(readonly time: TimeOfDay) {
    this.domeMaterial = new THREE.ShaderMaterial({
      vertexShader: DOME_VERT,
      fragmentShader: DOME_FRAG,
      uniforms: {
        uBand: { value: [0, 1, 2, 3].map(() => new THREE.Color()) },
        uStop: { value: [-1, 0, 0, 0] },
        uGlow: { value: [0, 1, 2].map(() => new THREE.Color()) },
        uGlowStop: { value: [2, 2, 2] },
        uGlowDir: { value: new THREE.Vector3(0, 1, 0) },
        uGlowAmount: { value: 0 },
        uGlowSize: { value: 0.1 },
      },
      side: THREE.BackSide,
      depthWrite: false,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(DOME_RADIUS, 32, 16), this.domeMaterial);
    dome.renderOrder = -10;
    dome.frustumCulled = false;
    this.dome.add(dome, this.stars, this.sun, this.moon);
    this.dome.name = 'sky';
    this.dome.visible = false;
  }

  /**
   * Päivittää ilmeen kisan etenemän (0–1), pilvisyyden (taivaan tummuus 0–1)
   * ja salaman välähdyksen mukaan.
   */
  update(progress: number, darkness: number, flash: number, wind: Vec2): void {
    const look = lookAt(this.time, progress);
    const cloud = smoothstep(0.15, 0.6, darkness);
    const cloudColor = new THREE.Color(CLOUDY_SKIES.find(([min]) => darkness >= min)![1]);
    const sunPos = sunAt(this.time, progress);
    const moonPos = moonAt(this.time, progress);
    const sunDir = skyDirection(sunPos);
    const moonDir = moonPos ? skyDirection(moonPos) : null;
    // Hehku ja kimallus: aurinko, kun se on lähellä horisonttia tai ylempänä, muuten kuu.
    const bodyDir = moonDir && sunPos.elevation < -0.1 ? moonDir : sunDir;

    const u = this.domeMaterial.uniforms;
    look.bands.forEach(([c, stop], i) => {
      (u.uBand!.value as THREE.Color[])[i]!.set(c).lerp(cloudColor, cloud);
      (u.uStop!.value as number[])[i] = i === 0 ? -1 : stop;
    });
    look.glow.forEach(([c, stop], i) => {
      (u.uGlow!.value as THREE.Color[])[i]!.set(c);
      (u.uGlowStop!.value as number[])[i] = stop;
    });
    (u.uGlowDir!.value as THREE.Vector3).copy(bodyDir);
    u.uGlowAmount!.value = look.glowAmount * (1 - cloud);
    u.uGlowSize!.value = look.glowSize;

    const clear = cloud < 0.5;
    this.stars.visible = clear && look.stars > 0.5;
    this.sun.visible = clear && sunPos.elevation > -0.03;
    this.moon.visible = clear && !!moonDir;
    this.sun.position.copy(sunDir).multiplyScalar(BODY_DISTANCE);
    if (moonDir) this.moon.position.copy(moonDir).multiplyScalar(BODY_DISTANCE);
    // Matala aurinko on keltaisempi, korkealla lähes valkoinen.
    (this.sun.material as THREE.MeshBasicMaterial).color.set(
      sunPos.elevation < 0.12 ? 0xf6d04d : 0xfff3b0,
    );

    // Tuuli hajottaa usvan.
    this.mist = look.mist * (1 - smoothstep(3, 8, Math.hypot(wind.x, wind.y)));

    const l = this.lighting;
    l.ambient = look.ambient;
    l.direct = look.direct * (1 - 0.5 * cloud);
    // Varjostus pidetään korkealla: matala valo tummentaisi tasaisen veden ja maan.
    const shade = moonDir && sunPos.elevation < -0.1 ? moonPos! : sunPos;
    l.lightDir.copy(skyDirection({ ...shade, elevation: Math.max(shade.elevation, 0.98) }));
    l.horizon.set(look.bands[0]![0]).lerp(cloudColor, cloud);
    const fogScale = 1 - 0.3 * cloud;
    l.fog = [look.fog[0] * fogScale, look.fog[1] * fogScale];

    this.glitter.dir.copy(bodyDir);
    this.glitter.color.set(look.glitter);
    this.glitter.amount = bodyDir.y > -0.02 ? look.glitterAmount * (1 - cloud) : 0;

    // Salama valaisee hetkeksi koko maiseman: sävytys palaa kohti neutraalia.
    const g = this.grade;
    const k = Math.min(1, flash * 1.5);
    g.mul.set(lerp(look.mul[0], 1, k), lerp(look.mul[1], 1, k), lerp(look.mul[2], 1, k));
    g.add.set(lerp(look.add[0], 0, k), lerp(look.add[1], 0, k), lerp(look.add[2], 0, k));
    g.sat = lerp(look.sat, 1, k);
  }

  /** Taivas kameran ympärille; aurinko ja kuu kääntyvät kameraan päin. */
  follow(camera: THREE.Vector3): void {
    this.dome.position.copy(camera);
    this.dome.updateMatrixWorld();
    this.sun.lookAt(camera);
    this.moon.lookAt(camera);
  }
}
