/** Kevyt FPS-mittari kehitystilaan. Näyttää keskiarvon ja hitaimman ruudun. */
export class FpsMeter {
  private readonly el: HTMLDivElement;
  private frames = 0;
  private elapsed = 0;
  private worst = 0;

  constructor(parent: HTMLElement, visible: boolean) {
    this.el = document.createElement('div');
    this.el.className = 'fps-meter';
    this.el.hidden = !visible;
    parent.appendChild(this.el);
  }

  toggle(): void {
    this.el.hidden = !this.el.hidden;
  }

  frame(frameTime: number, extra = ''): void {
    this.frames++;
    this.elapsed += frameTime;
    this.worst = Math.max(this.worst, frameTime);
    if (this.elapsed >= 0.5) {
      const fps = this.frames / this.elapsed;
      this.el.textContent = `${fps.toFixed(0)} fps · min ${(1 / this.worst).toFixed(0)}${extra ? ` · ${extra}` : ''}`;
      this.frames = 0;
      this.elapsed = 0;
      this.worst = 0;
    }
  }
}
