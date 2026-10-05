import { describe, expect, it } from 'vitest';
import { arrowEnd, compassCorner, heightWords, scaleBarKm, turnedView } from './shadowmap';

describe('scaleBarKm', () => {
  it('picks the longest round length that fits in a quarter of the picture', () => {
    expect(scaleBarKm(20.48)).toBe(5);
    expect(scaleBarKm(40.96)).toBe(10);
    expect(scaleBarKm(3)).toBe(0.5);
    expect(scaleBarKm(200)).toBe(50);
  });
});

describe('arrowEnd', () => {
  it('points from the middle of the map along the bearing, map-up being 0', () => {
    expect(arrowEnd(0, 400)).toEqual({ x: 200, y: 200 - 168 });
    const east = arrowEnd(90, 400);
    expect(east.x).toBeCloseTo(368, 9);
    expect(east.y).toBeCloseTo(200, 9);
    const south = arrowEnd(180, 400);
    expect(south.y).toBeCloseTo(368, 9);
  });
});

describe('compassCorner', () => {
  it('puts the compass in the corner farthest from both arrows, never the scale bar\'s', () => {
    // The Sun to the left, Earth up: the bottom right is free.
    expect(compassCorner([arrowEnd(270, 100), arrowEnd(0, 100)])).toBe('br');
    // The Sun down, Earth down and right: the top left.
    expect(compassCorner([arrowEnd(180, 100), arrowEnd(135, 100)])).toBe('tl');
    // Both towards the bottom left: the top right, the farthest of the three.
    expect(compassCorner([arrowEnd(225, 100), arrowEnd(225, 100)])).toBe('tr');
  });
});

describe('heightWords', () => {
  it('says how high a body stands, in tenths of a degree below 10, or that it is below the horizon', () => {
    // Tenths below 10°, as the sentence beside the map and the view from the site say it.
    expect(heightWords('Sun', 2.4)).toBe('Sun 2.4° up');
    expect(heightWords('Earth', 0.2)).toBe('Earth 0.2° up');
    expect(heightWords('Sun', 12.4)).toBe('Sun 12° up');
    expect(heightWords('Earth', -1.5)).toBe('Earth below the horizon');
  });

  it('says so when the hills hide a body that is above the horizon', () => {
    expect(heightWords('Sun', 2.4, 'yes')).toBe('Sun 2.4° up, set behind the hills');
    expect(heightWords('Sun', 2.4, 'partly')).toBe('Sun 2.4° up, partly set behind the hills');
    expect(heightWords('Earth', -1.5, 'yes')).toBe('Earth below the horizon');
  });
});

describe('turnedView', () => {
  it('turns the map so north at the site is up, and enlarges it just enough to fill its square', () => {
    const v = turnedView(-64.31);
    expect(v.rotateDeg).toBeCloseTo(64.31, 9);
    expect(v.scale).toBeCloseTo(Math.cos((64.31 * Math.PI) / 180) + Math.sin((64.31 * Math.PI) / 180), 9);
    expect(turnedView(0)).toEqual({ rotateDeg: 0, scale: 1 });
    // Longitudes past 180 turn the short way round.
    expect(turnedView(-200).rotateDeg).toBeCloseTo(-160, 9);
    expect(turnedView(90).scale).toBeCloseTo(1, 9);
  });
});
