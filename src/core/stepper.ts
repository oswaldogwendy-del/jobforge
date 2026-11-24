// Fixed-timestep accumulator: the simulation ticks at a fixed rate while rendering runs at the
// display rate and interpolates between ticks (PRD Section 4, Runtime rules).
export class FixedStepper {
  readonly step: number;
  private acc = 0;
  constructor(
    tickRate: number,
    private readonly maxFrameSec: number,
  ) {
    this.step = 1 / tickRate;
  }
  /** Adds a frame's elapsed time and returns how many ticks to run now. */
  advance(frameSec: number): number {
    this.acc += Math.min(Math.max(frameSec, 0), this.maxFrameSec);
    let ticks = 0;
    while (this.acc >= this.step - 1e-9) {
      this.acc -= this.step;
      ticks++;
    }
    if (this.acc < 0) this.acc = 0;
    return ticks;
  }
  /** Render interpolation factor in [0, 1). */
  get alpha(): number {
    return this.acc / this.step;
  }
  reset(): void {
    this.acc = 0;
  }
}
