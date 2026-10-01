import { describe, expect, it } from 'vitest';
import { readJson } from '../engine/__tests__/helpers';
import catalogue from './catalogue.json';
import { siteLabel, type Site } from './loaders';

const sites = [...readJson<{ sites: Site[] }>('data', 'sites.json').sites, ...readJson<{ sites: Site[] }>('data', 'sites_derived.json').sites];

describe('site labels and blurbs', () => {
  it('gives every catalogue site a short label and one plain line', () => {
    expect(sites).toHaveLength(19);
    for (const s of sites) {
      expect(s.label, s.id).toBeTruthy();
      expect(s.label!.length, s.id).toBeLessThanOrEqual(28);
      expect(s.blurb, s.id).toBeTruthy();
      expect(s.blurb!.length, s.id).toBeLessThanOrEqual(72);
      expect(`${s.label} ${s.blurb}`, s.id).not.toMatch(/LOLA|DE440|CLPS|Horizons|Artemis III/);
    }
    expect(new Set(sites.map((s) => s.label)).size).toBe(sites.length);
  });

  it('carries them into the catalogue bundled with the app', () => {
    const bundled = catalogue.sites as Site[];
    expect(bundled).toHaveLength(19);
    for (const s of bundled) expect(Boolean(s.label && s.blurb), s.id).toBe(true);
  });

  it('shows the formal name when a site has no label', () => {
    expect(siteLabel({ name: 'Custom site -89.500°, 10.000°' })).toBe('Custom site -89.500°, 10.000°');
    expect(siteLabel({ name: 'de Gerlache Rim 2 (Artemis III region)', label: 'de Gerlache Rim 2' })).toBe('de Gerlache Rim 2');
  });
});
