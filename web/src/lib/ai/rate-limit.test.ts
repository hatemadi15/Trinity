import { describe, expect, it } from 'vitest';
import { SlidingWindowLimiter } from './rate-limit';

describe('SlidingWindowLimiter', () => {
  it('allows the limit within the window and refuses the next hit with a retry delay', () => {
    const l = new SlidingWindowLimiter(30, 60_000);
    const t0 = 1_000_000;
    for (let i = 0; i < 30; i++) expect(l.hit('1.2.3.4', t0 + i * 100).ok).toBe(true);
    const refused = l.hit('1.2.3.4', t0 + 3_000);
    expect(refused.ok).toBe(false);
    expect(refused.retryAfterS).toBeGreaterThanOrEqual(1);
    expect(refused.retryAfterS).toBeLessThanOrEqual(60);
  });

  it('keeps keys independent', () => {
    const l = new SlidingWindowLimiter(2, 60_000);
    expect(l.hit('a', 0).ok).toBe(true);
    expect(l.hit('a', 1).ok).toBe(true);
    expect(l.hit('a', 2).ok).toBe(false);
    expect(l.hit('b', 2).ok).toBe(true);
  });

  it('slides: hits older than the window no longer count', () => {
    const l = new SlidingWindowLimiter(2, 1_000);
    expect(l.hit('a', 0).ok).toBe(true);
    expect(l.hit('a', 500).ok).toBe(true);
    expect(l.hit('a', 900).ok).toBe(false);
    expect(l.hit('a', 1_001).ok).toBe(true); // the hit at 0 has left the window
    expect(l.hit('a', 1_400).ok).toBe(false); // 500 and 1001 are still inside
  });

  it('forgets idle keys so the map does not grow without bound', () => {
    const l = new SlidingWindowLimiter(1, 1_000);
    for (let i = 0; i < 100; i++) l.hit(`k${i}`, i);
    l.hit('fresh', 10_000);
    expect(l.size()).toBeLessThanOrEqual(2);
  });
});
