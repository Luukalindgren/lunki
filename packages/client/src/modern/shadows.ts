import * as THREE from 'three';
import { QUALITY, type LookQuality } from '../engine/look';

/** Kalastajan silmin varjot piirretään tämän säteen (m) alueelle katseen suuntaan. */
const POV_RADIUS = 90;
/** Ylhäältä varjoalue on näkyvä alue ja tämän verran (m) reunaa pitkille varjoille. */
const TOP_MARGIN = 25;
/** Valon etäisyys varjoalueen keskeltä (m): riittää korkeimmille puille matalallakin valolla. */
const LIGHT_DISTANCE = 400;
/** Näin matalalta (suunnan y) paistava valo ei enää tee varjoja: ne venyisivät loputtomiin. */
const MIN_ELEVATION = 0.04;
/** Kohtaus käydään läpi näin monen ruudun välein: uudet osat (muut pelaajat) saavat varjon. */
const SCAN_FRAMES = 45;

/** Nämä eivät heitä varjoa: vesi, taivas, sää ja veden päälle piirretyt merkit. */
const NO_CAST = new Set([
  'water',
  'swell',
  'bottom',
  'sky',
  'mist',
  'weather',
  'lightning',
  'spouts',
  'bigWave',
  'fish-shadow',
  'knots',
  'modern-mark',
]);

const lit = (m: THREE.Material): boolean =>
  (m instanceof THREE.MeshLambertMaterial ||
    m instanceof THREE.MeshPhongMaterial ||
    m instanceof THREE.MeshStandardMaterial) &&
  !m.transparent &&
  m.depthWrite;

/** Kasvien kuvat (ristikkäiset levyt, `world/vegetation.ts`) heittävät varjon, mutta eivät saa sitä. */
const cutout = (m: THREE.Material): boolean =>
  m instanceof THREE.MeshBasicMaterial && m.alphaTest > 0 && m.depthWrite && !m.transparent;

/**
 * Modernin ilmeen varjot (#650): kohtauksen aurinko tai kuu heittää varjot
 * yhdestä varjokartasta, joka kulkee kameran mukana. Kartan koko ja pehmeys
 * tulevat laatutasosta. Pelin valot ja kirkkaus ovat ennallaan
 * (`SkyView.grade`); tämä vain kytkee varjot samaan valoon.
 */
export class ShadowRig {
  private readonly light: THREE.DirectionalLight | null;
  private readonly touched = new Set<THREE.Object3D>();
  private readonly dir = new THREE.Vector3(0, 1, 0);
  private readonly written = new THREE.Vector3(NaN, NaN, NaN);
  private readonly focus = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly wasEnabled: boolean;
  private readonly wasType: THREE.ShadowMapType;
  private frames = 0;
  private mapSize = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly renderer: THREE.WebGLRenderer,
  ) {
    let light: THREE.DirectionalLight | null = null;
    scene.traverse((o) => {
      if (!light && o instanceof THREE.DirectionalLight) light = o;
    });
    this.light = light;
    this.wasEnabled = renderer.shadowMap.enabled;
    this.wasType = renderer.shadowMap.type;
  }

  update(camera: THREE.Camera, quality: LookQuality): void {
    const light = this.light;
    if (!light) return;
    const level = QUALITY[quality];
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = level.softShadows ? THREE.PCFShadowMap : THREE.BasicShadowMap;
    // Peli asettaa valon paikan suunnasta joka askeleella; oma siirto tunnistetaan,
    // jotta suunta luetaan vain pelin kirjoittamasta paikasta.
    if (!light.position.equals(this.written)) this.dir.copy(light.position).normalize();
    const casting = this.dir.y > MIN_ELEVATION && light.intensity > 0.01;
    light.castShadow = casting;
    if (this.frames++ % SCAN_FRAMES === 0) this.scan();
    if (!casting) return;

    const radius = this.fit(camera);
    const shadow = light.shadow;
    if (this.mapSize !== level.shadowMap) {
      this.mapSize = level.shadowMap;
      shadow.mapSize.set(level.shadowMap, level.shadowMap);
      // Kartta luodaan uudelleen uudessa koossa.
      shadow.map?.dispose();
      shadow.map = null;
    }
    const texel = (radius * 2) / level.shadowMap;
    // Varjoalue liikkuu kartan pikselin askelin, jolloin varjon reuna ei väreile kameran mukana.
    this.right.set(0, 1, 0).cross(this.dir).normalize();
    this.up.copy(this.dir).cross(this.right);
    const x = Math.round(this.focus.dot(this.right) / texel) * texel;
    const y = Math.round(this.focus.dot(this.up) / texel) * texel;
    const z = this.focus.dot(this.dir);
    this.focus
      .copy(this.right)
      .multiplyScalar(x)
      .addScaledVector(this.up, y)
      .addScaledVector(this.dir, z);

    const cam = shadow.camera;
    cam.left = cam.bottom = -radius;
    cam.right = cam.top = radius;
    cam.near = 1;
    cam.far = LIGHT_DISTANCE * 2;
    cam.updateProjectionMatrix();
    shadow.bias = -0.0004;
    shadow.normalBias = texel * 1.5;
    shadow.radius = level.softShadows ? 1.6 : 1;
    light.target.position.copy(this.focus);
    light.target.updateMatrixWorld();
    light.position.copy(this.focus).addScaledVector(this.dir, LIGHT_DISTANCE);
    this.written.copy(light.position);
    light.updateMatrixWorld();
  }

  /** Varjoalueen keskipiste (`focus`) ja säde kamerasta. */
  private fit(camera: THREE.Camera): number {
    if (camera instanceof THREE.OrthographicCamera) {
      const w = (camera.right - camera.left) / camera.zoom;
      const h = (camera.top - camera.bottom) / camera.zoom;
      this.focus.setFromMatrixPosition(camera.matrixWorld).setY(0);
      return Math.max(w, h) / 2 + TOP_MARGIN;
    }
    // Kalastajan silmin: alue katseen suuntaan, koska selän takana olevia varjoja ei näy.
    camera.getWorldDirection(this.focus).setY(0);
    if (this.focus.lengthSq() < 1e-6) this.focus.set(0, 0, -1);
    this.focus.normalize().multiplyScalar(POV_RADIUS * 0.7);
    this.focus.add(this.right.setFromMatrixPosition(camera.matrixWorld)).setY(0);
    return POV_RADIUS;
  }

  /** Merkitsee kohtauksen osat: valaistut kiinteät pinnat heittävät ja saavat varjon. */
  private scan(): void {
    const visit = (o: THREE.Object3D, cast: boolean, plants: boolean): void => {
      const casts = cast && !NO_CAST.has(o.name);
      const plant = plants || o.name === 'vegetation';
      if (o instanceof THREE.Mesh) {
        const materials: THREE.Material[] = Array.isArray(o.material) ? o.material : [o.material];
        const receives = materials.every(lit);
        const wanted = casts && (receives || (plant && materials.every(cutout)));
        if (o.castShadow !== wanted || o.receiveShadow !== receives) {
          o.castShadow = wanted;
          o.receiveShadow = receives;
          this.touched.add(o);
        }
      }
      for (const child of o.children) visit(child, casts, plant);
    };
    visit(this.scene, true, false);
  }

  dispose(): void {
    for (const o of this.touched) {
      o.castShadow = false;
      o.receiveShadow = false;
    }
    this.touched.clear();
    const light = this.light;
    if (light) {
      light.castShadow = false;
      light.shadow.map?.dispose();
      light.shadow.map = null;
      light.target.position.set(0, 0, 0);
      light.target.updateMatrixWorld();
      // Suunta takaisin pelin muotoon siltä varalta, ettei peli kirjoita sitä heti.
      light.position.copy(this.dir).multiplyScalar(120);
    }
    this.renderer.shadowMap.enabled = this.wasEnabled;
    this.renderer.shadowMap.type = this.wasType;
  }
}
