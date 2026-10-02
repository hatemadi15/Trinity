import { describe, expect, it } from 'vitest';
import { standQuery } from '@/lib/viz/stand';
import { standHref } from './links';

describe('standHref', () => {
  it('writes the start as Explore does, and the stand view reads the address back', () => {
    const href = standHref('nobile_rim_1', '2027-01-20T10:00:00', 14, 5);
    expect(href).toBe('/explore/stand?site=nobile_rim_1&start=2027-01-20T10:00&days=14&hour=5');
    expect(standQuery(href.slice(href.indexOf('?')))).toEqual({ site: 'nobile_rim_1', startUtc: '2027-01-20T10:00:00', days: 14, hour: 5 });
  });
});
