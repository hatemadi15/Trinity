import { describe, expect, it } from 'vitest';
import { labelsToHide } from './labelguard';

const box = (left: number, top: number, width: number, height: number, priority: number) => ({ left, top, right: left + width, bottom: top + height, priority });

describe('labelsToHide', () => {
  it('keeps labels that do not touch', () => {
    expect(labelsToHide([box(0, 0, 50, 20, 1), box(60, 0, 50, 20, 1), box(0, 30, 50, 20, 2)])).toEqual([false, false, false]);
  });

  it('hides the less important of two labels that overlap, whatever their order on the page', () => {
    expect(labelsToHide([box(0, 0, 50, 20, 3), box(40, 10, 50, 20, 1)])).toEqual([true, false]);
    expect(labelsToHide([box(0, 0, 50, 20, 1), box(40, 10, 50, 20, 3)])).toEqual([false, true]);
  });

  it('keeps the earlier of two equally important labels, and lets a hidden label make no room for others', () => {
    // b overlaps a and c; a wins over b, so c, which only touches b, stays.
    const a = box(0, 0, 50, 20, 2);
    const b = box(40, 0, 50, 20, 2);
    const c = box(85, 0, 50, 20, 2);
    expect(labelsToHide([a, b, c])).toEqual([false, true, false]);
  });

  it('ignores labels that are not drawn', () => {
    expect(labelsToHide([box(0, 0, 0, 0, 1), box(0, 0, 50, 20, 2)])).toEqual([false, false]);
  });
});
