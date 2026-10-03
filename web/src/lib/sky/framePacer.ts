/** How long the view must rest before its one sharp frame, in milliseconds. */
export const REST_MS = 300;

/**
 * When the stand view draws. While the view or the time moves it draws every frame, at whatever sharpness
 * keeps the frames coming ('move'); once nothing has changed for a moment it draws one frame at full
 * sharpness ('sharp') and then nothing ('idle') until something changes. A slow graphics chip so moves
 * smoothly and still shows every still view, and every screenshot, at its best.
 */
export class FramePacer {
  private key: string | null = null;
  private changedAt = 0;
  private rested = false;

  /**
   * What to do this frame: `key` sums up everything the frame shows (view, time, size); `fullWhileMoving`
   * says the moving frames are already at full sharpness, so no sharp frame is needed.
   */
  next(key: string, now: number, fullWhileMoving = false): 'move' | 'sharp' | 'idle' {
    if (key !== this.key) {
      this.key = key;
      this.changedAt = now;
      this.rested = false;
      return 'move';
    }
    if (this.rested || now - this.changedAt < REST_MS) return 'idle';
    this.rested = true;
    return fullWhileMoving ? 'idle' : 'sharp';
  }
}
