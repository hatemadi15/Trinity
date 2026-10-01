import { describe, expect, it } from 'vitest';
import { compassTicks, plateWidth, rowGeometry, rowRange } from './skyrow';

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

describe('plateWidth', () => {
  it('grows with the text', () => {
    expect(plateWidth('Sun sets 3 Jan', 15)).toBeGreaterThan(plateWidth('Sun', 15));
    expect(plateWidth('', 15)).toBe(12);
  });
});
