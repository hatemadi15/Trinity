import { describe, expect, it } from 'vitest';
import { labelLayout } from './TextSprite';

describe('labelLayout', () => {
  it('pads the measured text width and derives the height from the font size', () => {
    const l = labelLayout(100, 28);
    expect(l.padX).toBe(13);
    expect(l.padY).toBe(8);
    expect(l.width).toBe(126);
    expect(l.height).toBe(51);
  });
  it('never returns a canvas narrower than 8 px', () => {
    expect(labelLayout(0, 28).width).toBe(26);
    expect(labelLayout(-50, 28).width).toBe(8);
  });
});
