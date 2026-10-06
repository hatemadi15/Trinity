import { describe, expect, it } from 'vitest';
import { FramePacer, RatioPacer, REST_MS } from './framePacer';

describe('the moving frames’ pixel ratio (the final review of D3: one hitch must not lower it for the visit)', () => {
  it('ignores one slow frame, lowers the ratio after three in a row by the square root of 40 ms over their mean, and never under 0.45', () => {
    const p = new RatioPacer(1, 1);
    expect(p.frame(160)).toBe(1);
    expect(p.frame(16.7)).toBe(1);
    expect(p.frame(160)).toBe(1);
    expect(p.frame(160)).toBe(1);
    expect(p.frame(160)).toBeCloseTo(0.5, 9);
    for (let i = 0; i < 3; i++) p.frame(1000);
    expect(p.ratio).toBe(0.45);
  });

  it('climbs back a tenth after thirty fast frames in a row, up to the full ratio, and a slow frame starts the count again', () => {
    const p = new RatioPacer(0.5, 1);
    for (let i = 0; i < 29; i++) expect(p.frame(16.7)).toBe(0.5);
    expect(p.frame(16.7)).toBeCloseTo(0.55, 9);
    for (let i = 0; i < 29; i++) p.frame(16.7);
    // One slow frame: no drop, but the climb starts its count again.
    expect(p.frame(60)).toBeCloseTo(0.55, 9);
    for (let i = 0; i < 29; i++) expect(p.frame(16.7)).toBeCloseTo(0.55, 9);
    expect(p.frame(16.7)).toBeCloseTo(0.605, 9);
    for (let i = 0; i < 1000; i++) p.frame(16.7);
    expect(p.ratio).toBe(1);
  });
});

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
