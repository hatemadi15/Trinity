import { describe, expect, it } from 'vitest';
import { clearOf, compassMark, easeStep, edgePointers, fitPitch, horizonLift, labelSides, partSide, pointerClear, pointerWords, slopeWord, starNamesShown } from './StandCanvas';

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

describe('the opening view', () => {
  it('looks down just enough to keep the lander’s feet 56 px above the time bar, and never looks down for them more than 10 degrees', () => {
    const tanHalf = Math.tan((30 * Math.PI) / 180);
    const yOf = (el: number, pitch: number) => 450 - (Math.tan(((el - pitch) * Math.PI) / 180) / tanHalf) * 450;
    // The feet 23 degrees below level: at a pitch of -4.2 they sit below the bar at 715 px.
    expect(yOf(-23, -4.2)).toBeGreaterThan(715);
    const p = fitPitch(900, 60, 715, -23, -4.2);
    expect(yOf(-23, p)).toBeCloseTo(715 - 56, 6);
    // Already in view: the pitch stays.
    expect(fitPitch(900, 60, 715, -10, -4.2)).toBe(-4.2);
    // Far below: at most 10 degrees lower.
    expect(fitPitch(900, 60, 715, -60, -4.2)).toBeCloseTo(-14.2, 6);
  });
});

describe('the slope you stand on', () => {
  it('says uphill or downhill when the view faces up or down a slope steeper than 5 degrees, and nothing across it or on the level', () => {
    const steep = Math.tan((12 * Math.PI) / 180);
    expect(slopeWord(200, 180, steep)).toBe(', uphill');
    expect(slopeWord(10, 180, steep)).toBe(', downhill');
    expect(slopeWord(270, 180, steep)).toBe('');
    expect(slopeWord(180, 180, Math.tan((3 * Math.PI) / 180))).toBe('');
  });
});

describe('star names beside other stars', () => {
  it('moves a name to the left of its star when on the right it would cover another named star’s dot', () => {
    // Hadar at 820 px, Alpha Centauri’s dot 54 px to its right: Hadar’s 50 px name goes left.
    const at = (x: number, y: number, w = 50, h = 20) => ({ x, y, w, h, visible: true });
    expect(labelSides([at(820, 260), at(874, 262, 110)])).toEqual(['left', 'right']);
  });
});

describe('a label beside a panel', () => {
  const card = { left: 16, top: 16, right: 576, bottom: 424 };
  it('slides along clear of the panel when it only touches its edge, by the shorter way', () => {
    // Earth's label 150 px wide, centred at 652 px: its left end runs 3 px into the card (and its 4 px margin).
    const b = { left: 577, right: 727, top: 350, bottom: 378 };
    expect(clearOf(b, [card], 1440)).toBe(576 + 4 - 577);
    // Already clear: no shift.
    expect(clearOf({ left: 600, right: 750, top: 350, bottom: 378 }, [card], 1440)).toBe(0);
  });
  it('is left out when clearing the panel would take it more than 60 % of its width from where it belongs, or off the screen', () => {
    expect(clearOf({ left: 300, right: 450, top: 350, bottom: 378 }, [card], 1440)).toBeNull();
    // Right at the screen's right edge: clearing a panel there would push it off.
    expect(clearOf({ left: 1300, right: 1436, top: 30, bottom: 58 }, [{ left: 1380, top: 16, right: 1424, bottom: 70 }], 1440)).toBe(-(1436 - 1376));
  });
});

describe('pointers to what is out of view', () => {
  // 1440 x 900, 60 degrees top to bottom, facing 300 degrees (north-west), level; free room 424 to 737 px.
  const view = { yaw: 300, pitch: 0, fov: 60, W: 1440, H: 900, freeTop: 424, freeBottom: 737 };
  it('points to a body beyond either side of the view from that edge of the screen, at about its height, and to none in view', () => {
    const p = edgePointers([
      { key: 'sun', az: 290, el: 2 },
      { key: 'earth', az: 40, el: -1.2 },
      { key: 'lander', az: 200, el: -20 },
    ], view);
    // The Sun is in view: no pointer. Earth is 100 degrees right; the lander 100 degrees left.
    expect(p.map((x) => [x.key, x.side])).toEqual([
      ['earth', 'right'],
      ['lander', 'left'],
    ]);
    // Earth just below level sits near the middle of the screen, in the free room.
    const e = p.find((x) => x.key === 'earth')!;
    expect(e.y).toBeGreaterThan(450);
    expect(e.y).toBeLessThan(737 - 24);
    // The lander far below: held 24 px inside the room's foot.
    expect(p.find((x) => x.key === 'lander')!.y).toBe(737 - 24);
  });
  it('stacks two pointers on one side 34 px apart, never inside the panels above and below', () => {
    const p = edgePointers([
      { key: 'earth', az: 40, el: 3 },
      { key: 'lander', az: 45, el: 3 },
    ], view);
    expect(p).toHaveLength(2);
    expect(Math.abs(p[0].y - p[1].y)).toBeGreaterThanOrEqual(34);
    for (const x of p) {
      expect(x.y).toBeGreaterThanOrEqual(424 + 24);
      expect(x.y).toBeLessThanOrEqual(737 - 24);
    }
  });
});

describe('a pointer beside a label', () => {
  it('moves above a label it would cover (labels sit over their things, so above is open sky), or below when above has no room', () => {
    // The lander's label 400 to 428 px down; a pointer 26 px tall centred at 420 px on the same side.
    const label = { left: 200, right: 368, top: 400, bottom: 428 };
    const box = { left: 160, right: 382, top: 407, bottom: 433 };
    expect(pointerClear(box, [label], 250, 600)).toBe(400 - 6 - 13);
    // With the room starting at 390, it goes below.
    expect(pointerClear(box, [label], 390, 600)).toBe(428 + 6 + 13);
    // Clear of it: where it is.
    expect(pointerClear({ ...box, top: 500, bottom: 526 }, [label], 250, 600)).toBe(513);
  });
});

describe('the words on a pointer', () => {
  it('keep the height and drop what the arrow already says', () => {
    expect(pointerWords('Earth, 5.7° below the horizon')).toBe('Earth, 5.7° below');
    expect(pointerWords('Sun 1.5° up, behind the hills')).toBe('Sun 1.5° up, hidden');
    expect(pointerWords('Sun 2.5° up')).toBe('Sun 2.5° up');
    expect(pointerWords('Earth, on the horizon')).toBe('Earth, on the horizon');
  });
});

