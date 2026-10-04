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
