import * as THREE from 'three';
import {
  BIG_WAVE,
  BOAT_WAVE_FACTOR,
  Rng,
  SPOUT,
  activeSpouts,
  bigWaveDir,
  bigWaveHeight,
  boatCapsizes,
  capsizes,
  distance,
  planBigWaves,
  planLightning,
  planSeconds,
  planWaterspouts,
  planWeather,
  seasonOf,
  capsizeTimeOut,
  isColdWater,
  resolveStrike,
  rodTip,
  spoutAffects,
  spoutCapture,
  spoutLanding,
  spoutWind,
  windVector,
  withoutAnchor,
  type BigWave,
  type CompetitionSettings,
  type CompetitionState,
  type Daylight,
  type FishingState,
  type LakeMap,
  type Penalty,
  type SpoutFlight,
  type Strike,
  type TubeState,
  type Vec2,
  type WaterBody,
  type Waterspout,
  type RaceStatsCounter,
} from '@lunki/shared';
import type { Sounds } from '../audio/sounds';
import type { NetWorld } from '../net/netWorld';
import type { Hud } from '../ui/hud';
import {
  SHORE_FADE,
  createSwellPatch,
  placeSwellPatch,
  shoreFade,
  toWorld,
  type createWaterWaves,
} from '../world/lakeMesh';
import { SWELL_GAIN, Swell } from '../world/swell';
import { WAVE_FACTOR_SCALE, WaveField } from '../world/waveField';
import { decimal, t } from '../i18n';
import { skyName } from '../i18n/names';
import { BigWaveView } from './bigWaveView';
import { LightningView } from './lightningView';
import { MistView } from './mistView';
import type { Penalties } from './penalties';
import type { PovCamera } from './povCamera';
import { SkyView, auroraFor, flashStrength, moonPhaseFor } from './skyView';
import { SpoutView, flightPose } from './spoutView';
import type { TopDownCamera } from './topDownCamera';
import { WeatherView, compassIn, windFrom, windName } from './weatherView';
import { controlText } from './controls';

const LAND_COLOR = 0x24502c;
/** Lähiveden aallokon esiin- ja poishäivytyksen kesto (s). */
const SWELL_FADE_TIME = 2;
/** Pohjakuvion ajelehtiminen (m/s) tuulen metriä sekunnissa kohden. */
const WATER_DRIFT = 0.02;

/** Mitä sää tarvitsee pelistä. */
export interface WeatherHost {
  readonly hud: Hud;
  readonly sounds: Sounds;
  readonly netWorld: NetWorld | undefined;
  readonly competition: CompetitionState;
  readonly settings: CompetitionSettings;
  readonly penalties: Penalties;
  readonly water: WaterBody;
  readonly map: LakeMap;
  readonly fishing: FishingState;
  readonly raceStatsCounter: RaceStatsCounter;
  /** Oma rengas; trombi voi siirtää sen muualle (yksinpeli). */
  tube: TubeState;
  prevTube: TubeState;
  readonly inBoat: boolean;
  /** Kalastajan katsesuunta. */
  readonly facing: number;
  readonly viewMode: 'top' | 'pov';
  readonly view: TopDownCamera;
  readonly pov: PovCamera;
  readonly clock: number;
  readonly daylight: Daylight;
  /** Rangaistus omasta osumasta: kalastus nollataan. Palauttaa seurauksen tekstinä. */
  punish(penalty: Penalty, label: string, timeOut?: number): string;
  /** Kaatuminen tai salama tulossivun karttaan. */
  logEvent(kind: 'capsize' | 'lightning', pos: Vec2): void;
  /** Roiske vedessä (laskeutuminen lennosta). */
  splashAt(pos: Vec2): void;
}

/**
 * Sää, valo ja vesi kisan aikana: sääpalvelu ja sadepisarat, vuorokaudenaika
 * ja yksi valon sävytys (`SkyView`), usva, aallokko ja renkaan keinunta,
 * salamat, isot aallot ja trombit. Yksinpelissä osumat ratkaistaan täällä,
 * moninpelissä palvelin ilmoittaa ne (`onStrike`, `onCapsize`, `startFlight`).
 */
export class WeatherController {
  readonly view: WeatherView;
  /** Vuoden- ja vuorokaudenaika: taivas, usva, valo ja paletin sävytys. */
  readonly sky: SkyView;
  private readonly mist: MistView;
  readonly waves: WaveField;
  private readonly hemi = new THREE.HemisphereLight(0xeef2f3, 0x24502c, 1.5);
  private readonly sun = new THREE.DirectionalLight(0xfff3b0, 1.5);
  readonly lightning = new LightningView();
  /** Ruudun välähdyksen voimakkuus viimeisimmästä salamasta: lähellä kirkkaampi. */
  private flashStrength = 0;
  /** Ruudun tärinän voimakkuus viimeisimmästä salamasta (0–1). */
  private shakeStrength = 0;
  /** Salama iski aivan viereen: kuva kääntyy hetkeksi negatiiviksi. */
  private flashInvert = false;
  /** Sisäisen resoluution korkeus (px). */
  heightPx = 1;
  /** Yksinpelin salamat (moninpelissä palvelin ilmoittaa iskut). */
  private readonly strikes: Strike[];
  private nextStrike = 0;
  private readonly bigWaveView = new BigWaveView();
  /** Isot aallot: varoitukset ja näkymä molemmissa, osumat yksinpelissä. */
  private readonly bigWaves: BigWave[];
  private nextWave = 0;
  private warnedWave = -1;
  private readonly rings: Vec2[][];
  readonly spouts: Waterspout[];
  private readonly spoutView = new SpoutView();
  private spoutsSeen = 0;
  private spoutWarnTimer = 0;
  /** Lähimmän trombin läheisyys 0–1 pauhua varten. */
  spoutNear = 0;
  /** Lähimmän trombin paikka pauhun suuntaa varten; null = ei trombia. */
  spoutAt: Vec2 | null = null;
  /** Oma lento trombin mukana (kisa-aika, s), ja yksinpelin laskeutumispaikkojen arpa. */
  flight: (SpoutFlight & { t0: number }) | null = null;
  private readonly spoutRng: Rng;
  /** Lentävän renkaan varjo vedessä: kertoo ylhäältä katsottuna, kuinka korkealla ollaan. */
  private readonly flightShadow = new THREE.Mesh(
    new THREE.CircleGeometry(1, 12).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x0b0f14 }),
  );
  /** Aallokko: keinunta ja POV-näkymän aaltoileva lähivesi. */
  private readonly swell: Swell;
  private readonly swellPatch: THREE.Mesh;
  /** Lähiveden aallokko päällä (hystereesillä, jotteivät puuskat vilkuta sitä). */
  private swellOn = false;
  /** Renkaan keinunta (tasoitettu): nosto (m), kallistus ja nyökkäys (rad). */
  readonly rock = { lift: 0, roll: 0, pitch: 0 };
  /** Ohi menevän ison aallon nosto (m) renkaan kohdalla. */
  private bigWaveLift = 0;
  /** Ukkonen tai myrsky päällä: vieheen ollessa ulkona tilanneohje kehottaa kelaamaan. */
  thunderNow = false;

  constructor(
    private readonly host: WeatherHost,
    private readonly scene: THREE.Scene,
    private readonly waterWaves: ReturnType<typeof createWaterWaves>,
    seed: number,
  ) {
    const { map, settings, water } = host;
    const season = seasonOf(settings);
    this.sky = new SkyView(season, {
      aurora: auroraFor(seed, season),
      moonPhase: moonPhaseFor(seed),
    });
    scene.add(this.hemi, this.sun);
    this.mist = new MistView((p) => water.isWater(p), map.bounds, waterWaves);
    scene.add(this.sky.dome, this.mist.group);
    const planS = planSeconds(settings);
    const plan = planWeather(seed, settings.weather ?? 'realistic', planS, seasonOf(settings));
    this.view = new WeatherView(plan);
    this.strikes = host.netWorld ? [] : planLightning(plan, seed, planS);
    this.bigWaves = planBigWaves(plan, seed, planS);
    this.rings = [map.shore, ...map.islands];
    this.spouts = planWaterspouts(plan, seed, planS, water, map.bounds);
    this.spoutRng = new Rng(seed ^ 0x51ed270b);
    this.waves = new WaveField(map);
    waterWaves.uWaveTex.value = this.waves.texture;
    waterWaves.uWaveBounds.value.copy(this.waves.bounds);
    const center = {
      x: (map.bounds.minX + map.bounds.maxX) / 2,
      y: (map.bounds.minY + map.bounds.maxY) / 2,
    };
    this.swell = new Swell(center);
    waterWaves.uSwellOrigin.value.set(center.x, center.y);
    this.swellPatch = createSwellPatch(map, waterWaves);
    this.flightShadow.visible = false;
  }

  /** Säänäkymän osat kohtaukseen (sadepisarat, salama, aallot, trombit). */
  get groups(): THREE.Object3D[] {
    return [this.view.group, this.lightning.group, this.bigWaveView.group, this.spoutView.group];
  }

  /** Lähiveden aaltoileva pinta ja lentävän renkaan varjo. */
  get waterParts(): { swellPatch: THREE.Mesh; flightShadow: THREE.Mesh } {
    return { swellPatch: this.swellPatch, flightShadow: this.flightShadow };
  }

  /** Sää nyt. */
  get now() {
    return this.view.now;
  }

  /** Tuuli nyt (m/s); kisan päätyttyä tyyntä. */
  get wind(): Vec2 {
    return this.host.competition.finished ? { x: 0, y: 0 } : windVector(this.view.now);
  }

  /** Renkaaseen vaikuttava tuuli: sään tuuli ja trombin imu (heittoon trombi ei vaikuta). */
  get tubeWind(): Vec2 {
    const w = this.wind;
    const now = this.host.competition.elapsed;
    if (this.host.competition.finished) return w;
    if (!spoutAffects(this.host.penalties.capsizedUntilAbs, now)) return w;
    return spoutWind(w, this.spouts, now, this.host.tube.pos);
  }

  /** Säätapahtumat yhdeltä askeleelta ennen renkaan liikettä. */
  step(dt: number): void {
    if (!this.host.netWorld) this.strikeLightning();
    this.lightning.update(dt);
    this.updateBigWaves();
    this.updateSpouts(dt);
  }

  /**
   * Trombit: näkymä, varoitukset ja yksinpelissä nappaus (moninpelissä
   * palvelin). Trombi näkyy kaukaa ja imee renkaan, joka tulee liian lähelle.
   */
  private updateSpouts(dt: number): void {
    const host = this.host;
    const penalties = host.penalties;
    const now = host.competition.elapsed;
    const spots = activeSpouts(this.spouts, now);
    this.spoutView.update(dt, spots);
    // Pauhu kuuluu jo kaksinkertaiselta imuetäisyydeltä.
    const dist = spots.map((p) => distance(p, host.tube.pos));
    const nearest = Math.min(Infinity, ...dist);
    this.spoutNear = Math.max(0, 1 - nearest / (SPOUT.radius * 2));
    this.spoutAt = spots[dist.indexOf(nearest)] ?? null;
    const born = this.spouts.filter((s) => s.t0 <= now).length;
    if (born > this.spoutsSeen) {
      this.spoutsSeen = born;
      if (spots.length > 0) {
        host.hud.showMessage(t('game.spoutSeen'), 3, 'alert');
        host.sounds.playFrom('spoutSeen', this.spoutAt ?? host.tube.pos);
      }
    }
    if (!host.netWorld && spoutAffects(penalties.capsizedUntil, now)) {
      const fling = spoutCapture(this.spouts, now, host.tube.pos);
      if (fling) {
        const from = { ...host.tube.pos };
        const to = spoutLanding(from, fling, host.water, () => this.spoutRng.next(), spots);
        // Rengas on heti perillä; lento piirretään kaarena lähtöpaikasta.
        // Trombi repäisee ankkurin irti (#355).
        const free = withoutAnchor(host.tube);
        host.tube = to
          ? { ...free, pos: to, vel: { x: 0, y: 0 }, angVel: 0 }
          : { ...free, vel: fling };
        host.prevTube = host.tube;
        penalties.capsizedUntil = now + (to ? SPOUT.flight : 0) + BIG_WAVE.recover;
        this.startFlight(to ? { from, to } : null);
      }
    }
    // Imualueella muistutetaan pakenemaan.
    this.spoutWarnTimer -= dt;
    const near = spots.some((p) => distance(p, host.tube.pos) < SPOUT.radius);
    if (near && penalties.capsizeLeft === 0 && this.spoutWarnTimer <= 0) {
      host.hud.showMessage(
        controlText(host.inBoat ? 'game.spoutPullBoat' : 'game.spoutPull'),
        2,
        'alert',
      );
      this.spoutWarnTimer = 4;
    }
  }

  /**
   * Isot aallot: varoitus ennen aaltoa, jos se on vaarallinen omalla
   * kohdalla, ja yksinpelissä osuman ratkaisu (moninpelissä palvelin).
   */
  private updateBigWaves(): void {
    const host = this.host;
    const now = host.competition.elapsed;
    const w = this.view.now;
    // Jokainen aalto tulee omasta suunnastaan tuulen ympäriltä.
    const height = (wave: BigWave) =>
      bigWaveHeight(this.rings, host.tube.pos, w.windSpeed, bigWaveDir(wave, w.windDir));
    // Pientä aaltoa (suojaisessa poukamassa tai heikossa tuulessa) ei huomaa.
    const felt = (h: number) => h >= BIG_WAVE.capsizeHeight / 2;
    while (this.nextWave < this.bigWaves.length && this.bigWaves[this.nextWave]!.t <= now) {
      const wave = this.bigWaves[this.nextWave++]!;
      const h = height(wave);
      // Kisaan palatessa ohi menneet aallot eivät kuulu kerralla.
      const dir = bigWaveDir(wave, w.windDir);
      // Aalto kuuluu suunnasta, josta se tulee.
      const from = {
        x: host.tube.pos.x - Math.cos(dir) * 30,
        y: host.tube.pos.y - Math.sin(dir) * 30,
      };
      if (felt(h) && now - wave.t < 1) host.sounds.playFrom('bigWave', from);
      const over = host.inBoat ? boatCapsizes : capsizes;
      if (!host.netWorld && host.penalties.capsizeLeft === 0 && over(host.tube.heading, dir, h)) {
        host.penalties.capsizedUntil = now + BIG_WAVE.recover;
        this.onCapsize('wave');
      }
    }
    const next = this.bigWaves[this.nextWave];
    const prev = this.bigWaves[this.nextWave - 1];
    // Harja näkyy tulossa olevasta aallosta tai juuri ohi menneestä.
    const shown = next && next.t - now <= BIG_WAVE.warning ? next : prev;
    const h = shown ? height(shown) : 0;
    const until = shown && felt(h) ? shown.t - now : null;
    const dir = shown ? bigWaveDir(shown, w.windDir) : w.windDir;
    this.bigWaveView.update(until, dir, host.tube.pos);
    // Harjan kohdalla rengas nousee aallon päälle ja laskee takaisin.
    this.bigWaveLift = until !== null ? 0.5 * SWELL_GAIN * h * Math.exp(-((until / 0.8) ** 2)) : 0;
    if (!next || next.t - now > BIG_WAVE.warning || this.warnedWave === this.nextWave) return;
    this.warnedWave = this.nextWave;
    // Vene kaatuu vasta korkeammasta aallosta (#263).
    if (height(next) >= BIG_WAVE.capsizeHeight * (host.inBoat ? BOAT_WAVE_FACTOR : 1))
      host.hud.showMessage(
        t(host.inBoat ? 'game.bigWaveBoat' : 'game.bigWave', {
          from: windFrom(bigWaveDir(next, w.windDir)),
        }),
        3,
        'alert',
      );
  }

  /** Lähimmän trombin etäisyys ja suunta säärivillä, esim. " · trombi 320 m lounaassa". */
  private spoutText(): string {
    const p = this.host.tube.pos;
    let best: Vec2 | null = null;
    for (const c of activeSpouts(this.spouts, this.host.competition.elapsed))
      if (!best || distance(c, p) < distance(best, p)) best = c;
    if (!best) return '';
    const d = Math.round(distance(best, p) / 10) * 10;
    return t('game.spoutNear', { d, dir: compassIn(Math.atan2(best.y - p.y, best.x - p.x)) });
  }

  /** Trombi nappasi: lento muualle järvelle (null = vain kaatuu paikalleen). */
  startFlight(flight: SpoutFlight | null): void {
    const now = this.host.competition.elapsed;
    this.flight = flight ? { ...flight, t0: now } : null;
    this.onCapsize('spout');
    // Kumossa kellumisen animaatio alkaa vasta laskeutuessa.
    if (flight) this.host.penalties.capsizedAt = now + SPOUT.flight;
  }

  /** Lennon asento nyt, tai null jos ei lennetä. Laskeutuessa molskahtaa. */
  flightNow(): ReturnType<typeof flightPose> | null {
    const f = this.flight;
    if (!f) return null;
    const k = (this.host.competition.elapsed - f.t0) / SPOUT.flight;
    if (k >= 1 || k < 0) {
      this.flight = null;
      if (k >= 1) {
        this.host.sounds.play('landing');
        this.host.splashAt(this.host.tube.pos);
      }
      return null;
    }
    return flightPose(f, k, this.host.tube.pos);
  }

  /** Oma rengas kaatui ison aallon tai trombin takia. */
  onCapsize(cause: 'wave' | 'spout'): void {
    const host = this.host;
    host.penalties.capsizedAt = host.competition.elapsed;
    host.raceStatsCounter.capsize(cause === 'spout' && this.flight !== null);
    // Moninpelissä kaatumiset kirjataan palvelimen viesteistä kaikille.
    if (!host.netWorld) host.logEvent('capsize', this.flight?.from ?? host.tube.pos);
    host.sounds.play(cause === 'spout' ? 'spoutCapsized' : 'capsized');
    const kind = host.settings.capsizePenalty ?? 'none';
    const season = seasonOf(host.settings);
    const penalty = host.punish(kind, t('game.capsizeTimeOut'), capsizeTimeOut(season));
    // Syy ja ohje kumossa-ajastimen alle; jäähy näkyy omana rivinään, ja
    // kylmä vesi (#427) kertoo, miksi se on tavallista pidempi.
    host.penalties.setNote(
      `${t(cause === 'wave' ? 'game.capsized' : this.flight ? 'game.spoutGrabbed' : 'game.spoutTipped')} ${t(cause === 'wave' ? (host.inBoat ? 'game.capsizeHintBoat' : 'game.capsizeHint') : this.flight ? 'game.flightHint' : 'game.spoutHint')}`,
      kind === 'lose-catch'
        ? penalty
        : kind === 'time-out' && isColdWater(season)
          ? t('game.coldWater')
          : '',
    );
  }

  /** Yksinpeli: salamat kisan kellon mukaan, kuten palvelimella. */
  private strikeLightning(): void {
    const host = this.host;
    const f = host.fishing;
    while (
      this.nextStrike < this.strikes.length &&
      this.strikes[this.nextStrike]!.t <= host.competition.elapsed
    ) {
      const strike = this.strikes[this.nextStrike++]!;
      const rodUp =
        (f.hookedId !== null || f.stage === 'flight' || f.stage === 'water') &&
        host.penalties.timeOutLeft === 0;
      const result = resolveStrike(
        strike,
        [{ id: 'me', pos: host.tube.pos, rodUp }],
        host.water,
        host.map.bounds,
      );
      this.onStrike(result.pos, result.victims.length > 0);
    }
  }

  /** Salama iski kohtaan `pos`; `hitMe` = osui omaan vapaan. */
  onStrike(pos: Vec2, hitMe: boolean): void {
    const host = this.host;
    // Osuma iskee vavan kärkeen, joten salama näkyy myös kalastajan silmin.
    const at = hitMe ? rodTip(host.tube.pos, host.facing) : pos;
    const d = hitMe ? 0 : distance(pos, host.tube.pos);
    this.lightning.strike(at);
    host.logEvent('lightning', pos);
    host.raceStatsCounter.lightning(d, hitMe);
    this.flashStrength = flashStrength(d);
    this.shakeStrength = Math.max(0, 1 - d / 500);
    this.flashInvert = d < 60;
    // Jyrähdys kuuluu salaman suunnasta.
    host.sounds.playFrom('thunder', at, d);
    if (d < 150) host.sounds.play('lightningClose');
    if (!hitMe) return;
    const kind = host.settings.lightningPenalty ?? 'none';
    const penalty = host.punish(kind, t('game.lightningTimeOut'));
    // Jäähyllä selitys ajastimen alle, muuten ilmoituksena.
    if (kind === 'time-out' || kind === 'out')
      host.penalties.setNote(`${t('game.lightningHit')} ${t('game.lightningHint')}`);
    else
      host.hud.showMessage(
        `${t('game.lightningHit')}\n${penalty || t('game.lightningHint')}`,
        4,
        'alert',
      );
  }

  /** Sää, taivas, valo ja aallot ruudulle ja säärivi HUD:iin. */
  update(dt: number): void {
    const host = this.host;
    const w = this.view.update(
      dt,
      host.competition.elapsed,
      host.tube.pos,
      host.viewMode === 'pov'
        ? null
        : { metersPerPixel: host.view.metersPerPixel, width: host.view.width },
      {
        message: (text) => host.hud.showMessage(text, 3, 'alert'),
        rumble: () => host.sounds.play('distantThunder'),
      },
    );
    this.thunderNow = w.sky === 'thunder' || w.sky === 'storm';
    this.updateSky(dt);
    this.applyLight();
    this.updateWaves(dt, w.windSpeed, w.windDir);
    const hs = this.waves.heightAt(host.tube.pos, w.windSpeed);
    // Lisätiedot toiselle riville, jotta kapeallakin ruudulla rivi mahtuu.
    const extra = (
      (hs >= 0.05 ? t('game.waves', { m: decimal(hs, 1) }) : '') +
      (this.thunderNow ? t('game.lightningRisk') : '') +
      this.spoutText()
    ).replace(/^ · /, '');
    host.hud.setWeather(
      `${skyName(w.sky)} · ${windName(w.windDir)} ${Math.round(w.windSpeed)} m/s` +
        (extra ? `\n${extra}` : ''),
    );
  }

  /** Aallot vesishaderille sekä renkaan keinunta pinnan korkeudesta ja kaltevuudesta. */
  private updateWaves(dt: number, windSpeed: number, windDir: number): void {
    const ww = this.waterWaves;
    this.waves.update(windDir);
    ww.uWaveScale.value = WAVE_FACTOR_SCALE * windSpeed;
    ww.uWaveDir.value.set(Math.cos(windDir), Math.sin(windDir));
    // Pohjakuvio ajelehtii tuulen mukana, sitä nopeammin mitä kovempi tuuli.
    const drift = ww.uDrift.value;
    drift.x = (drift.x + Math.cos(windDir) * windSpeed * WATER_DRIFT * dt) % 320;
    drift.y = (drift.y + Math.sin(windDir) * windSpeed * WATER_DRIFT * dt) % 320;
    const p = this.host.tube.pos;
    this.swell.update(dt, windSpeed, windDir, p);
    const amp = ww.uSwellAmp.value;
    this.swell.waves.forEach((w, i) => {
      ww.uSwell.value[i]!.set(w.dir.x, w.dir.y, w.k, w.phase);
      amp.setComponent(i, w.amp);
    });
    // Lähivesi aaltoilee, kun aallokko on yli 3 cm, ja tasoittuu alle 2 cm:ssä.
    // Muutos häivytetään, jotteivät aallot ja viivat ilmesty tai katoa kerralla.
    const hs = this.waves.heightAt(p, windSpeed);
    this.swellOn = hs >= 0.03 || (this.swellOn && hs >= 0.02);
    const fade = ww.uSwellFade;
    fade.value = Math.min(
      1,
      Math.max(0, fade.value + ((this.swellOn ? 1 : -1) * dt) / SWELL_FADE_TIME),
    );
    const shore = this.host.water.closestShorePoint(p, SHORE_FADE)?.distance ?? SHORE_FADE;
    const s = this.swell.sample(p, hs * shoreFade(shore) * fade.value);
    const h = this.host.facing;
    const ahead = s.slope.x * Math.cos(h) + s.slope.y * Math.sin(h);
    const side = s.slope.x * Math.sin(h) - s.slope.y * Math.cos(h);
    // Rengas ei seuraa pintaa jäykästi: se kelluu hieman jäljessä ja loivemmin.
    const k = Math.min(1, dt / 0.2);
    this.rock.lift += (s.height + this.bigWaveLift - this.rock.lift) * k;
    this.rock.pitch += (Math.atan(ahead) * 0.7 - this.rock.pitch) * k;
    this.rock.roll += (Math.atan(side) * 0.7 - this.rock.roll) * k;
  }

  /** Vuorokaudenaika pelikellon ja sään mukaan; kimallus vesishaderille. */
  updateSky(dt: number): void {
    const host = this.host;
    const now = this.view.now;
    const wind = windVector(now);
    const ww = this.waterWaves;
    // Välähdys on sitä kirkkaampi, mitä lähempänä salama iski; aivan vieressä
    // kuva kääntyy ensin hetkeksi negatiiviksi.
    this.sky.update(host.clock, now.darkness, this.lightning.flash * this.flashStrength, wind, dt);
    this.sky.grade.invert = this.flashInvert && this.lightning.sinceStrike < 0.08;
    this.mist.update(dt, this.sky.mist, wind, host.viewMode === 'pov');
    const g = this.sky.glitter;
    ww.uGlitterDir.value.copy(g.dir);
    ww.uGlitterColor.value.copy(g.color);
    ww.uGlitter.value = host.viewMode === 'pov' ? g.amount : 0;
    // Taivaan heijastus vaalentaa kaukaista vettä vain valoisalla: yöllä ja
    // ukkospilvien alla vaalea järvenselkä korostui liikaa.
    ww.uSheen.value =
      0.6 * THREE.MathUtils.smoothstep(host.daylight.light, 0.12, 0.5) * (1 - 0.6 * now.darkness);
  }

  /**
   * Valaistus ja POV:n tausta taivaan mukaan. Kirkkaus ei muutu täällä: yö,
   * pilvisyys ja salama tehdään paletin sävytyksellä (ks. SkyView), koska
   * himmeämpi valo kääntäisi paletissa tummat sinisävyt vihreiksi ja harmaiksi.
   */
  applyLight(): void {
    const sky = this.sky.lighting;
    const scene = this.scene;
    this.hemi.intensity = 1.5 * sky.ambient;
    this.sun.intensity = 1.5 * sky.direct;
    this.sun.position.copy(sky.lightDir).multiplyScalar(120);
    const pov = this.host.viewMode === 'pov';
    // Kaukosumu lasketaan jälkikäsittelyssä usvan kanssa (ks. RetroRenderer).
    this.sky.grade.fog = pov ? sky.fog : null;
    const bg = scene.background;
    if (!(bg instanceof THREE.Color)) return;
    if (pov) bg.copy(sky.horizon);
    else bg.set(LAND_COLOR);
  }

  /** Näkymän vaihto: taivas, usva ja kaukosumu vain kalastajan silmin. */
  setPov(pov: boolean): void {
    this.sky.dome.visible = pov;
    this.scene.background = new THREE.Color(LAND_COLOR);
    this.applyLight();
  }

  /**
   * Piirron osat: lähivesi aaltoilee kalastajan silmin, lentävän renkaan
   * varjo ylhäältä, taivas ja usva seuraavat kameraa.
   */
  render(pos: Vec2, air: ReturnType<typeof flightPose> | null): void {
    const pov = this.host.viewMode === 'pov';
    // Tyynellä lähivesi on tasainen, joten pohjan kivet ja sävyt näkyvät kuten ennenkin.
    const rough = this.waterWaves.uSwellFade.value > 0;
    placeSwellPatch(this.swellPatch, this.waterWaves, pov && rough ? pos : null);
    this.flightShadow.visible = air !== null && !pov;
    if (air) {
      this.flightShadow.position.copy(toWorld(air.pos, 0.05));
      this.flightShadow.scale.setScalar(Math.max(0.4, 1 - air.height / SPOUT.flightHeight));
    }
  }

  /** Taivas ja usva kalastajan silmien kohdalle. */
  follow(camera: THREE.Vector3): void {
    this.sky.follow(camera);
    this.mist.follow(camera);
  }

  /**
   * Lähellä iskevä salama tärisyttää kuvaa: kamera hyppii kokonaisia
   * pikseleitä satunnaisesti, kuten vanhoissa peleissä.
   */
  shakeCamera(camera: THREE.Camera): void {
    const k = this.lightning.shake * this.shakeStrength;
    if (k > 0) {
      const px = Math.round(k * 4);
      if (px !== 0) {
        const jx = Math.round((Math.random() * 2 - 1) * px);
        const jy = Math.round((Math.random() * 2 - 1) * px);
        if (this.host.viewMode === 'pov') {
          // Silmien kohdalla pikseli on noin pari senttiä: kallistetaan katsetta.
          const pov = this.host.pov.camera;
          const a = 1.5 / this.heightPx;
          pov.rotation.x += jy * a;
          pov.rotation.y += jx * a;
          pov.updateMatrixWorld();
        } else {
          const view = this.host.view;
          const m = view.metersPerPixel;
          view.camera.position.x += jx * m;
          view.camera.position.z += jy * m;
          view.camera.updateMatrixWorld();
        }
      }
    }
    this.lightning.orient(camera, this.heightPx);
  }
}
