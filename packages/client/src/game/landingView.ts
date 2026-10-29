import * as THREE from 'three';
import type { Fish, FishingEvents, SpeciesId, Vec2 } from '@lunki/shared';
import { toWorld } from '../world/lakeMesh';
import { fishLengthCm, fishPixels, fishSpriteWidth } from '../ui/fishArt';
import { pixelTexture } from './pixelSprite';

type Landed = NonNullable<FishingEvents['landed']>;

/** Noston kesto (s): heilautus on nopea, haavilla ensin haavi kalan alle. */
const LIFT_TIME: Record<Landed['by'], number> = { swing: 0.7, hand: 1.1, net: 1.4 };
/** Noston kesto (s): punnituskortti odottaa, että kala on kalastajan edessä. */
export const liftTime = (by: Landed['by']): number => LIFT_TIME[by];
/** Haavi kalan alle tämän osuuden ajasta, sitten nosto. */
const NET_DIP = 0.35;
/** Kala näkyy vielä hetken kalastajan edessä ennen punnitusta (s). */
const HOLD_TIME = 0.6;
/**
 * Ylhäältä katsottuna kala piirretään isompana, jotta se erottuu: vähintään
 * tämä kerroin ja vähintään `TOP_MIN_PX` kuvapistettä pitkä loitonnettunakin.
 */
const TOP_SCALE = 1.6;
const TOP_MIN_PX = 26;
/** Ylhäältä pinnan kuvat piirretään tähän korkeuteen veden päälle (m), kuten viehe. */
const TOP_SURFACE_Y = 0.3;
/** Ylhäältä nostettu kala renkaan ja kalastajan yläpuolella (m). */
const TOP_LAP_Y = 3;
/** Haavin kehän säde (m) ja pussin syvyys. */
const HOOP = 0.4;
const BAG = 0.35;

const NET_FRAME = 0x3d3428;
const NET_MESH = 0x8a949e;

/**
 * Nosto näkyväksi (#366): väsynyt kala kyljellään pinnassa vavan edessä ja
 * nosto kyytiin siimasta tai haavilla. Kala on lajin pikselikuva
 * (`fishArt`) samassa koossa kuin punnituskortissa, haavi viivoista.
 */
export class LandingView {
  readonly group = new THREE.Group();
  pov = false;
  /** Ylhäältä-näkymän mittakaava (m kuvapisteelle). */
  metersPerPixel = 0.125;
  private readonly sprite: THREE.Sprite;
  private readonly net: THREE.Group;
  private readonly line: THREE.Line;
  private readonly textures = new Map<string, { tex: THREE.Texture; aspect: number }>();
  private lift: {
    by: Landed['by'];
    from: Vec2;
    species: SpeciesId;
    weight: number;
    start: number;
  } | null = null;

  constructor() {
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ alphaTest: 0.5 }));
    this.sprite.visible = false;
    this.net = createNet();
    this.net.visible = false;
    this.line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color: 0xc3cbd2 }),
    );
    this.line.visible = false;
    this.group.add(this.sprite, this.net, this.line);
  }

  /** Kala nousi: nostoanimaatio alkaa kalan paikalta. */
  start(landed: Landed, species: SpeciesId, weight: number): void {
    this.lift = { ...landed, from: { ...landed.at }, species, weight, start: now() };
  }

  /** Nostetaanko juuri (kala näkyy tämän näkymän kuvana eikä varjona). */
  get lifting(): boolean {
    return this.lift !== null;
  }

  /**
   * Yksi kuva. `surfaced` = nostovaihe kesken (kala pinnassa), `net` = isolle
   * kalalle haavi valmiina. `tip` on vavan kärki maailmassa, `tube` ja
   * `heading` kalastajan paikka ja katse.
   */
  update(
    surfaced: Fish | null,
    net: boolean,
    tip: THREE.Vector3,
    tube: Vec2,
    heading: number,
  ): void {
    const t = now();
    const front = (d: number, h: number) =>
      toWorld({ x: tube.x + Math.cos(heading) * d, y: tube.y + Math.sin(heading) * d }, h);
    this.line.visible = false;
    this.net.visible = false;
    this.sprite.visible = false;

    if (this.lift) {
      const l = this.lift;
      const dur = LIFT_TIME[l.by];
      const age = t - l.start;
      if (age > dur + HOLD_TIME) {
        this.lift = null;
        return;
      }
      const k = Math.min(1, age / dur);
      // Kala kalastajan eteen katseen alle. Ylhäältä se nousee renkaan päälle
      // syliin ja piirtyy kalastajan päälle, jotta se näkyy.
      const end = this.pov ? front(1.3, 0.42) : front(0.2, TOP_LAP_Y);
      const from = toWorld(l.from, 0.05);
      let pos: THREE.Vector3;
      let hang = 0;
      if (l.by === 'net') {
        const dip = Math.min(1, k / NET_DIP);
        const up = Math.max(0, (k - NET_DIP) / (1 - NET_DIP));
        // Haavi painuu kalan alle ja nousee sen kanssa.
        const hoopStart = front(0.9, 0.1);
        const under = from.clone().setY(-0.12);
        const hoop =
          up > 0
            ? arc(under, end.clone().setY(end.y - 0.05), ease(up), 0.25)
            : hoopStart.lerp(under, ease(dip));
        this.showNet(hoop, tube, heading, l.species, l.weight);
        pos = hoop.clone().setY(hoop.y + 0.06);
      } else {
        pos = arc(from, end, ease(k), l.by === 'swing' ? 0.5 : 0.3);
        // Siima vavan kärjestä kalan suuhun: silmin kala roikkuu pää ylöspäin,
        // ylhäältä kuono osoittaa vapaa kohti.
        const { w, h } = this.size(l.species, l.weight);
        hang = this.pov ? 1 : 0;
        const mouth = this.pov
          ? pos.clone().setY(pos.y + h / 2)
          : pos
              .clone()
              .add(
                new THREE.Vector3(Math.cos(heading), 0, -Math.sin(heading)).multiplyScalar(w / 2),
              );
        this.showLine(tip, mouth);
      }
      const wiggle = Math.sin(age * 22) * 0.25 * (1 - k * 0.5);
      this.showFish(l.species, l.weight, pos, hang, wiggle, heading);
      return;
    }

    if (!surfaced) return;
    // Nostovaihe: väsynyt kala kyljellään pinnassa, iso kala haavi valmiina.
    const wiggle = Math.sin(t * 9) * 0.12;
    this.showFish(
      surfaced.species,
      surfaced.weight,
      toWorld(surfaced.pos, 0.04),
      0,
      wiggle,
      surfaced.heading,
    );
    if (net) this.showNet(front(0.9, 0.02), tube, heading, surfaced.species, surfaced.weight);
  }

  /** Kuvan suurennos kalan oikeaan kokoon nähden (silmin 1). */
  private grow(species: SpeciesId, weight: number): number {
    if (this.pov) return 1;
    const len = fishLengthCm(species, weight) / 100;
    return Math.max(TOP_SCALE, (TOP_MIN_PX * this.metersPerPixel) / len);
  }

  private size(species: SpeciesId, weight: number): { w: number; h: number } {
    const { aspect } = this.texture(species, weight);
    const w = (fishLengthCm(species, weight) / 100) * this.grow(species, weight);
    return { w, h: w * aspect };
  }

  /** Kala kuvana; `hang` 1 = roikkuu siimassa pää ylöspäin. */
  private showFish(
    species: SpeciesId,
    weight: number,
    pos: THREE.Vector3,
    hang: number,
    wiggle: number,
    heading: number,
  ): void {
    const mat = this.sprite.material;
    const { tex } = this.texture(species, weight);
    if (mat.map !== tex) {
      mat.map = tex;
      mat.needsUpdate = true;
    }
    const { w, h } = this.size(species, weight);
    // Ylhäältä korkeus näkyy koon kasvuna kuten lentävällä vieheellä.
    const up = this.pov ? 1 : 1 + Math.max(0, pos.y) * 0.08;
    this.sprite.scale.set(w * up, h * up, 1);
    this.sprite.position.copy(pos);
    if (!this.pov) this.sprite.position.y = Math.max(pos.y, TOP_SURFACE_Y);
    // Kuvassa kuono on vasemmalla. Ylhäältä kala osoittaa uintisuuntaansa,
    // silmin se on kyljellään, ja siimassa se roikkuu pää ylöspäin.
    const lying = this.pov ? 0 : heading - Math.PI;
    mat.rotation = lying + hang * (-Math.PI / 2 - lying) + wiggle;
    this.sprite.visible = true;
  }

  private showLine(tip: THREE.Vector3, mouth: THREE.Vector3): void {
    const pos = this.line.geometry.attributes.position as THREE.BufferAttribute;
    pos.setXYZ(0, tip.x, tip.y, tip.z);
    pos.setXYZ(1, mouth.x, mouth.y, mouth.z);
    pos.needsUpdate = true;
    this.line.geometry.computeBoundingSphere();
    this.line.visible = true;
  }

  /** Haavin kehä kohdassa `hoop`; varsi kalastajan käteen. Haavi kasvaa kalan mukana. */
  private showNet(
    hoop: THREE.Vector3,
    tube: Vec2,
    heading: number,
    species: SpeciesId,
    weight: number,
  ): void {
    const g = this.grow(species, weight);
    this.net.position.copy(hoop);
    if (!this.pov) this.net.position.y = Math.max(hoop.y, TOP_SURFACE_Y);
    this.net.scale.setScalar(g);
    const hand = toWorld(
      { x: tube.x + Math.cos(heading) * 0.25, y: tube.y + Math.sin(heading) * 0.25 },
      0.35,
    );
    const handle = this.net.userData.handle as THREE.Line;
    const pos = handle.geometry.attributes.position as THREE.BufferAttribute;
    // Varsi kehän takareunasta käteen (ryhmän paikallisissa koordinaateissa).
    const back = new THREE.Vector3(-Math.cos(heading) * HOOP, 0, Math.sin(heading) * HOOP);
    pos.setXYZ(0, back.x, back.y, back.z);
    const o = this.net.position;
    pos.setXYZ(1, (hand.x - o.x) / g, (hand.y - o.y) / g, (hand.z - o.z) / g);
    pos.needsUpdate = true;
    handle.geometry.computeBoundingSphere();
    this.net.visible = true;
  }

  private texture(species: SpeciesId, weight: number): { tex: THREE.Texture; aspect: number } {
    const width = fishSpriteWidth(species, weight);
    const key = `${species}:${width}`;
    let entry = this.textures.get(key);
    if (!entry) {
      const px = fishPixels(species, width);
      const tex = pixelTexture(px);
      entry = { tex, aspect: px.height / px.width };
      this.textures.set(key, entry);
    }
    return entry;
  }

  dispose(): void {
    for (const { tex } of this.textures.values()) tex.dispose();
    this.textures.clear();
  }
}

const now = () => performance.now() / 1000;
const ease = (k: number) => k * k * (3 - 2 * k);

/** Kaari kahden pisteen välillä; `lift` = lisäkorkeus keskellä (m). */
function arc(a: THREE.Vector3, b: THREE.Vector3, k: number, lift: number): THREE.Vector3 {
  return a
    .clone()
    .lerp(b, k)
    .setY(a.y + (b.y - a.y) * k + Math.sin(k * Math.PI) * lift);
}

/** Haavi: kehä, pussi ja varsi viivoina. */
function createNet(): THREE.Group {
  const g = new THREE.Group();
  const ring: THREE.Vector3[] = [];
  const bag: THREE.Vector3[] = [];
  const n = 12;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    const p0 = new THREE.Vector3(Math.cos(a0) * HOOP, 0, Math.sin(a0) * HOOP);
    ring.push(p0, new THREE.Vector3(Math.cos(a1) * HOOP, 0, Math.sin(a1) * HOOP));
    // Pussin viivat kehältä pohjaan.
    if (i % 2 === 0) bag.push(p0, new THREE.Vector3(p0.x * 0.25, -BAG, p0.z * 0.25));
  }
  g.add(
    new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(ring),
      new THREE.LineBasicMaterial({ color: NET_FRAME }),
    ),
    new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(bag),
      new THREE.LineBasicMaterial({ color: NET_MESH }),
    ),
  );
  const handle = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
    new THREE.LineBasicMaterial({ color: NET_FRAME }),
  );
  g.add(handle);
  g.userData.handle = handle;
  return g;
}
