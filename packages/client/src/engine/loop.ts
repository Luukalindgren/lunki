/** Kiinteä päivitysaskel: fysiikka etenee aina samoin askelin ruudunpäivityksestä riippumatta. */
export const FIXED_DT = 1 / 60;

/** Estää "kuolemanspiraalin", jos välilehti on ollut taustalla. */
const MAX_FRAME_TIME = 0.25;

export interface StepResult {
  /** Montako kiinteää askelta ajetaan tällä ruudulla. */
  steps: number;
  /** Jäljelle jäävä osuus seuraavasta askeleesta (0–1) interpolointia varten. */
  alpha: number;
}

/** Puhdas akkumulaattori, jotta silmukan ajoitus on testattavissa. */
export class FixedStepAccumulator {
  private acc = 0;

  constructor(private readonly dt = FIXED_DT) {}

  advance(frameTime: number): StepResult {
    this.acc += Math.min(Math.max(frameTime, 0), MAX_FRAME_TIME);
    let steps = 0;
    while (this.acc >= this.dt) {
      this.acc -= this.dt;
      steps++;
    }
    return { steps, alpha: this.acc / this.dt };
  }
}

export interface LoopCallbacks {
  update(dt: number): void;
  render(alpha: number, frameTime: number): void;
}

/** Käynnistää pelisilmukan requestAnimationFramella. Palauttaa pysäytysfunktion. */
export function startLoop({ update, render }: LoopCallbacks): () => void {
  const acc = new FixedStepAccumulator();
  let last = performance.now();
  let handle = 0;

  const frame = (now: number) => {
    const frameTime = (now - last) / 1000;
    last = now;
    const { steps, alpha } = acc.advance(frameTime);
    for (let i = 0; i < steps; i++) update(FIXED_DT);
    render(alpha, frameTime);
    handle = requestAnimationFrame(frame);
  };
  handle = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(handle);
}
