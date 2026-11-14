import { describe, expect, it } from 'vitest';
import { readJson } from '../engine/__tests__/helpers';
import catalogue from './catalogue.json';
import type { Site } from './loaders';

/** The committed catalogue copy the chat route bundles must match the pipeline's site files (sync-local writes it). */
describe('catalogue.json', () => {
  it('matches data/sites.json plus sites_derived.json id for id and name for name', () => {
    const expected = [
      ...readJson<{ sites: Site[] }>('data', 'sites.json').sites,
      ...readJson<{ sites: Site[] }>('data', 'sites_derived.json').sites,
    ].map((s) => ({ id: s.id, name: s.name, label: s.label, blurb: s.blurb, lat: s.lat, lon: s.lon, category: s.category, polar: s.polar, kind: s.kind }));
    expect(catalogue.sites).toEqual(expected);
    expect(catalogue.sites.length).toBeGreaterThanOrEqual(34);
  });
});
