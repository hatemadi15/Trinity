import { describe, expect, it } from 'vitest';
import { arrowEnd, compassCorner, heightWords, scaleBarKm } from './shadowmap';

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
  it('says how high a body stands, in whole degrees, or that it is below the horizon', () => {
    expect(heightWords('Sun', 2.4)).toBe('Sun 2° up');
    expect(heightWords('Earth', 0.2)).toBe('Earth 0° up');
    expect(heightWords('Earth', -1.5)).toBe('Earth below the horizon');
  });
});
