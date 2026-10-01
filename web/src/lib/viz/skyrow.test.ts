import { describe, expect, it } from 'vitest';
import { compassTicks, eventLabelSides, hiddenBy, longestHidden, rowGeometry, rowRange, scaleLabelSide, scaleLines } from './skyrow';

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

describe('scaleLabelSide', () => {
  it('puts the height-line words on the right when nothing is hidden', () => {
    expect(scaleLabelSide(null)).toBe('right');
  });

  it('keeps them away from the night and its sunset and sunrise labels', () => {
    // The home page case: night from 9 % to 65 % of the month, both labels inside it.
    expect(scaleLabelSide({ fromPct: 9.4, toPct: 64.8, set: 'inside', rise: 'inside' })).toBe('right');
    // A night at the end of the period.
    expect(scaleLabelSide({ fromPct: 60, toPct: 100, set: 'inside', rise: null })).toBe('left');
    // Short nights near an edge, with a label outside the night.
    expect(scaleLabelSide({ fromPct: 2, toPct: 9, set: null, rise: 'outside' })).toBe('right');
    expect(scaleLabelSide({ fromPct: 80, toPct: 90, set: 'outside', rise: 'outside' })).toBe('left');
  });

  it('takes the other side when the preferred one holds a label', () => {
    // The night sits left of the middle, so the right side is preferred, but the sunrise label reaches into it.
    expect(scaleLabelSide({ fromPct: 20, toPct: 76, set: null, rise: 'outside' })).toBe('left');
  });

  it('gives up when both sides hold a label', () => {
    expect(scaleLabelSide({ fromPct: 5, toPct: 95, set: 'inside', rise: 'inside' })).toBeNull();
  });
});

describe('scaleLines', () => {
  it('draws a line every 5° when the row is tall enough for their words, eye level first', () => {
    expect(scaleLines({ min: -3.86, max: 16.12 }, 200)).toEqual([
      { deg: 0, words: 'eye level' },
      { deg: 5, words: '5° up' },
      { deg: 10, words: '10° up' },
      { deg: 15, words: '15° up' },
    ]);
  });

  it('spaces them 10° apart in a short row, and leaves out lines at the very edge of the range', () => {
    expect(scaleLines({ min: -7.52, max: 15.8 }, 120)).toEqual([
      { deg: 0, words: 'eye level' },
      { deg: 10, words: '10° up' },
    ]);
    expect(scaleLines({ min: -2, max: 5.2 }, 200)).toEqual([{ deg: 0, words: 'eye level' }]);
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
