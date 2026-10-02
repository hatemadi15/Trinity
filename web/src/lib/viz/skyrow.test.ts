import { describe, expect, it } from 'vitest';
import { compassTicks, eventLabelSides, hiddenBy, hiddenRuns, longestHidden, rowGeometry, rowRange, scalePreference, scaleWordSides, scaleLines, scaleStepFor } from './skyrow';

const box = { x: 100, y: 10, w: 800, h: 100 };

describe('rowRange', () => {
  it('leaves headroom above the body and lets tall hills run off the top', () => {
    const r = rowRange([0, 1, 2.5, 1], [-2, 0, 15, 14]);
    expect(r.min).toBeCloseTo(-3, 5);
    expect(r.max).toBeCloseTo(8.5, 5);
  });

  it('never collapses when everything is flat', () => {
    const r = rowRange([0, 0], [0, 0]);
    expect(r.max - r.min).toBeGreaterThanOrEqual(6);
  });

  it('can make room for the whole of the hills, so none run off the top', () => {
    const r = rowRange([0, 1, 2.5, 1], [-2, 0, 15, 14], { headroom: 4, fitHills: true });
    expect(r.max).toBeCloseTo(16, 5);
    expect(r.min).toBeCloseTo(-3, 5);
  });

  it('can keep a share of the row free above the body, for the words that sit there', () => {
    // Earth up to 7°, hills down to -3°: 4° of headroom would leave only 4/15 of the row above the line.
    const r = rowRange([5, 7, 6], [-3, 1, 0], { headroom: 4, headroomShare: 0.36 });
    expect(r.min).toBeCloseTo(-4, 5);
    expect((r.max - 7) / (r.max - r.min)).toBeCloseTo(0.36, 5);
    // A low Sun already has more room than that: the fixed headroom wins.
    expect(rowRange([0, 1, 2.5, 1], [-2, 0, 15, 14], { headroom: 4, headroomShare: 0.36 }).max).toBeCloseTo(6.5, 5);
  });
});

describe('rowGeometry', () => {
  const el = [2, 2, 1, 1, 1, 2];
  const hill = [0, 0, 3, 3, 0, 0];
  const visible = [1, 1, 0, 0, 1, 1];
  const g = rowGeometry(el, hill, visible, box, { min: -2, max: 6 });

  it('places hour centres across the box and degrees up the box', () => {
    expect(g.x(0)).toBeCloseTo(100 + 800 / 12, 5);
    expect(g.x(5)).toBeCloseTo(900 - 800 / 12, 5);
    expect(g.y(-2)).toBeCloseTo(110, 5);
    expect(g.y(6)).toBeCloseTo(10, 5);
    expect(g.y(99)).toBeCloseTo(10, 5); // clamped
  });

  it('splits the body line into visible and hidden runs that share their end points', () => {
    expect(g.runs.map((r) => r.visible)).toEqual([true, false, true]);
    const first = g.runs[0].points.split(' ');
    const second = g.runs[1].points.split(' ');
    expect(second[0]).toBe(first[first.length - 1]);
  });

  it('reports where the body sets and rises', () => {
    expect(g.events).toEqual([
      { hour: 2, kind: 'set' },
      { hour: 4, kind: 'rise' },
    ]);
  });

  it('closes the hill shape along the bottom of the box', () => {
    expect(g.hillArea.startsWith('M100 ')).toBe(true);
    expect(g.hillArea.endsWith('Z')).toBe(true);
    expect(g.hillEdge.startsWith('M')).toBe(true);
  });
});

describe('rowGeometry with hills above the range', () => {
  const el = [1, 1, 1, 1, 1, 1];

  it('does not outline the hills where they run off the top of the row', () => {
    const g = rowGeometry(el, [0, 9, 9, 9, 0, 0], [1, 0, 0, 0, 1, 1], box, { min: -2, max: 6 });
    // One stroke climbs to the first hour above the range, another comes down from the last one.
    expect(g.hillEdge.match(/M/g)).toHaveLength(2);
    expect(g.clipped).toBe(true);
    expect(g.hillArea.endsWith('Z')).toBe(true);
  });

  it('outlines everything when no hill reaches the top', () => {
    const g = rowGeometry(el, [0, 2, 3, 2, 0, 0], [1, 1, 1, 1, 1, 1], box, { min: -2, max: 6 });
    expect(g.hillEdge.match(/M/g)).toHaveLength(1);
    expect(g.clipped).toBe(false);
  });

  it('draws nothing for the edge when the hills are above the range the whole time', () => {
    const g = rowGeometry(el, [9, 9, 9, 9, 9, 9], [0, 0, 0, 0, 0, 0], box, { min: -2, max: 6 });
    expect(g.hillEdge).toBe('');
    expect(g.clipped).toBe(true);
  });
});

describe('scalePreference', () => {
  it('prefers the side away from the longest hidden stretch, the right when nothing is hidden', () => {
    expect(scalePreference(null)).toEqual(['right', 'left']);
    expect(scalePreference(37)).toEqual(['right', 'left']);
    expect(scalePreference(80)).toEqual(['left', 'right']);
  });
});

describe('scaleWordSides', () => {
  const lines = [
    { deg: 0, y: 150 },
    { deg: 5, y: 40 },
  ];

  it('writes the words on the preferred side when nothing else is there', () => {
    expect(scaleWordSides(lines, [], ['right', 'left'])).toEqual(['right', 'right']);
  });

  it("moves one line's words to the other side when a label sits at its height on the preferred side", () => {
    // A sunrise label at the right edge, at the height of the horizon line only.
    const taken = [{ x0: 80, x1: 97, y0: 140, y1: 164 }];
    expect(scaleWordSides(lines, taken, ['right', 'left'])).toEqual(['left', 'right']);
  });

  it('leaves out only the words of a line that meets labels on both sides', () => {
    const taken = [
      { x0: 5, x1: 22, y0: 140, y1: 164 },
      { x0: 78, x1: 95, y0: 140, y1: 164 },
    ];
    expect(scaleWordSides(lines, taken, ['right', 'left'])).toEqual([null, 'right']);
  });

  it("measures the words by their plate, which reaches 13 px below the line, and keeps 2 px clear", () => {
    // Words under the line at y 30.5 would touch a label whose top is at 42.
    const taken = [{ x0: 76, x1: 99, y0: 42, y1: 67 }];
    expect(scaleWordSides([{ deg: 10, y: 30.5 }], taken, ['right', 'left'])).toEqual(['left']);
    expect(scaleWordSides([{ deg: 10, y: 26 }], taken, ['right', 'left'])).toEqual(['right']);
  });

  it('ignores labels away from the edges', () => {
    expect(scaleWordSides(lines, [{ x0: 30, x1: 70, y0: 0, y1: 200 }], ['left', 'right'])).toEqual(['left', 'left']);
  });
});

describe('scaleLines', () => {
  it('draws a line every 5° when the row is tall enough for their words, the horizon first', () => {
    expect(scaleLines({ min: -3.86, max: 16.12 }, 200)).toEqual([
      { deg: 0, words: 'horizon (0°)' },
      { deg: 5, words: '5° up' },
      { deg: 10, words: '10° up' },
      { deg: 15, words: '15° up' },
    ]);
  });

  it('spaces them 10° apart in a short row, and leaves out lines at the very edge of the range', () => {
    expect(scaleLines({ min: -7.52, max: 15.8 }, 120)).toEqual([
      { deg: 0, words: 'horizon (0°)' },
      { deg: 10, words: '10° up' },
    ]);
    expect(scaleLines({ min: -2, max: 5.2 }, 200)).toEqual([{ deg: 0, words: 'horizon (0°)' }]);
  });
});

describe('scaleStepFor', () => {
  it('spaces the lines 5° apart when their words fit, 10° otherwise, and lets a row be told the spacing', () => {
    expect(scaleStepFor({ min: -3.86, max: 16.12 }, 200)).toBe(5);
    expect(scaleStepFor({ min: -7.52, max: 15.8 }, 120)).toBe(10);
    // Two rows drawn together use the larger spacing, so "5° up" never sits beside a "10° up" of the same height.
    expect(scaleLines({ min: -3.86, max: 16.12 }, 200, 10)).toEqual([
      { deg: 0, words: 'horizon (0°)' },
      { deg: 10, words: '10° up' },
    ]);
  });
});

describe('hiddenRuns', () => {
  it('lists every stretch the body is hidden, in order, including those at the ends', () => {
    expect(hiddenRuns([0, 0, 1, 1, 0, 1, 0])).toEqual([
      { from: 0, to: 2 },
      { from: 4, to: 5 },
      { from: 6, to: 7 },
    ]);
    expect(hiddenRuns([1, 1])).toEqual([]);
  });
});

describe('hiddenBy', () => {
  it('blames the hills when they stand above eye level and above the body', () => {
    expect(hiddenBy([1, 0.5, -0.5, 0.2], [9, 12, 14, 10], 0, 4)).toBe('hills');
  });

  it('says the body is below the horizon when the hills in its direction are low', () => {
    expect(hiddenBy([-3, -6, -4, -1], [0.3, -0.2, 0.5, 0.1], 0, 4)).toBe('horizon');
  });

  it('only looks at the hidden stretch', () => {
    expect(hiddenBy([5, -3, -4, 5], [12, 0.1, 0.2, 12], 1, 3)).toBe('horizon');
  });
});

describe('compassTicks', () => {
  it('names the compass direction where the azimuth crosses it, including the wrap through north', () => {
    const az = [100, 95, 88, 50, 44, 10, 2, 358, 300];
    expect(compassTicks(az)).toEqual([
      { hour: 2, label: 'east' },
      { hour: 4, label: 'north-east' },
      { hour: 7, label: 'north' },
      { hour: 8, label: 'north-west' },
    ]);
  });
});

describe('longestHidden', () => {
  it('finds the longest stretch the body spends behind the hills', () => {
    expect(longestHidden([1, 1, 0, 0, 0, 1, 0, 1])).toEqual({ from: 2, to: 5 });
  });

  it('counts a stretch that began before the window or runs past its end', () => {
    expect(longestHidden([0, 0, 0, 1, 1, 0])).toEqual({ from: 0, to: 3 });
    expect(longestHidden([1, 0, 0, 0])).toEqual({ from: 1, to: 4 });
    expect(longestHidden([0, 0])).toEqual({ from: 0, to: 2 });
  });

  it('returns nothing when the body stays in view', () => {
    expect(longestHidden([1, 1, 1])).toBeNull();
    expect(longestHidden([])).toBeNull();
  });
});

describe('eventLabelSides', () => {
  it('puts both labels inside a wide hidden stretch', () => {
    expect(eventLabelSides(9, 65)).toEqual({ set: 'inside', rise: 'inside' });
  });

  it('moves them outside a narrow stretch when there is room there', () => {
    expect(eventLabelSides(40, 50)).toEqual({ set: 'outside', rise: 'outside' });
  });

  it('drops a label that has room on neither side', () => {
    expect(eventLabelSides(5, 15)).toEqual({ set: null, rise: 'outside' });
    expect(eventLabelSides(88, 97)).toEqual({ set: 'outside', rise: null });
  });

  it('has no sunset label for a stretch that began before the window, and no sunrise label for one that outlasts it', () => {
    expect(eventLabelSides(0, 40)).toEqual({ set: null, rise: 'inside' });
    expect(eventLabelSides(70, 100)).toEqual({ set: 'inside', rise: null });
    expect(eventLabelSides(0, 100)).toEqual({ set: null, rise: null });
  });
});
