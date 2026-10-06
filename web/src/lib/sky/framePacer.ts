/** How long the view must rest before its one sharp frame, in milliseconds. */
export const REST_MS = 300;

/**
 * When the stand view draws. While the view or the time moves it draws every frame, at whatever sharpness
 * keeps the frames coming ('move'); once nothing has changed for a moment it draws one frame at full
 * sharpness ('sharp'), or, when the moving frames were already full, says the view has come to rest ('rest'),
 * and then nothing ('idle') until something changes. While the graphics chip is still
 * drawing the last frame no new one is queued, so a slow chip never falls seconds behind: the newest view
 * is drawn as soon as it is free. A slow chip so moves smoothly and still shows every still view, and every
 * screenshot, at its best.
 */
export class FramePacer {
  private seen: string | null = null;
  private drawn: string | null = null;
  private changedAt = 0;
  private rested = false;

  /**
   * What to do this frame: `key` sums up everything the frame shows (view, time, size); `fullWhileMoving`
   * says the moving frames are already at full sharpness, so no sharp frame is needed; `busy` says the chip
   * has not finished the last frame.
   */
  next(key: string, now: number, opts: { fullWhileMoving?: boolean; busy?: boolean } = {}): 'move' | 'sharp' | 'rest' | 'idle' {
    if (key !== this.seen) {
      this.seen = key;
      this.changedAt = now;
      this.rested = false;
    }
    if (opts.busy) return 'idle';
    if (key !== this.drawn) {
      this.drawn = key;
      return 'move';
    }
    if (this.rested || now - this.changedAt < REST_MS) return 'idle';
    this.rested = true;
    return opts.fullWhileMoving ? 'rest' : 'sharp';
  }

  /** Whether the view has rested since it last changed: its sharp frame is queued or drawn, or was not needed. */
  get atRest(): boolean {
    return this.rested;
  }
}

/**
 * A moving frame's pixel ratio from the time the last one took (ms): a chip that keeps the view waiting draws fewer
 * pixels. Back to back, the time since the last moving frame is about the chip's time for it, and that goes with the
 * square of the ratio: aim at 40 ms, never under 0.45, never up (18.4).
 */
export function movingRatio(ratio: number, dtMs: number): number {
  return Math.max(0.45, Math.min(ratio, ratio * Math.sqrt(40 / dtMs)));
}

/** A frame slower than this (ms) counts as slow; faster than FAST_MS as fast. */
const SLOW_MS = 50, FAST_MS = 25;
/** How many slow frames in a row lower the ratio, and how many fast ones in a row raise it a tenth. */
const SLOW_RUN = 3, FAST_RUN = 30;

/**
 * The moving frames' pixel ratio over a visit (the final review of D3). One slow frame is a hitch (a garbage collection,
 * a scene swap, a target rebuilt) and changes nothing; three in a row lower the ratio by movingRatio of their mean. Thirty
 * fast frames in a row raise it a tenth, up to the full ratio, so a visit never stays soft after one bad moment; a slow
 * frame starts that count again.
 */
export class RatioPacer {
  private slow: number[] = [];
  private fast = 0;
  constructor(
    public ratio: number,
    private readonly full: number,
  ) {}

  /** A moving frame drawn `dtMs` after the last one: the ratio for the next. */
  frame(dtMs: number): number {
    if (dtMs > SLOW_MS) {
      this.fast = 0;
      this.slow.push(dtMs);
      if (this.slow.length >= SLOW_RUN) {
        this.ratio = movingRatio(this.ratio, this.slow.reduce((a, b) => a + b, 0) / this.slow.length);
        this.slow = [];
      }
    } else {
      this.slow = [];
      if (dtMs < FAST_MS) {
        this.fast++;
        if (this.fast >= FAST_RUN) {
          this.ratio = Math.min(this.full, this.ratio * 1.1);
          this.fast = 0;
        }
      } else this.fast = 0;
    }
    return this.ratio;
  }
}
