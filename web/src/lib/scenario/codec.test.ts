import { describe, expect, it } from 'vitest';
import { DEFAULT_POWER } from '@/lib/engine/power';
import { comparisonHref, readComparison, writeComparison, LINK_VERSION } from './codec';
import type { Scenario } from './scenario';

const base: Scenario = { id: 'a', label: 'Original landing', siteId: 'de_gerlache_rim_2', startUtc: '2027-01-01T00:00:00', days: 30, power: DEFAULT_POWER, mastM: 2, minEarthElDeg: 0, timing: 'set' };
const later: Scenario = { ...base, id: 'b', label: '5 days later', startUtc: '2027-01-06T00:00:00', from: 'a' };
const near: Scenario = { ...later, id: 'c', label: 'Nearby: de Gerlache rim summit', siteId: 'de_gerlache_center_rim_high', from: 'b' };
const custom: Scenario = {
  ...base,
  id: 'd',
  label: 'Ridge ~ "east" spur, 3 m mast',
  siteId: 'custom_-88.3000_-63.9000',
  days: 45,
  power: { panel: 'vertical', panelAzimuthDeg: 135, areaM2: 6.5, efficiency: 0.28, loadW: 150, batteryWh: 5000, initialSocFraction: 0.8 },
  mastM: 3,
  minEarthElDeg: 1.5,
  timing: 'site-best',
};

/** The settings alone: ids are given again on reading. */
const settings = (s: Scenario) => {
  const copy: Partial<Scenario> = { ...s };
  delete copy.id;
  delete copy.from;
  return copy;
};

describe('the comparison in a link', () => {
  it('carries every setting of every scenario and reads back the same, the baseline first', () => {
    const q = writeComparison([base, later, near, custom]);
    const back = readComparison(q);
    expect(back.problem).toBeNull();
    expect(back.scenarios.map(settings)).toEqual([base, later, near, custom].map(settings));
    // Which scenario each was made from survives, by position.
    expect(back.scenarios[1].from).toBe(back.scenarios[0].id);
    expect(back.scenarios[2].from).toBe(back.scenarios[1].id);
    expect(back.scenarios[3].from).toBeUndefined();
  });

  it('is versioned and compact: a version, then a short field list and a label for each scenario', () => {
    const q = writeComparison([base, later]);
    expect(q).toBe(`v=${LINK_VERSION}&s=de_gerlache_rim_2~2027010100~30~vt~0~4~0.3~200~2000~1~2~0~s~&l=Original%20landing&s=de_gerlache_rim_2~2027010600~30~vt~0~4~0.3~200~2000~1~2~0~s~0&l=5%20days%20later`);
    expect(comparisonHref([base, later])).toBe(`/compare?${q}`);
    expect(comparisonHref([])).toBe('/compare');
  });

  it('reads an address with or without its question mark, and as URLSearchParams', () => {
    const q = writeComparison([base]);
    expect(readComparison(`?${q}`).scenarios).toHaveLength(1);
    expect(readComparison(new URLSearchParams(q)).scenarios).toHaveLength(1);
  });

  it('leaves an old /compare address to the page as it was: no comparison, no problem', () => {
    expect(readComparison('')).toEqual({ scenarios: [], problem: null, found: false });
    expect(readComparison('?site=de_gerlache_rim_2')).toEqual({ scenarios: [], problem: null, found: false });
  });

  it('says in plain words when a link is from a newer version, and reads nothing from it', () => {
    const r = readComparison('v=9&s=de_gerlache_rim_2~2027010100~30~vt~0~4~0.3~200~2000~1~2~0~s~&l=x');
    expect(r.scenarios).toEqual([]);
    expect(r.found).toBe(true);
    expect(r.problem).toMatch(/newer version of Earthrise/);
  });

  it('drops a scenario it cannot read, says how many, and keeps the rest', () => {
    const good = writeComparison([base]);
    const r = readComparison(`${good}&s=de_gerlache_rim_2~2027010100~30~vt~0~4~0.3~-5~2000~1~2~0~s~&l=bad%20load&s=nonsense&l=`);
    expect(r.scenarios).toHaveLength(1);
    expect(r.problem).toBe('2 scenarios in this link could not be read and are left out.');
  });

  it('refuses a landing off the hourly table or a length it cannot work out', () => {
    expect(readComparison('v=1&s=de_gerlache_rim_2~2040010100~30~vt~0~4~0.3~200~2000~1~2~0~s~&l=x').scenarios).toEqual([]);
    expect(readComparison('v=1&s=de_gerlache_rim_2~2027010100~400~vt~0~4~0.3~200~2000~1~2~0~s~&l=x').scenarios).toEqual([]);
    expect(readComparison('v=1&s=de_gerlache_rim_2~2027010100~30~vt~0~4~0.3~200~2000~1~2~0~s~&l=x').scenarios).toHaveLength(1);
  });

  it('keeps a label with any characters, and gives a scenario without one a plain name', () => {
    const odd = { ...base, label: 'Plan B + 50 % ~ "east" & more' };
    expect(readComparison(writeComparison([odd])).scenarios[0].label).toBe(odd.label);
    expect(readComparison(new URLSearchParams(writeComparison([odd]))).scenarios[0].label).toBe(odd.label);
    expect(readComparison('v=1&s=de_gerlache_rim_2~2027010100~30~vt~0~4~0.3~200~2000~1~2~0~s~').scenarios[0].label).toBe('Scenario 1');
  });

  it('keeps at most four scenarios', () => {
    const q = writeComparison([base, later, near, custom, { ...base, id: 'e' }]);
    expect(readComparison(q).scenarios).toHaveLength(4);
  });
});
