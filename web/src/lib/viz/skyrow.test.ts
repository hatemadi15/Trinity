import { describe, expect, it } from 'vitest';
import { compassTicks, eventLabelSides, longestHidden, rowGeometry, rowRange } from './skyrow';

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
