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

  it('skips the sharp frame when the moving frames were already full sharpness, but still says the view has come to rest', () => {
    const p = new FramePacer();
    p.next('a', 0, { fullWhileMoving: true });
    // Nothing to draw: the frame on the screen is already the sharp one, and a still or a screenshot can take it.
    expect(p.next('a', REST_MS, { fullWhileMoving: true })).toBe('rest');
    expect(p.next('a', REST_MS + 16, { fullWhileMoving: true })).toBe('idle');
  });

  it('knows when the view is at rest: not while it moves, from its rest on, and not again until it has rested after a change', () => {
    const p = new FramePacer();
    p.next('a', 0);
    expect(p.atRest).toBe(false);
    p.next('a', REST_MS);
    expect(p.atRest).toBe(true);
    p.next('b', REST_MS + 16);
    expect(p.atRest).toBe(false);
    p.next('b', 2 * REST_MS + 16, { fullWhileMoving: true });
    expect(p.atRest).toBe(true);
  });

  it('queues no frame while the graphics chip is still drawing the last one, then draws the newest view', () => {
    const p = new FramePacer();
    expect(p.next('a', 0)).toBe('move');
    expect(p.next('b', 16, { busy: true })).toBe('idle');
    expect(p.next('c', 32, { busy: true })).toBe('idle');
    expect(p.next('c', 48)).toBe('move');
    // The rest is counted from the last change, and its sharp frame also waits for the chip.
    expect(p.next('c', 32 + REST_MS, { busy: true })).toBe('idle');
    expect(p.next('c', 40 + REST_MS)).toBe('sharp');
  });
});
