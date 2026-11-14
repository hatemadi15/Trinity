import { describe, expect, it } from 'vitest';
import { standQuery } from '@/lib/viz/stand';
import { exploreHref, standHref } from './links';

describe('standHref', () => {
  it('writes the start as Explore does, and the stand view reads the address back', () => {
    const href = standHref('nobile_rim_1', '2027-01-20T10:00:00', 14, 5);
    expect(href).toBe('/explore/stand?site=nobile_rim_1&start=2027-01-20T10:00&days=14&hour=5');
    expect(standQuery(href.slice(href.indexOf('?')))).toEqual({ site: 'nobile_rim_1', startUtc: '2027-01-20T10:00:00', days: 14, hour: 5 });
  });
});

describe('exploreHref', () => {
  it('writes a landing hour and any length, and leaves a midnight landing as a date, as old links were', () => {
    expect(exploreHref('nobile_rim_2', '2027-01-20T17:00:00', 7)).toBe('/explore?site=nobile_rim_2&start=2027-01-20T17:00&days=7');
    expect(exploreHref('nobile_rim_2', '2027-01-20T00:00:00', 45)).toBe('/explore?site=nobile_rim_2&start=2027-01-20&days=45');
    const stand = standHref('nobile_rim_2', '2027-01-20T17:00:00', 7, 0);
    expect(standQuery(stand.slice(stand.indexOf('?')))).toEqual({ site: 'nobile_rim_2', startUtc: '2027-01-20T17:00:00', days: 7, hour: 0 });
  });
});
