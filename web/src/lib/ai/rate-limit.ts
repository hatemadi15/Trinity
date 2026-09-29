/**
 * In-memory sliding-window limiter keyed by caller (the client IP for /api/chat). One instance per
 * server process, so on Vercel the limit applies per function instance; the venue laptop is one
 * process. Idle keys are swept once per window so the map does not grow without bound.
 */
export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();
  private lastSweep = 0;

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  hit(key: string, now: number = Date.now()): { ok: boolean; retryAfterS: number } {
    if (now - this.lastSweep > this.windowMs || this.hits.size > 1000) this.sweep(now);
    const since = now - this.windowMs;
    const list = (this.hits.get(key) ?? []).filter((t) => t > since);
    if (list.length >= this.limit) {
      this.hits.set(key, list);
      return { ok: false, retryAfterS: Math.max(1, Math.ceil((list[0] + this.windowMs - now) / 1000)) };
    }
    list.push(now);
    this.hits.set(key, list);
    return { ok: true, retryAfterS: 0 };
  }

  size(): number {
    return this.hits.size;
  }

  private sweep(now: number): void {
    const since = now - this.windowMs;
    for (const [key, list] of this.hits) {
      const live = list.filter((t) => t > since);
      if (live.length === 0) this.hits.delete(key);
      else this.hits.set(key, live);
    }
    this.lastSweep = now;
  }
}
