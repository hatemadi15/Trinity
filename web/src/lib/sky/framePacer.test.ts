import { describe, expect, it } from 'vitest';
import { FramePacer, REST_MS } from './framePacer';

describe('when the stand view draws', () => {
  it('draws every frame while the view or the time moves, at the moving sharpness', () => {
    const p = new FramePacer();
    expect(p.next('a', 0)).toBe('move');
    expect(p.next('b', 16)).toBe('move');
    expect(p.next('c', 32)).toBe('move');
  });

  it('draws nothing more while the view rests, then one sharp frame once it has rested a moment', () => {
    const p = new FramePacer();
    expect(p.next('a', 0)).toBe('move');
    expect(p.next('a', 16)).toBe('idle');
    expect(p.next('a', REST_MS - 1)).toBe('idle');
    expect(p.next('a', REST_MS)).toBe('sharp');
    // The sharp frame stays on the screen.
    expect(p.next('a', REST_MS + 16)).toBe('idle');
    expect(p.next('a', 10 * REST_MS)).toBe('idle');
  });

  it('moves again as soon as anything changes, and rests again after it', () => {
    const p = new FramePacer();
    p.next('a', 0);
    p.next('a', REST_MS);
    expect(p.next('b', REST_MS + 16)).toBe('move');
    expect(p.next('b', 2 * REST_MS + 15)).toBe('idle');
    expect(p.next('b', 2 * REST_MS + 16)).toBe('sharp');
  });

  it('skips the sharp frame when the moving frames were already full sharpness', () => {
    const p = new FramePacer();
    p.next('a', 0, true);
    expect(p.next('a', REST_MS, true)).toBe('idle');
  });
});
