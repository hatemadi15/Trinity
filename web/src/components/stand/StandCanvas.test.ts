import { describe, expect, it } from 'vitest';
import { compassMark, easeStep, horizonLift, labelSides, partSide, starNamesShown } from './StandCanvas';

describe('the view on a tall screen', () => {
  it('rests higher on a tall screen so the horizon sits a little above the middle of the band free of words and buttons, the lander and the ground below it', () => {
    // A phone: words down to 330 px, buttons from 614 px; the horizon at 40 % of the band, 444 px.
    const lift = horizonLift(390, 844, 80, 330, 614);
    const y = 422 + 422 * (Math.tan((lift * Math.PI) / 180) / Math.tan((40 * Math.PI) / 180));
    expect(y).toBeCloseTo(330 + 0.4 * 284, 0);
    // With the words hidden the band starts at the top, and the view rests lower.
    expect(horizonLift(390, 844, 80, 0, 614)).toBeLessThan(lift);
  });

  it('on a wide screen, where the words sit at the sides, rests the horizon a little above the middle of the room above the time bar', () => {
    // 900 px high, the time bar from 730 px: the horizon at 55 % of the 730 px above it, 401.5 px, so the
    // lander below it clears the bar.
    const lift = horizonLift(1440, 900, 60, 0, 730);
    const y = 450 + 450 * (Math.tan((lift * Math.PI) / 180) / Math.tan((30 * Math.PI) / 180));
    expect(y).toBeCloseTo(0.55 * 730, 0);
    // Words at the top left do not move it.
    expect(horizonLift(1440, 900, 60, 400, 730)).toBeCloseTo(lift, 9);
  });

  it('keeps the tilt within bounds when the free band is odd', () => {
    expect(horizonLift(390, 844, 80, 800, 820)).toBe(0);
    expect(Math.abs(horizonLift(390, 844, 80, 700, 840))).toBeLessThanOrEqual(15);
  });
});

describe('the star names', () => {
  const at = (name: string, visible = true) => ({ name, x: 0.5, y: 0.5, visible });
  it('names the bright stars only at night or looking up', () => {
    expect(starNamesShown([at('Sirius')], true)).toEqual([true]);
    expect(starNamesShown([at('Sirius')], false)).toEqual([false]);
    expect(starNamesShown([at('Sirius', false)], true)).toEqual([false]);
  });

  it('names the Southern Cross rather than its four stars, so the names do not pile up on it', () => {
    const sky = [at('Acrux'), at('Mimosa'), at('Gacrux'), at('Imai'), at('Hadar'), at('Southern Cross')];
    expect(starNamesShown(sky, true)).toEqual([false, false, false, false, true, true]);
    // With the cross itself out of sight, its stars keep their names.
    const hidden = [at('Acrux'), at('Southern Cross', false)];
    expect(starNamesShown(hidden, true)).toEqual([true, false]);
  });
});

describe('star names that would touch', () => {
  const at = (x: number, y: number, w = 100, h = 20) => ({ x, y, w, h, visible: true });
  it('puts a name on the right of its star, or on the left when the right is taken, or leaves it out', () => {
    // Two stars 44 px apart: the second's name goes to its left; a third between them has no room.
    expect(labelSides([at(870, 300), at(826, 302, 42)])).toEqual(['right', 'left']);
    expect(labelSides([at(870, 300), at(826, 302, 42), at(850, 301)])).toEqual(['right', 'left', 'none']);
    // Far apart, both on the right; a star out of sight takes no room.
    expect(labelSides([at(100, 100), at(600, 100)])).toEqual(['right', 'right']);
    expect(labelSides([{ ...at(870, 300), visible: false }, at(826, 302, 42)])).toEqual(['none', 'right']);
  });
});

describe('the names of the lander parts', () => {
  // The card over the view, as in the 1440 × 900 view: 16 to 576 px across, 16 to 401 px down.
  const card = { left: 16, top: 16, right: 576, bottom: 401 };
  it('puts a part name on its first side, or on the next when the first would touch a panel on the screen', () => {
    // The power light just right of the card: its name on the left would run into the card, so it goes right.
    expect(partSide(673, 414, 130, 28, ['left', 'right'], [card], 1440, 900)).toBe('right');
    expect(partSide(673, 414, 130, 28, ['left', 'right'], [], 1440, 900)).toBe('left');
    // Well below the card, the left is clear.
    expect(partSide(673, 600, 130, 28, ['left', 'right'], [card], 1440, 900)).toBe('left');
  });
  it('keeps a part name on the screen, and leaves it out when no side is clear', () => {
    // Near the left edge, a name on the left would leave the screen.
    expect(partSide(60, 600, 130, 28, ['left', 'right'], [], 1440, 900)).toBe('right');
    // Under the card on both sides.
    expect(partSide(300, 300, 130, 28, ['left', 'right'], [card], 1440, 900)).toBeNull();
    // Above, or below when the card is in the way above.
    expect(partSide(700, 420, 100, 28, ['above', 'below'], [{ left: 600, top: 300, right: 800, bottom: 400 }], 1440, 900)).toBe('below');
  });
});

describe('the marks on the compass strip', () => {
  it('puts a body on the strip at its bearing from the way the view faces, or at the nearer end when it is out of the strip', () => {
    // The strip spans 120 degrees across 300 px: 2.5 px a degree, the middle at 150 px.
    expect(compassMark(300, 315)).toEqual({ x: 150 - 15 * 2.5, edge: null });
    expect(compassMark(10, 350)).toEqual({ x: 150 + 20 * 2.5, edge: null });
    expect(compassMark(45, 315)).toEqual({ x: null, edge: 'right' });
    expect(compassMark(200, 315)).toEqual({ x: null, edge: 'left' });
  });
});

describe('turning the view', () => {
  it('eases by the time passed, so a turn takes as long when frames come a second apart as when they come 60 times a second', () => {
    expect(easeStep(1 / 60)).toBeCloseTo(1 - Math.exp(-5 / 60), 9);
    // A frame half a second late moves most of the way; a frame later than that counts as half a second.
    expect(easeStep(0.5)).toBeCloseTo(1 - Math.exp(-2.5), 9);
    expect(easeStep(2)).toBeCloseTo(easeStep(0.5), 9);
    expect(easeStep(-1)).toBe(0);
  });
});
