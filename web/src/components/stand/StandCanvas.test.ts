// @vitest-environment jsdom
import { render, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Series } from '@/lib/engine/metrics';
import type { SkyLabels, StandScene } from '@/lib/sky/standRenderer';
import { flatField } from '@/lib/sky/terrainField';
import { EARTH_LOOP } from '@/lib/viz/stand';
import { chipsShown, clearOf, compassMark, easeStep, edgePointers, fitPitch, horizonLift, labelSides, levelY, liftClear, offLander, partSide, pathNameText, pointerClear, pointerShort, pointerWords, slopeWord, StandCanvas, starNamesShown, type RendererLike } from './StandCanvas';

describe('the pointers on a phone', () => {
  it('keeps Earth’s angle on its pointer on a phone, short: the body and how high it stands', () => {
    expect(pointerShort('Earth 4.4° up')).toBe('Earth 4.4° up');
    expect(pointerShort('Earth 4.4° up, set behind the hills')).toBe('Earth 4.4° up');
    expect(pointerShort('Earth, 1.2° below the horizon')).toBe('Earth 1.2° below');
    expect(pointerShort('Earth, on the horizon, set behind the hills')).toBe('Earth on the horizon');
    expect(pointerShort('Earth, just below the horizon')).toBe('Earth just below');
  });
});

describe('the paths’ names', () => {
  it('names Earth’s path with why it loops, on a second line, and the Sun’s path as it is', () => {
    expect(pathNameText('earth', "Earth's path this month")).toBe(`Earth's path this month\n${EARTH_LOOP}`);
    expect(pathNameText('sun', "Sun's path this month")).toBe("Sun's path this month");
  });
});

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
    // "Below what?": the horizon stays.
    expect(pointerWords('Earth, 5.7° below the horizon')).toBe('Earth, 5.7° below the horizon');
    expect(pointerWords('Sun 1.5° up, set behind the hills')).toBe('Sun 1.5° up, set');
    expect(pointerWords('Sun 2.5° up')).toBe('Sun 2.5° up');
    expect(pointerWords('Earth, on the horizon')).toBe('Earth, on the horizon');
  });
});

describe('a body named over the lander', () => {
  it('rises clear of the names it meets, its foot 4 px over the highest, and gives way when the room above runs out', () => {
    const box = { left: 100, right: 200, top: 300, bottom: 320 };
    // The lander's name, and a part's name above it.
    const names = [
      { left: 150, right: 250, top: 310, bottom: 330 },
      { left: 120, right: 180, top: 280, bottom: 302 },
    ];
    expect(liftClear(box, names, 0)).toBe(320 - 280 + 4);
    // Clear already: it stays.
    expect(liftClear(box, [{ left: 210, right: 260, top: 300, bottom: 320 }], 0)).toBe(0);
    expect(liftClear(box, [], 0)).toBe(0);
    // A label that meets nothing stays where its body put it, high in the sky or not.
    expect(liftClear(box, [], 400)).toBe(0);
    expect(liftClear(box, [{ left: 210, right: 260, top: 300, bottom: 320 }], 400)).toBe(0);
    // Lifted, its top may not rise above the room's top.
    expect(liftClear(box, names, 270)).toBeNull();
  });
});

describe('the level horizon', () => {
  it('stands across the middle of a level view, and lower as the view looks up', () => {
    expect(levelY(0, 60)).toBeCloseTo(0.5, 9);
    expect(levelY(10, 60)).toBeGreaterThan(0.5);
    expect(levelY(-10, 60)).toBeLessThan(0.5);
    // At 30° up in a 60° view the level horizon is on the bottom edge.
    expect(levelY(30, 60)).toBeCloseTo(1, 9);
  });
});

describe('the days on the paths', () => {
  type Box = { left: number; top: number; right: number; bottom: number };
  const at = (left: number, top: number, right: number, bottom: number): Box => ({ left, top, right, bottom });
  // The view as jsdom has it, 1024 x 768, facing north: the Sun ahead, Earth 120 degrees right, out of view.
  const series = { i0: 0, hours: 3, sunAz: Float64Array.from([0, 0, 0]), sunEl: Float64Array.from([2, 2, 2]), earthAz: Float64Array.from([120, 120, 120]), earthEl: Float64Array.from([3, 3, 3]), sunFraction: Float64Array.from([1, 1, 1]), earthVisible: Uint8Array.from([1, 1, 1]), sunAu: Float64Array.from([1, 1, 1]) } as Series;
  const sky = { stars: { count: 0, j2000: new Float32Array(), vmag: new Float32Array(), bv: new Float32Array() }, moon: { startMs: 0, stepMs: 1, count: 2, quats: Float32Array.from([1, 0, 0, 0, 1, 0, 0, 0]) }, earthDayUrl: '', earthCloudsUrl: '' };
  // Earth's name, the level horizon's and the pointer to Earth, as the browser lays them out; and six chips: the
  // first on Earth's name, the second clear, the third on the second, the fourth on the level horizon's name, the
  // fifth on the pointer, and the sixth only on the third.
  const EARTH = at(500, 300, 660, 328), LEVEL = at(12, 430, 120, 458), POINTER = at(860, 400, 1016, 426);
  const CHIPS: [string, Box][] = [
    ['Earth in view, 10 Jan', at(540, 310, 700, 338)],
    ['Sun behind hills, 3 Jan', at(200, 200, 370, 228)],
    ['Sun back, 20 Jan', at(300, 210, 430, 238)],
    ['Sunset, 25 Jan', at(60, 440, 170, 468)],
    ['Sun back, 28 Jan', at(880, 410, 1000, 438)],
    ['Earth in view, 29 Jan', at(420, 230, 560, 258)],
  ];
  const box = (el: Element): Box | undefined =>
    el.getAttribute('data-sky') === 'earth'
      ? EARTH
      : el.getAttribute('data-pointer') === 'earth'
        ? POINTER
        : el.textContent === 'Level horizon'
          ? LEVEL
          : el.hasAttribute('data-path-mark')
            ? CHIPS.find(([text]) => text === el.textContent)?.[1]
            : undefined;

  it('give way, frame by frame, to every label shown and to the chips before them, and come back once clear', async () => {
    let earthNamed = true;
    const labels = (): SkyLabels => ({
      sun: { x: 0.5, y: 0.45, visible: true },
      earth: { x: 0.57, y: 0.43, visible: earthNamed },
      stars: [],
      lander: null,
      marks: CHIPS.map(([text], k) => ({ text, x: 0.1 + 0.1 * k, y: 0.3, visible: true })),
    });
    const r: RendererLike = { setTime: vi.fn(), setView: vi.fn(), resize: vi.fn(), render: vi.fn(), labels, dispose: vi.fn() };
    const scene: StandScene = { field: flatField(0), mask: { az0: 0, step: 0.5, el: new Array(720).fill(0) }, series, startUtc: '2027-01-01T00:00:00', site: { lat: -88.28, lon: -64.31 }, mastM: 2, sky, marks: CHIPS.map(([text], k) => ({ hour: k, body: 'sun', text })) };
    const rect = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const b = box(this) ?? at(0, 0, 0, 0);
      return { ...b, x: b.left, y: b.top, width: b.right - b.left, height: b.bottom - b.top, toJSON: () => b } as DOMRect;
    });
    try {
      render(createElement(StandCanvas, { scene, hour: 0, look: null, startYaw: 0, reducedMotion: true, createRenderer: () => r, sunLabel: 'Sun 2.0° up', earthLabel: 'Earth 3.0° up', night: false, onFail: vi.fn() }));
      const hidden = () => [...document.querySelectorAll<HTMLElement>('[data-path-mark]')].map((n) => n.hidden);
      await waitFor(() => expect(document.querySelector<HTMLElement>('[data-pointer="earth"]')!.hidden).toBe(false));
      await waitFor(() => expect(hidden()[1]).toBe(false));
      // The labels shown keep their places; of two chips on each other the earlier stays; a chip left out takes no room.
      expect(hidden()).toEqual([true, false, true, true, true, false]);
      // Earth's name goes: the chip it covered comes back.
      earthNamed = false;
      await waitFor(() => expect(hidden()[0]).toBe(false));
      expect(hidden()).toEqual([false, false, true, true, true, false]);
    } finally {
      rect.mockRestore();
    }
  });

  it('keep 4 px clear of a label, and leave out none for a chip not shown or not yet laid out', () => {
    const b = (left: number, top: number, width = 100) => at(left, top, left + width, top + 28);
    // 2 px from the label is too close; 5 px is clear.
    expect(chipsShown([b(100, 100)], [b(202, 100)])).toEqual([false]);
    expect(chipsShown([b(100, 100)], [b(205, 100)])).toEqual([true]);
    // A chip not shown stays so; one with no width yet shows and takes no room, so the next one shows too.
    expect(chipsShown([null, b(0, 0, 0), b(0, 0)], [])).toEqual([false, true, true]);
  });
});

/** A place as a style gives it ("50%", "calc(50% - 12px)", "8px"), in pixels of a side `whole` pixels long. */
const stylePx = (v: string, whole: number) => {
  const m = /^(?:calc\()?(-?[\d.]+(?:e-?\d+)?)(%|px)(?: ([+-]) ([\d.]+(?:e-?\d+)?)px)?\)?$/.exec(v);
  if (!m) throw new Error(`a place the layout cannot read: "${v}"`);
  return (m[2] === '%' ? (Number(m[1]) / 100) * whole : Number(m[1])) + (m[3] ? (m[3] === '-' ? -1 : 1) * Number(m[4]) : 0);
};
/**
 * The labels laid out as a browser lays them out on jsdom's 1024 x 768 view: each box at its size (`size`, none for
 * the rest) where its style puts it, shifted as its classes shift it: a body's or the lander's name over its spot, a
 * day's chip higher, a path's name hanging under its spot, a pointer centred on its height at an edge.
 */
function layout(size: (el: HTMLElement) => [number, number] | undefined) {
  return vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const el = this as HTMLElement, wh = size(el);
    let b = { left: 0, top: 0, right: 0, bottom: 0 };
    if (wh && !el.hidden) {
      const [w, h] = wh;
      if (el.hasAttribute('data-pointer')) {
        const left = el.style.left ? stylePx(el.style.left, 1024) : 1024 - stylePx(el.style.right, 1024) - w, mid = stylePx(el.style.top, 768);
        b = { left, top: mid - h / 2, right: left + w, bottom: mid + h / 2 };
      } else {
        const x = stylePx(el.style.left, 1024) - w / 2, y = stylePx(el.style.top, 768);
        const top = el.hasAttribute('data-path-mark') ? y - 1.4 * h : el.hasAttribute('data-path-name') ? y + 0.25 * h : y - h;
        b = { left: x, top, right: x + w, bottom: top + h };
      }
    }
    return { ...b, x: b.left, y: b.top, width: b.right - b.left, height: b.bottom - b.top, toJSON: () => b } as DOMRect;
  });
}
/** Whether two boxes come within 4 px of each other. */
const near = (a: { left: number; top: number; right: number; bottom: number }, b: { left: number; top: number; right: number; bottom: number }) =>
  a.right > b.left - 4 && a.left < b.right + 4 && a.bottom > b.top - 4 && a.top < b.bottom + 4;
/** Facing north, the Sun ahead and Earth 120 degrees right, out of view. */
const northSeries = { i0: 0, hours: 3, sunAz: Float64Array.from([0, 0, 0]), sunEl: Float64Array.from([2, 2, 2]), earthAz: Float64Array.from([120, 120, 120]), earthEl: Float64Array.from([3, 3, 3]), sunFraction: Float64Array.from([1, 1, 1]), earthVisible: Uint8Array.from([1, 1, 1]), sunAu: Float64Array.from([1, 1, 1]) } as Series;
const noStars = { stars: { count: 0, j2000: new Float32Array(), vmag: new Float32Array(), bv: new Float32Array() }, moon: { startMs: 0, stepMs: 1, count: 2, quats: Float32Array.from([1, 0, 0, 0, 1, 0, 0, 0]) }, earthDayUrl: '', earthCloudsUrl: '' };
/** The sizes the browser gives the labels: the bodies' names, the lander's, a day's chip, a path's name and a pointer. */
const sizes = (el: HTMLElement): [number, number] | undefined =>
  el.getAttribute('data-sky') === 'sun'
    ? [220, 30]
    : el.getAttribute('data-sky') === 'earth'
      ? [180, 30]
      : el.textContent?.startsWith('The lander')
        ? [160, 30]
        : el.hasAttribute('data-path-mark')
          ? [150, 28]
          : el.hasAttribute('data-path-name')
            ? [170, 30]
            : el.hasAttribute('data-pointer')
              ? [156, 26]
              : undefined;

describe('a label over the lander', () => {
  const lander = { left: 400, top: 300, right: 600, bottom: 560 };
  it('moves the least way that clears the lander’s body by 4 px, to its left or right or above it, and stays where it is when clear', () => {
    expect(offLander({ left: 300, right: 420, top: 400, bottom: 430 }, lander, 1024, 4)).toEqual({ dx: 400 - 4 - 420, dy: 0 });
    expect(offLander({ left: 590, right: 700, top: 400, bottom: 430 }, lander, 1024, 4)).toEqual({ dx: 600 + 4 - 590, dy: 0 });
    expect(offLander({ left: 450, right: 550, top: 290, bottom: 320 }, lander, 1024, 4)).toEqual({ dx: 0, dy: 300 - 4 - 320 });
    expect(offLander({ left: 100, right: 200, top: 400, bottom: 430 }, lander, 1024, 4)).toEqual({ dx: 0, dy: 0 });
  });
  it('takes another way where the least would leave the screen, rise above the room or meet another label, and gives way where none is clear', () => {
    // The lander at the screen's right edge: a label low over its right side goes to its left, not off the screen.
    expect(offLander({ left: 900, right: 1000, top: 500, bottom: 530 }, { ...lander, left: 800, right: 1020 }, 1024, 4)).toEqual({ dx: 800 - 4 - 1000, dy: 0 });
    // Above it would meet the lander's own name: beside it instead.
    const name = { left: 430, right: 590, top: 262, bottom: 292 };
    expect(offLander({ left: 460, right: 560, top: 300, bottom: 330 }, lander, 1024, 4, [name])).toEqual({ dx: 600 + 4 - 460, dy: 0 });
    // Above would take it over the room's top: beside it.
    expect(offLander({ left: 460, right: 560, top: 300, bottom: 330 }, lander, 1024, 290)).toEqual({ dx: 600 + 4 - 460, dy: 0 });
    // Hemmed in on every side: it gives way.
    expect(offLander({ left: 300, right: 700, top: 400, bottom: 430 }, lander, 750, 4, [name])).toBeNull();
  });
});

describe('the labels round the lander', () => {
  it('keep off the lander’s body, beside it or above it, or give way for the frame, while its own name keeps its place', async () => {
    // The lander near the right edge, its box from 717 to 973 px across and 346 to 576 px down; its name above it.
    const labels = (): SkyLabels => ({
      sun: { x: 0.68, y: 0.6, visible: true },
      earth: { x: 0, y: 0, visible: false },
      stars: [],
      lander: { x: 0.825, y: 0.43, visible: true },
      landerBox: { left: 0.7, top: 0.45, right: 0.95, bottom: 0.75 },
      marks: [{ text: 'Sun behind hills, 3 Jan', x: 0.8, y: 0.62, visible: true }],
      pathNames: [
        { body: 'sun', text: "Sun's path this month", x: 0.75, y: 0.66, visible: true },
        { body: 'earth', text: "Earth's path this month", x: 0, y: 0, visible: false },
      ],
    });
    const r: RendererLike = { setTime: vi.fn(), setView: vi.fn(), resize: vi.fn(), render: vi.fn(), labels, dispose: vi.fn() };
    const scene: StandScene = { field: flatField(0), mask: { az0: 0, step: 0.5, el: new Array(720).fill(0) }, series: northSeries, startUtc: '2027-01-01T00:00:00', site: { lat: -88.28, lon: -64.31 }, mastM: 2, sky: noStars, lander: { azDeg: 30, distM: 16, powered: Uint8Array.from([1, 1, 1]) }, marks: [{ hour: 1, body: 'sun', text: 'Sun behind hills, 3 Jan' }] };
    const rect = layout(sizes);
    try {
      render(createElement(StandCanvas, { scene, hour: 0, look: null, startYaw: 0, reducedMotion: true, createRenderer: () => r, sunLabel: 'Sun 1.6° up, behind the hills', earthLabel: 'Earth 3.0° up', night: false, onFail: vi.fn() }));
      const body = { left: 0.7 * 1024, top: 0.45 * 768, right: 0.95 * 1024, bottom: 0.75 * 768 };
      const sun = document.querySelector<HTMLElement>('[data-sky="sun"]')!, name = document.querySelector<HTMLElement>('[data-path-name="sun"]')!;
      const pointer = document.querySelector<HTMLElement>('[data-pointer="earth"]')!, chip = document.querySelector<HTMLElement>('[data-path-mark]')!;
      const landerName = [...document.querySelectorAll<HTMLElement>('span')].find((n) => n.textContent === 'The lander, 16 m away')!;
      await waitFor(() => expect(name.hidden).toBe(false));
      // The lander's own name keeps its place over it.
      expect([landerName.hidden, landerName.style.left, landerName.style.top]).toEqual([false, '82.5%', '43%']);
      // The Sun's name, the path's name and the pointer to Earth show, none on the lander.
      for (const n of [sun, name, pointer]) {
        expect(n.hidden).toBe(false);
        expect(near(n.getBoundingClientRect(), body)).toBe(false);
      }
      // The Sun's name went beside the lander rather than over its own name, and the pointer above both.
      expect(sun.getBoundingClientRect().right).toBeLessThanOrEqual(body.left - 4);
      expect(near(pointer.getBoundingClientRect(), landerName.getBoundingClientRect())).toBe(false);
      // The day's chip has nowhere clear to go: beside the lander it would meet the Sun's name, above it the lander's.
      expect(chip.hidden).toBe(true);
    } finally {
      rect.mockRestore();
    }
  });
});

describe('the paths’ names', () => {
  it('name the Sun’s path and Earth’s in their colours where the renderer puts them, give way to the bodies’ names, and the days give way to them', async () => {
    let sunNamed = true;
    const labels = (): SkyLabels => ({
      sun: { x: 0.5, y: 0.45, visible: sunNamed },
      earth: { x: 0, y: 0, visible: false },
      stars: [],
      lander: null,
      marks: [{ text: 'Earth in view, 10 Jan', x: 0.3, y: 0.62, visible: true }],
      pathNames: [
        { body: 'sun', text: "Sun's path this month", x: 0.3, y: 0.55, visible: true },
        // On the Sun's name.
        { body: 'earth', text: "Earth's path this month", x: 0.52, y: 0.4, visible: true },
      ],
    });
    const r: RendererLike = { setTime: vi.fn(), setView: vi.fn(), resize: vi.fn(), render: vi.fn(), labels, dispose: vi.fn() };
    const scene: StandScene = { field: flatField(0), mask: { az0: 0, step: 0.5, el: new Array(720).fill(0) }, series: northSeries, startUtc: '2027-01-01T00:00:00', site: { lat: -88.28, lon: -64.31 }, mastM: 2, sky: noStars, marks: [{ hour: 1, body: 'earth', text: 'Earth in view, 10 Jan' }] };
    const props = { scene, hour: 0, look: null, startYaw: 0, reducedMotion: true, createRenderer: () => r, sunLabel: 'Sun 2.0° up', earthLabel: 'Earth 3.0° up', night: false, onFail: vi.fn() };
    const rect = layout(sizes);
    try {
      const view = render(createElement(StandCanvas, props));
      const names = () => [...document.querySelectorAll<HTMLElement>('[data-path-name]')];
      await waitFor(() => expect(names()[0].hidden).toBe(false));
      expect(names().map((n) => [n.dataset.pathName, n.textContent])).toEqual([
        ['sun', "Sun's path this month"],
        // Earth's with why it loops, on a second line.
        ['earth', `Earth's path this month\n${EARTH_LOOP}`],
      ]);
      // In the bodies' colours.
      expect(names()[0].className).toContain('text-[#f6b646]');
      expect(names()[1].className).toContain('text-[#74adff]');
      // Earth's gives way to the Sun's name; the day's chip gives way to the Sun's path's name.
      expect(names()[1].hidden).toBe(true);
      expect(document.querySelector<HTMLElement>('[data-path-mark]')!.hidden).toBe(true);
      // The Sun's name gone, Earth's path's name comes back.
      sunNamed = false;
      await waitFor(() => expect(names()[1].hidden).toBe(false));
      // Hidden with the words.
      view.rerender(createElement(StandCanvas, { ...props, clean: true }));
      await waitFor(() => expect(names().every((n) => n.hidden)).toBe(true));
    } finally {
      rect.mockRestore();
    }
  });
});
