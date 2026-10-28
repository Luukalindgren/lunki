import type { Input } from '../engine/input';
import type { RetroRenderer } from '../engine/retroRenderer';
import type { Game } from '../game/game';

/**
 * Suorituskykytesti (?bench=1): ajaa käsikirjoitetun kierroksen (liikkuminen,
 * heitot, kelaus, zoomaus) ja mittaa ruutuajat. Tulos näytetään ruudulla ja
 * tulostetaan konsoliin JSONina, jotta sen voi liittää issueen.
 */
export class Bench {
  private readonly frames: number[] = [];
  private updateMs = 0;
  private renderMs = 0;
  private updates = 0;
  private t = 0;
  private done = false;
  private readonly duration = 30;

  constructor(
    private readonly game: Game,
    private readonly input: Input,
    private readonly retro: RetroRenderer,
    private readonly parent: HTMLElement,
    /** Kisan aloitus: maailman rakennus ja varjostimien kääntäminen (ms). */
    private readonly raceStart: { buildMs: number; compileMs: number },
  ) {}

  /** Kutsutaan ennen pelin päivitystä kiinteällä askeleella. */
  script(dt: number): void {
    if (this.done) return;
    this.t += dt;
    const t = this.t;
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const h = this.game.tube.heading;
    const aim = { x: cx + Math.cos(h) * cx * 0.6, y: cy - Math.sin(h) * cy * 0.6 };
    const phase = t % 10;
    // 0–3 s potkitaan ja käännytään, 3–4 s ladataan heitto, 4–10 s kelataan.
    this.input.simulate('KeyS', phase < 3);
    this.input.simulate('KeyA', phase > 1 && phase < 1.6);
    this.input.simulate(
      'Mouse0',
      (phase > 3 && phase < 3.8) || (phase > 5 && phase % 1 < 0.6),
      aim,
    );
  }

  /** Mitattu päivitys- ja piirtoaika (CPU). */
  timing(updateMs: number, renderMs: number, updates: number): void {
    if (this.done || this.t <= 1) return;
    this.updateMs += updateMs;
    this.renderMs += renderMs;
    this.updates += updates;
  }

  frame(frameTime: number): void {
    if (this.done) return;
    if (this.t > 1) this.frames.push(frameTime * 1000);
    if (this.t >= this.duration) this.finish();
  }

  private finish(): void {
    this.done = true;
    this.input.simulate('KeyS', false);
    this.input.simulate('Mouse0', false);
    const sorted = [...this.frames].sort((a, b) => a - b);
    const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]!;
    const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
    const info = this.retro.renderer.info;
    const { width, height, scale } = this.retro.resolution;
    const result = {
      frames: sorted.length,
      avgFps: +(1000 / avg).toFixed(1),
      p50ms: +pct(0.5).toFixed(2),
      p95ms: +pct(0.95).toFixed(2),
      p99ms: +pct(0.99).toFixed(2),
      worstMs: +sorted[sorted.length - 1]!.toFixed(2),
      below30fps: sorted.filter((f) => f > 1000 / 30).length,
      updateMsPerStep: +(this.updateMs / Math.max(1, this.updates)).toFixed(3),
      renderMsPerFrame: +(this.renderMs / sorted.length).toFixed(3),
      raceBuildMs: +this.raceStart.buildMs.toFixed(1),
      raceCompileMs: +this.raceStart.compileMs.toFixed(1),
      povFov: Math.round(this.game.povFov),
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      internal: `${width}×${height} ×${scale}`,
      screen: `${window.innerWidth}×${window.innerHeight} @${window.devicePixelRatio}`,
      userAgent: navigator.userAgent,
      gpu: gpuName(this.retro.renderer.getContext()),
    };
    console.log('LUNKI_BENCH', JSON.stringify(result));
    const el = document.createElement('pre');
    el.className = 'bench-result';
    el.textContent = `Suorituskykytesti valmis\n${JSON.stringify(result, null, 2)}`;
    this.parent.appendChild(el);
  }
}

function gpuName(gl: WebGLRenderingContext | WebGL2RenderingContext): string {
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'tuntematon';
}
