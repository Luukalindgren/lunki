import * as THREE from 'three';
import type { LakeMap, Vec2 } from '@lunki/shared';
import { DEPTH_PIXEL, DEPTH_SHADE_GLSL, DEPTH_TEX_RANGE } from './depthShade';

/** Pelikoordinaatti (x itään, y pohjoiseen) → Three.js-maailma (x, 0, -y). */
export const toWorld = (p: Vec2, height = 0): THREE.Vector3 => new THREE.Vector3(p.x, height, -p.y);

const toShapePoints = (ring: readonly Vec2[]) => ring.map((p) => new THREE.Vector2(p.x, p.y));

/**
 * Prototyypin järvi: tasainen maa, vesialue saarineen ja rantaviiva.
 * Muodot piirretään XY-tasoon ja käännetään vaakatasoon (y → -z).
 */
export function createLakeMesh(map: LakeMap, waves = createWaterWaves()): THREE.Group {
  const group = new THREE.Group();
  group.name = 'lake';

  const { minX, minY, maxX, maxY } = map.bounds;
  const margin = 4000;
  // Jaettu pienempiin kolmioihin: kilometrien kokoisten kolmioiden syvyysarvot
  // heittelevät lähellä kameraa niin, että maa voi peittää veden POV-näkymässä.
  const land = new THREE.Mesh(
    new THREE.PlaneGeometry(maxX - minX + margin * 2, maxY - minY + margin * 2, 48, 48),
    new THREE.MeshLambertMaterial({ color: 0x3b7337 }),
  );
  land.rotation.x = -Math.PI / 2;
  land.position.set((minX + maxX) / 2, -0.3, -(minY + maxY) / 2);
  group.add(land);

  const shape = new THREE.Shape(toShapePoints(map.shore));
  for (const island of map.islands) shape.holes.push(new THREE.Path(toShapePoints(island)));
  const water = new THREE.Mesh(new THREE.ShapeGeometry(shape), createWaterMaterial(waves));
  water.rotation.x = -Math.PI / 2;
  water.name = 'water';
  group.add(water);

  // Saaret: matala maakansi, jotta POV-näkymän karkea maasto ei näy veden alta.
  const islandMaterial = new THREE.MeshLambertMaterial({ color: 0x2d5a30 });
  for (const island of map.islands) {
    const cap = new THREE.Mesh(
      new THREE.ShapeGeometry(new THREE.Shape(toShapePoints(island))),
      islandMaterial,
    );
    cap.rotation.x = -Math.PI / 2;
    cap.position.y = 0.25;
    cap.name = 'island';
    group.add(cap);
  }

  // Kaislikot: harvoja kaislatupsuja, joiden välistä vesi näkyy (kaislaspritet ks. vegetation.ts).
  const reedMaterial = new THREE.MeshBasicMaterial({
    map: createReedTexture(),
    alphaTest: 0.5,
    depthWrite: false,
  });
  for (const bed of map.reeds ?? []) {
    const patch = new THREE.Mesh(
      new THREE.ShapeGeometry(new THREE.Shape(toShapePoints(bed.ring))),
      reedMaterial,
    );
    patch.rotation.x = -Math.PI / 2;
    patch.position.y = 0.015;
    patch.name = 'reeds';
    group.add(patch);
  }

  const shoreMaterial = new THREE.LineBasicMaterial({ color: 0xb99a68 });
  for (const ring of [map.shore, ...map.islands]) {
    const points = ring.map((p) => toWorld(p, 0.02));
    const line = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(points),
      shoreMaterial,
    );
    group.add(line);
  }
  return group;
}

/** Kaislikkokuvion yhden toiston koko (m) ja tupsujen määrä toistossa. */
const REED_TEXTURE_METERS = 8;
const REED_TUFTS = 56;

/**
 * Kaislikko ylhäältä: läpinäkyvä kuvio, jossa on pieniä kaislatupsuja
 * (muutama pikselin mittainen korsi). Suurin osa kuvasta on tyhjää, jotta
 * vesi näkyy alta ja kaislikko erottuu saaresta.
 */
function createReedTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const colors = ['#a3c45a', '#6a9a3e', '#3b7337', '#e0cf9c'];
  let seed = 11;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const dot = (x: number, y: number) =>
    ctx.fillRect(((x % size) + size) % size, ((y % size) + size) % size, 1, 1);
  for (let i = 0; i < REED_TUFTS; i++) {
    const cx = Math.floor(rand() * size);
    const cy = Math.floor(rand() * size);
    // Tupsu: korsia eri suuntiin keskeltä, latvat vaaleampia.
    const stems = 3 + Math.floor(rand() * 3);
    for (let k = 0; k < stems; k++) {
      const dx = Math.round((rand() - 0.5) * 2.4);
      const len = 2 + Math.floor(rand() * 3);
      ctx.fillStyle = colors[rand() < 0.15 ? 3 : 1 + Math.floor(rand() * 2)]!;
      for (let j = 0; j < len; j++) dot(cx + Math.round((dx * j) / 2), cy - j);
      ctx.fillStyle = colors[0]!;
      dot(cx + Math.round((dx * len) / 2), cy - len);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1 / REED_TEXTURE_METERS, 1 / REED_TEXTURE_METERS);
  texture.magFilter = THREE.NearestFilter;
  // Ilman mipmappeja: läpinäkyvyysraja pysyy terävänä myös kaukaa.
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Vesikuvion yhden toiston koko (m). */
const WATER_TEXTURE_METERS = 32;

/** Veden aaltoilun kello (s); päivitetään pelisilmukasta. */
export const waterTime = { value: 0 };

/**
 * Tuulen aallot vesishaderille: aallonkorkeuskerroin tekstuurina (ks.
 * WaveField) sekä tuulen nopeus ja suunta.
 * Jokaisella pelillä omansa: valikon taustapeli ei saa sotkea kisan vettä.
 */
export function createWaterWaves() {
  return {
    uWaveTex: { value: null as THREE.Texture | null },
    uWaveBounds: { value: new THREE.Vector4(0, 0, 1, 1) },
    uWaveScale: { value: 0 },
    uWaveDir: { value: new THREE.Vector2(1, 0) },
    /** Auringon tai kuun suunta, väri (lineaarinen) ja kimalluksen voimakkuus. */
    uGlitterDir: { value: new THREE.Vector3(0, 1, 0) },
    uGlitterColor: { value: new THREE.Color(0xfff3b0) },
    uGlitter: { value: 0 },
    /** Aallokko (ks. Swell): suunta x, y, aaltoluku ja vaihe kullekin kolmelle jonolle. */
    uSwell: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
    uSwellAmp: { value: new THREE.Vector3() },
    uSwellOrigin: { value: new THREE.Vector2() },
    /** POV-näkymän aaltoileva lähivesi: keskipiste x, y ja säde (m); 0 = pois. */
    uPatch: { value: new THREE.Vector3(0, 0, 0) },
    /** Lähiveden aallokon häivytys 0–1: aallot ja viivat tulevat esiin ja häviävät liukuen. */
    uSwellFade: { value: 0 },
    /** Vesialue tekstuurina (punainen = vettä) ja sen rajat: minX, minY, leveys, korkeus. */
    uWaterMask: { value: null as THREE.Texture | null },
    uWaterMaskBounds: { value: new THREE.Vector4(0, 0, 1, 1) },
    /**
     * Pohjan syvyys tekstuurina (ks. bottomMesh): punainen = syvyys / DEPTH_TEX_RANGE.
     * Vesishaderi valitsee syvyydestä vyöhykkeen sävyn, joten rajat kaartuvat sileästi.
     */
    uDepthTex: { value: null as THREE.Texture | null },
    uDepthBounds: { value: new THREE.Vector4(0, 0, 1, 1) },
    /** 1 = pohjan sävy piirretään vesishaderissa (ks. createBottomMesh). */
    uBottomShadeOn: { value: 0 },
  };
}
export type WaterWaves = ReturnType<typeof createWaterWaves>;

/**
 * Vesi aaltoilee: kuviota luetaan hitaasti vaeltavilla siniaalloilla
 * vääristettynä, jolloin aallonharjat kiemurtelevat ja välkehtivät.
 * Tuulella pintaan nousee vaahtopäitä.
 */
function createWaterMaterial(waves: WaterWaves, patch = false): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial({ color: 0xffffff, map: createWaterTexture() });
  if (patch) material.defines = { SWELL_PATCH: '' };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWaterTime = waterTime;
    Object.assign(shader.uniforms, waves);
    const header = /* glsl */ `uniform float uWaterTime;
uniform sampler2D uWaveTex;
uniform vec4 uWaveBounds;
uniform float uWaveScale;
uniform vec2 uWaveDir;
uniform vec3 uGlitterDir;
uniform vec3 uGlitterColor;
uniform float uGlitter;
uniform vec3 uPatch;
uniform sampler2D uWaterMask;
uniform vec4 uWaterMaskBounds;
varying vec3 vGlitterPos;
uniform sampler2D uDepthTex;
uniform vec4 uDepthBounds;
uniform float uBottomShadeOn;
#ifdef SWELL_PATCH
varying float vSwell;
varying float vSwellK;
varying vec2 vSwellGrad;
uniform vec4 uSwell[3];
uniform vec2 uSwellOrigin;
#endif
${DEPTH_SHADE_GLSL}
float waterHash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}
`;
    shader.vertexShader = (SWELL_VERTEX_HEADER + shader.vertexShader)
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
        #ifdef SWELL_PATCH
        vMapUv = (mapTransform * vec3(position.xy + uPatch.xy, 1.0)).xy;
        #endif`,
      )
      .replace('#include <beginnormal_vertex>', SWELL_NORMAL)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef SWELL_PATCH
        transformed.z += swellH;
        #endif`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
      vGlitterPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    // onBeforeCompile näkee vielä include-rivit, joten korvataan koko map_fragment.
    shader.fragmentShader = (header + shader.fragmentShader).replace(
      '#include <map_fragment>',
      /* glsl */ `// POV-näkymässä lähivesi piirretään aaltoilevana erillisenä
      // verkkona; tasainen järvi jättää sen kohdan väliin.
      vec2 waterXY = vMapUv * ${WATER_TEXTURE_METERS.toFixed(1)};
      bool inPatch = uPatch.z > 0.0 && length(waterXY - uPatch.xy) < uPatch.z &&
        texture2D(uWaterMask, (waterXY - uWaterMaskBounds.xy) / uWaterMaskBounds.zw).r > 0.5;
      #ifdef SWELL_PATCH
      if (!inPatch) discard;
      #else
      if (inPatch) discard;
      #endif
      vec2 waveUv = vMapUv + vec2(uWaterTime * 0.004, uWaterTime * 0.0015);
      waveUv.x += sin(vMapUv.y * 40.0 + uWaterTime * 1.3) * 0.01;
      waveUv.y += sin(vMapUv.x * 33.0 - uWaterTime * 1.1) * 0.008;
      vec4 sampledDiffuseColor = texture2D( map, waveUv );
      vec2 depthXY = (floor(waterXY / ${DEPTH_PIXEL.toFixed(1)}) + 0.5) * ${DEPTH_PIXEL.toFixed(1)};
      float waterDepth = uBottomShadeOn > 0.5
        ? texture2D(uDepthTex, (depthXY - uDepthBounds.xy) / uDepthBounds.zw).r * ${DEPTH_TEX_RANGE.toFixed(1)}
        : 10.0;
      // POV-näkymässä kuvion 0,25 m tekselit kasvaisivat aivan kameran edessä
      // isoiksi tummiksi ja vaaleiksi laatoiksi: lähivesi on tasaväristä.
      // Matalikolla kuvio jätetään pois: vaalean pohjan sävyn alla viivat
      // vihertyivät paletissa ja näyttivät kaloilta.
      float eyeDist = distance(cameraPosition, vGlitterPos);
      float waterDetail = smoothstep(1.5, 4.0, eyeDist) * smoothstep(2.0, 3.0, waterDepth);
      sampledDiffuseColor.rgb = mix(vec3(0.012, 0.102, 0.235), sampledDiffuseColor.rgb, waterDetail);
      float waterFoam = 0.0;
      float waterTrough = 0.0;
      #ifdef SWELL_PATCH
      // Aallokko pikselitaiteen tapaan: harjan kohdalla vaalea katkoviiva ja
      // sen edessä tumma, kummatkin vain kameraan päin olevalla rinteellä.
      // Viivat ovat pikselin paksuisia korkeuskäyrien pätkiä, jotka kulkevat
      // aaltojen mukana. Heikossa aallokossa pätkiä on vähän, ja ne syttyvät
      // yksitellen, joten kuvio ei ilmesty eikä katoa kerralla.
      {
        vec2 swRel = waterXY - uSwellOrigin;
        vec4 sw0 = uSwell[0];
        float crestId = floor((sw0.z * dot(swRel, sw0.xy) - sw0.w) / 6.2832 + 0.25);
        float along = dot(swRel, vec2(-sw0.y, sw0.x));
        float dashCell = floor(along / 1.2 + waterHash(vec2(crestId, 3.1)) * 9.0);
        float dashHash = waterHash(vec2(dashCell, crestId));
        vec2 toCam = vec2(cameraPosition.x, -cameraPosition.z) - waterXY;
        float facing = step(dot(vSwellGrad, toCam), 0.0);
        float lineW = max(fwidth(vSwell), 1e-4);
        // Kaukana käyrät tihenevät alle pikselin: viivat jätetään pois.
        float swellDensity = vSwellK * (1.0 - smoothstep(0.2, 0.45, lineW)) * facing;
        float lineAt = lineW * 0.6;
        float crestLine = max(
          step(abs(vSwell - 0.4), lineAt) * step(dashHash, swellDensity),
          step(abs(vSwell - 0.12), lineAt) * step(1.0 - dashHash, 0.5 * swellDensity));
        float frontLine = max(
          step(abs(vSwell + 0.2), lineAt) * step(fract(dashHash * 7.0), 0.7 * swellDensity),
          step(abs(vSwell + 0.5), lineAt) * step(fract(dashHash * 13.0), 0.4 * swellDensity));
        sampledDiffuseColor.rgb = mix(sampledDiffuseColor.rgb, vec3(0.024, 0.195, 0.381), crestLine);
        sampledDiffuseColor.rgb = mix(sampledDiffuseColor.rgb, vec3(0.006, 0.042, 0.107), frontLine);
        waterTrough = frontLine;
      }
      #endif
      // Tuulen aallot: lyhyitä vaahtopäitä, jotka syntyvät, ajelehtivat
      // myötätuuleen ja sammuvat. Kaari kaartuu tuulen suuntaan, ja sen
      // takana on tumma aallonpohja. Vaahtopäitä on sitä enemmän, mitä
      // korkeampi aalto (pyyhkäisymatka × tuuli).
      if (uWaveScale > 0.0) {
        vec2 wp = vMapUv * ${WATER_TEXTURE_METERS.toFixed(1)};
        float hs = texture2D(uWaveTex, (wp - uWaveBounds.xy) / uWaveBounds.zw).r * uWaveScale;
        vec2 q = vec2(dot(wp, uWaveDir) - uWaterTime * 0.8, dot(wp, vec2(-uWaveDir.y, uWaveDir.x)));
        // Pikselin koko (m) kumpaankin suuntaan: viiva on aina vähintään
        // pikselin paksuinen, ja kaukana vaahtopäät jätetään pois, jotteivät
        // alle pikselin kokoiset kuviot välky.
        vec2 px = max(fwidth(q), vec2(1e-4));
        float far = 1.0 - smoothstep(0.4, 0.9, min(px.x, px.y));
        float density = smoothstep(0.015, 0.12, hs) * 0.8 * far;
        vec2 cellSize = vec2(4.0, 3.0);
        vec2 cell = floor(q / cellSize);
        float cycle = uWaterTime / 2.6 + waterHash(cell);
        float n = floor(cycle);
        float life = fract(cycle);
        float h1 = waterHash(cell + n * vec2(17.0, 31.0));
        float h2 = waterHash(cell.yx + n * vec2(5.0, 13.0) + 0.37);
        vec2 local = q - cell * cellSize - cellSize * vec2(0.3 + 0.4 * h2, 0.25 + 0.5 * fract(h1 * 7.0));
        float len = (0.4 + 0.8 * fract(h2 * 13.0) + 2.0 * hs) * sin(3.1416 * life);
        float du = local.x + 0.15 * local.y * local.y;
        float t = clamp(px.x * 0.6, 0.12, 0.6);
        // Aivan kameran edessä vaahtopää olisi iso valkoinen laatta.
        float cap = step(h1, density) * step(abs(local.y), len) * step(4.0, eyeDist);
        float foam = cap * step(abs(du), t);
        float trough = cap * step(abs(du + 2.5 * t), t) * step(abs(local.y), len * 0.8);
        sampledDiffuseColor.rgb = mix(sampledDiffuseColor.rgb, vec3(0.006, 0.042, 0.107), trough);
        waterFoam = foam;
        waterTrough = max(waterTrough, trough);
      }
      diffuseColor *= sampledDiffuseColor;`,
    );
    // Vaahto on valkoista myös varjossa ja pilvisellä säällä.
    // Matala aurinko tai kuu piirtää veteen kimaltelevan sillan: heijastus
    // osuu valoon vain kapealla kaistalla, ja kimallus vaihtuu pikseleittäin.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      /* glsl */ `// Pohjan syvyyssävy valaisemattomana veden päällä (ennen erillinen kerros).
      // Tummien viivojen kohdalla sävy jätetään pois: tumma pohja ja vihertävä
      // sävy osuisivat paletissa vihreään, ja vesi näyttäisi maalta.
      if (uBottomShadeOn > 0.5) {
        vec4 bottomShade = depthShade(waterDepth);
        outgoingLight = mix(outgoingLight, bottomShade.rgb, bottomShade.a * (1.0 - waterTrough));
      }
      outgoingLight = mix(outgoingLight, vec3(0.9, 0.95, 1.0), waterFoam);
      // Auringon tai kuun silta pikselitaiteen tapaan: vaakasuoria viivoja,
      // leveimmillään peilikuvan kohdalla. Katsojaa kohti silta kapenee ja
      // harvenee, ja viivat hajoavat lyhyiksi välkkeiksi, kuten aallonharjoilla.
      // Viivat vaihtuvat nykäyksittäin, jolloin silta välkehtii. uGlitter on
      // välkkeiden tiheys; väri on aina täysi, ettei se pyöristy paletissa vihreäksi.
      if (uGlitter > 0.0) {
        vec3 toEye = normalize(cameraPosition - vGlitterPos);
        vec3 refl = vec3(-toEye.x, toEye.y, -toEye.z);
        vec2 sunXZ = normalize(uGlitterDir.xz);
        vec2 rXZ = normalize(refl.xz);
        float ax = atan(rXZ.x * sunXZ.y - rXZ.y * sunXZ.x, dot(rXZ, sunXZ));
        float below = refl.y - uGlitterDir.y;
        float reach = 1.0 - smoothstep(0.0, 0.16, max(below, 0.0));
        // Horisontin puolella silta jatkuu rantaan asti kapeampana.
        float far = below < 0.0 ? clamp(-below / max(uGlitterDir.y, 0.02), 0.0, 1.0) : 0.0;
        float halfWidth = mix(0.004, 0.026, reach) * (1.0 - 0.45 * far);
        float row = floor(gl_FragCoord.y);
        // Lähellä aallot näkyvät harvemmassa: rivien väli kasvaa.
        float stride = refl.y < 0.12 ? 2.0 : 3.0;
        if (reach > 0.0 && abs(ax) < halfWidth && mod(row, stride) < 1.0) {
          float tick = floor(uWaterTime * 3.0);
          float h1 = waterHash(vec2(row, tick));
          float h2 = waterHash(vec2(row + 17.0, tick));
          float chance = uGlitter * (0.85 - 0.6 * (1.0 - reach) - 0.25 * far);
          float rowOn = step(1.0 - chance, h1);
          // Kaukana yksi yhtenäinen viiva, lähempänä 2–4 lyhyttä välkettä.
          float pieces = floor(mix(1.0, 4.0, smoothstep(0.06, 0.25, refl.y)) + 0.5);
          float t = ((ax / halfWidth - (h2 - 0.5) * 0.4) * 0.5 + 0.5) * pieces;
          float piece = floor(t);
          float on = pieces > 1.5 ? step(0.4, waterHash(vec2(row * 5.0 + piece, tick + 9.0))) : 1.0;
          float len = mix(0.35, 1.0, waterHash(vec2(row + piece * 13.0, tick + 4.0)));
          float lit = step(abs(fract(t) - 0.5) * 2.0, len) * on;
          outgoingLight = mix(outgoingLight, uGlitterColor, rowOn * lit);
        }
      }
      #include <opaque_fragment>`,
    );
  };
  return material;
}

/** Aaltoilevan lähiveden säde (m) ja verkon tiheys (m). */
export const SWELL_PATCH_RADIUS = 70;
const SWELL_PATCH_STEP = 1;
/** Aallonpohja korkeintaan näin syvällä (m): maa on 0,3 m vedenpinnan alla. */
const SWELL_MIN_DEPTH = 0.28;
/** Vesimaskin pikselin koko (m). */
const MASK_METERS = 1.25;
/** Aallokko laantuu rantaa kohti tällä matkalla (m); ks. shoreFade. */
export const SHORE_FADE = 14;

/** Aallokon voimakkuus 0–1 rannan etäisyydestä (m): rannassa tyyntä, selällä täysi. */
export function shoreFade(distance: number): number {
  const k = Math.min(1, Math.max(0, distance / SHORE_FADE));
  return k * k * (3 - 2 * k);
}

/** Aaltoilevan lähiveden uniformit ja korkeus verteksivarjostimessa (ks. Swell). */
const SWELL_VERTEX_HEADER = /* glsl */ `varying vec3 vGlitterPos;
uniform vec3 uPatch;
#ifdef SWELL_PATCH
varying float vSwell;
varying float vSwellK;
varying vec2 vSwellGrad;
uniform float uSwellFade;
uniform sampler2D uWaveTex;
uniform vec4 uWaveBounds;
uniform float uWaveScale;
uniform vec4 uSwell[3];
uniform vec3 uSwellAmp;
uniform vec2 uSwellOrigin;
uniform sampler2D uWaterMask;
uniform vec4 uWaterMaskBounds;
#endif
`;

const SWELL_NORMAL = /* glsl */ `#ifdef SWELL_PATCH
  vec2 swellXY = position.xy + uPatch.xy;
  float swellHs = texture2D(uWaveTex, (swellXY - uWaveBounds.xy) / uWaveBounds.zw).r * uWaveScale;
  // Reunalla pinta tasoittuu tasaisen järven korkeuteen, ja rantaa kohti
  // aallokko laantuu, jottei matala pohja pilkistä aallonpohjista.
  swellHs *= 1.0 - smoothstep(uPatch.z * 0.55, uPatch.z * 0.95, length(position.xy));
  float swellShore = texture2D(uWaterMask, (swellXY - uWaterMaskBounds.xy) / uWaterMaskBounds.zw).g;
  float swellOpen = swellHs;
  swellHs *= smoothstep(0.5, 1.0, swellShore) * uSwellFade;
  // Viivojen tiheys: tyynellä ei viivoja, kovassa aallokossa paljon.
  vSwellK = smoothstep(0.02, 0.15, swellHs);
  vec2 swellRel = swellXY - uSwellOrigin;
  float swellH = 0.0;
  vec2 swellGrad = vec2(0.0);
  for (int i = 0; i < 3; i++) {
    vec4 w = uSwell[i];
    float a = w.z * dot(swellRel, w.xy) - w.w;
    swellH += uSwellAmp[i] * sin(a);
    swellGrad += uSwellAmp[i] * cos(a) * w.z * w.xy;
  }
  // Syvä aallonpohja ei saa painua rannan maapohjan alle.
  swellH = max(swellH * swellHs, ${(-SWELL_MIN_DEPTH).toFixed(2)});
  vSwellGrad = swellGrad;
  swellGrad *= swellHs;
  // Suhteellinen korkeus −1…1 värjäykseen: harjat vaaleampia, pohjat tummempia.
  vSwell = swellH / max(0.03, swellOpen * (uSwellAmp.x + uSwellAmp.y + uSwellAmp.z));
  // Valaistus vain loivasti kaltevuudesta: jyrkkä varjostus porrastuisi
  // paletissa isoiksi vaaleiksi ja tummiksi laatoiksi. Sävyt tulevat vSwellistä.
  vec3 objectNormal = normalize(vec3(-swellGrad.x * 0.3, -swellGrad.y * 0.3, 1.0));
#else
  #include <beginnormal_vertex>
#endif
`;

/**
 * POV-näkymän aaltoileva lähivesi: tiheä verkko kalastajan ympärillä, jonka
 * pinta nousee ja laskee aallokon mukana. Verkko liikkuu kameran mukana
 * kokonaisin askelin, joten pisteet pysyvät paikoillaan eivätkä aallot ui.
 * Rantojen kohdalla verkko leikataan pois vesimaskilla.
 */
export function createSwellPatch(map: LakeMap, waves: WaterWaves): THREE.Mesh {
  const mask = createWaterMask(map);
  waves.uWaterMask.value = mask.texture;
  waves.uWaterMaskBounds.value.copy(mask.bounds);
  const size = SWELL_PATCH_RADIUS * 2;
  const geometry = new THREE.PlaneGeometry(
    size,
    size,
    size / SWELL_PATCH_STEP,
    size / SWELL_PATCH_STEP,
  );
  const mesh = new THREE.Mesh(geometry, createWaterMaterial(waves, true));
  mesh.rotation.x = -Math.PI / 2;
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.name = 'swell';
  return mesh;
}

/**
 * Veden pinnassa makaavat kerrokset (kivet ja rungot) jätetään
 * pois aaltoilevan lähiveden kohdalta: muuten ne kelluisivat aallonpohjien yllä.
 */
export function clipToSwellPatch(material: THREE.Material, waves: WaterWaves): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPatch = waves.uPatch;
    shader.uniforms.uWaterMask = waves.uWaterMask;
    shader.uniforms.uWaterMaskBounds = waves.uWaterMaskBounds;
    shader.vertexShader = ('varying vec2 vPatchXY;\n' + shader.vertexShader).replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      vec4 patchWorld = modelMatrix * vec4(transformed, 1.0);
      vPatchXY = vec2(patchWorld.x, -patchWorld.z);`,
    );
    shader.fragmentShader = (
      `varying vec2 vPatchXY;
uniform vec3 uPatch;
uniform sampler2D uWaterMask;
uniform vec4 uWaterMaskBounds;
` + shader.fragmentShader
    ).replace(
      'void main() {',
      `void main() {
      if (uPatch.z > 0.0 && length(vPatchXY - uPatch.xy) < uPatch.z &&
        texture2D(uWaterMask, (vPatchXY - uWaterMaskBounds.xy) / uWaterMaskBounds.zw).r > 0.5) discard;`,
    );
  };
}

/** Siirtää lähiveden kalastajan kohdalle (näkyvissä vain POV-näkymässä). */
export function placeSwellPatch(mesh: THREE.Mesh, waves: WaterWaves, at: Vec2 | null): void {
  mesh.visible = at !== null;
  if (!at) {
    waves.uPatch.value.z = 0;
    return;
  }
  const x = Math.round(at.x / SWELL_PATCH_STEP) * SWELL_PATCH_STEP;
  const y = Math.round(at.y / SWELL_PATCH_STEP) * SWELL_PATCH_STEP;
  mesh.position.set(x, 0, -y);
  waves.uPatch.value.set(x, y, SWELL_PATCH_RADIUS);
}

/**
 * Vesialue (ranta miinus saaret) tekstuurina: punainen = vettä, vihreä =
 * sumennettu vesialue, joka nousee rannasta selälle noin SHORE_FADE metrissä.
 * Vihreällä aallokko laantuu rantaa kohti.
 */
function createWaterMask(map: LakeMap): { texture: THREE.Texture; bounds: THREE.Vector4 } {
  const { minX, minY, maxX, maxY } = map.bounds;
  const pad = SHORE_FADE + MASK_METERS;
  const w = Math.ceil((maxX - minX + pad * 2) / MASK_METERS);
  const h = Math.ceil((maxY - minY + pad * 2) / MASK_METERS);
  const x0 = minX - pad;
  const y0 = minY - pad;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  // Rivi 0 = eteläreuna, kuten tekstuurin v = 0.
  const path = (ring: readonly Vec2[]) => {
    ring.forEach((p, i) => {
      const px = (p.x - x0) / MASK_METERS;
      const py = (p.y - y0) / MASK_METERS;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
  };
  ctx.beginPath();
  path(map.shore);
  for (const island of map.islands) path(island);
  ctx.fillStyle = '#fff';
  ctx.fill('evenodd');
  const pixels = ctx.getImageData(0, 0, w, h).data;
  const water = new Float32Array(w * h);
  for (let i = 0; i < water.length; i++) water[i] = pixels[i * 4]! / 255;
  // Kaksi laatikkosumennusta kumpaankin suuntaan ≈ kolmioikkuna.
  const radius = Math.max(1, Math.round(SHORE_FADE / MASK_METERS / 2));
  const soft = boxBlur(boxBlur(water, w, h, radius), w, h, radius);
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < water.length; i++) {
    data[i * 4] = Math.round(water[i]! * 255);
    data[i * 4 + 1] = Math.round(soft[i]! * 255);
    data[i * 4 + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, w, h);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return { texture, bounds: new THREE.Vector4(x0, y0, w * MASK_METERS, h * MASK_METERS) };
}

/** Erotuva laatikkosumennus vaaka- ja pystysuuntaan. */
function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const n = r * 2 + 1;
  for (let y = 0; y < h; y++) {
    let sum = 0;
    for (let x = -r; x <= r; x++) sum += src[y * w + Math.min(w - 1, Math.max(0, x))]!;
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = sum / n;
      sum += src[y * w + Math.min(w - 1, x + r + 1)]! - src[y * w + Math.max(0, x - r)]!;
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) sum += tmp[Math.min(h - 1, Math.max(0, y)) * w + x]!;
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum / n;
      sum += tmp[Math.min(h - 1, y + r + 1) * w + x]! - tmp[Math.max(0, y - r) * w + x]!;
    }
  }
  return out;
}

/**
 * Vedenpinnan pikselikuvio: harvoja välkehtiviä aallonharjoja tummalla pohjalla.
 * ShapeGeometryn UV:t ovat metrejä, joten toisto määrää tekselin koon (0,25 m).
 */
function createWaterTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#1b5a84';
  ctx.fillRect(0, 0, size, size);
  // Kiinteä siemen, jotta kuvio on aina sama.
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 220; i++) {
    const x = Math.floor(rand() * size);
    const y = Math.floor(rand() * size);
    const len = 2 + Math.floor(rand() * 4);
    ctx.fillStyle = rand() < 0.6 ? '#2b7aa6' : '#123a5c';
    ctx.fillRect(x, y, len, 1);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1 / WATER_TEXTURE_METERS, 1 / WATER_TEXTURE_METERS);
  texture.magFilter = THREE.NearestFilter;
  // Kaukaa katsottuna kuvio sulautuu pohjaväriin eikä välky.
  texture.minFilter = THREE.NearestMipmapLinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
