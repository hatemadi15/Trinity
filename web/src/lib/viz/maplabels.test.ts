import { describe, expect, it } from 'vitest';
import { labelBox, placeMapLabels } from './maplabels';

const SIZE = 440;
const px = (n: number) => n / SIZE;

describe('placeMapLabels', () => {
  it('writes a name under its pin when there is room', () => {
    const placed = placeMapLabels(
      [
        { id: 'a', u: 0.3, v: 0.3, text: 'Alpha Ridge' },
        { id: 'b', u: 0.7, v: 0.7, text: 'Beta Plain' },
      ],
      SIZE,
    );
    expect(placed.get('a')).toMatchObject({ side: 'below', leader: false });
    expect(placed.get('b')).toMatchObject({ side: 'below', leader: false });
    expect(placed.get('a')!.box).toEqual(labelBox(0.3, 0.3, 'Alpha Ridge', 'below', SIZE));
  });

  it('moves a name to another side of its pin when the side below runs off the map', () => {
    const bottom = placeMapLabels([{ id: 'a', u: 0.5, v: 0.97, text: 'Alpha Ridge' }], SIZE);
    expect(bottom.get('a')?.side).toBe('above');
    const corner = placeMapLabels([{ id: 'a', u: 0.97, v: 0.97, text: 'Alpha Ridge' }], SIZE);
    expect(corner.get('a')?.side).toBe('left');
  });

  it('reaches out with a short line when every place next to the pin is taken by other pins', () => {
    const ring = [
      [22, 0],
      [-22, 0],
      [0, 22],
      [0, -22],
      [16, 16],
      [-16, 16],
      [16, -16],
      [-16, -16],
    ].map(([dx, dy], i) => ({ id: `n${i}`, u: 0.5 + px(dx), v: 0.5 + px(dy), text: 'Neighbour' }));
    const placed = placeMapLabels([{ id: 'c', u: 0.5, v: 0.5, text: 'Centre' }, ...ring], SIZE);
    expect(placed.get('c')).toMatchObject({ side: 'below', leader: true });
    expect(placed.get('c')!.box.y).toBeCloseTo(0.5 + px(40));
  });

  it('gives the place to the pin that comes first, and leaves a name that fits nowhere for the pointer', () => {
    // Two pins on one spot, and the map kept clear everywhere but the place right under it.
    const pins = [
      { id: 'first', u: 0.5, v: 0.5, text: 'Alpha Ridge' },
      { id: 'second', u: 0.5, v: 0.5, text: 'Alpha Ridge' },
    ];
    const half = px(56);
    const keepOut = [
      { x: 0, y: 0, w: 1, h: 0.5 - px(9) },
      { x: 0, y: 0, w: 0.5 - half, h: 1 },
      { x: 0.5 + half, y: 0, w: 0.5 - half, h: 1 },
      { x: 0, y: 0.5 + px(43), w: 1, h: 0.5 - px(43) },
    ];
    const placed = placeMapLabels(pins, SIZE, keepOut);
    expect(placed.has('first')).toBe(true);
    expect(placed.has('second')).toBe(false);
  });

  it('keeps names off other pins and off the boxes it is told to keep clear', () => {
    // A pin just under another: the name of the upper one may not cover it.
    const placed = placeMapLabels(
      [
        { id: 'upper', u: 0.5, v: 0.5, text: 'Upper' },
        { id: 'lower', u: 0.5, v: 0.5 + px(24), text: 'Lower' },
      ],
      SIZE,
    );
    expect(placed.get('upper')?.side).not.toBe('below');
    const kept = placeMapLabels([{ id: 'a', u: 0.5, v: 0.5, text: 'Alpha' }], SIZE, [{ x: 0.3, y: 0.5, w: 0.4, h: 0.2 }]);
    expect(kept.get('a')?.side).toBe('above');
  });

  it('measures a name by its length', () => {
    const short = labelBox(0.5, 0.5, 'Ab', 'below', SIZE);
    const long = labelBox(0.5, 0.5, 'Abcdefghij', 'below', SIZE);
    expect(long.w).toBeGreaterThan(short.w);
    expect(short.x + short.w / 2).toBeCloseTo(0.5);
    expect(short.y).toBeGreaterThan(0.5);
  });
});
