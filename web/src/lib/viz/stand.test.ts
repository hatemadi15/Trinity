import { describe, expect, it } from 'vitest';
import { hourlySeries, type Series } from '@/lib/engine/metrics';
import type { PowerResult } from '@/lib/engine/power';
import { utcToEt } from '@/lib/engine/time';
import { readJson } from '@/lib/engine/__tests__/helpers';
import { standHref } from '@/lib/links';
import { eph, sites } from '@/test/file-loaders';
import { groundWords } from './ground';
import { landerState, liveSentence, skyLabel, standQuery } from './stand';

const series = (o: Partial<Record<'sunEl' | 'sunAz' | 'sunFraction' | 'earthEl' | 'earthAz' | 'earthVisible', number[]>>): Series => {
  const hours = (o.sunEl ?? [0]).length;
  const f = (a?: number[], v = 0) => Float64Array.from(a ?? new Array(hours).fill(v));
  return { i0: 0, hours, sunAz: f(o.sunAz, 300), sunEl: f(o.sunEl), earthAz: f(o.earthAz, 70), earthEl: f(o.earthEl), sunFraction: f(o.sunFraction), earthVisible: Uint8Array.from(o.earthVisible ?? new Array(hours).fill(0)), sunAu: f(undefined, 1) } as Series;
};

describe('the stand view’s words', () => {
  it('reads the hour from the address, and leaves out what it cannot use', () => {
    expect(standQuery('?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10')).toEqual({ site: 'de_gerlache_rim_2', startUtc: '2027-01-01T00:00:00', days: 30, hour: 10 });
    expect(standQuery('?hour=-3').hour).toBeUndefined();
    expect(standQuery('?hour=ten').hour).toBeUndefined();
    expect(standQuery('?hour=2.5').hour).toBeUndefined();
  });
  it('links to the view for a site, a period and an hour', () => {
    expect(standHref('de_gerlache_rim_2', '2027-01-01T00:00:00', 30, 10)).toBe('/explore/stand?site=de_gerlache_rim_2&start=2027-01-01&days=30&hour=10');
  });
  it('labels the Sun and Earth by what they are doing', () => {
    const s = series({ sunEl: [2.4, 1.0, -0.5], sunFraction: [1, 0, 0], earthEl: [4.5, 1.2, -3], earthVisible: [1, 0, 0] });
    expect(skyLabel('sun', s, 0)).toBe('Sun 2.4° up');
    expect(skyLabel('sun', s, 1)).toBe('Sun, behind the hills');
    expect(skyLabel('sun', s, 2)).toBe('Sun, below the horizon');
    expect(skyLabel('earth', s, 0)).toBe('Earth 4.5° up');
    expect(skyLabel('earth', s, 1)).toBe('Earth, behind the hills');
    expect(skyLabel('earth', s, 2)).toBe('Earth, below the horizon');
  });
  it('says when the lander has power, when it went off, when it comes back, and when it never does', () => {
    const powered = Uint8Array.from([...new Array(76).fill(1), ...new Array(390).fill(0), ...new Array(254).fill(1)]);
    const p = { powered, firstBrownoutHour: 76 } as unknown as PowerResult;
    expect(landerState(p, '2027-01-01T00:00:00', 10)).toEqual({ on: true, text: 'The lander has power.' });
    expect(landerState(p, '2027-01-01T00:00:00', 100)).toEqual({ on: false, text: 'The lander is off: its battery ran out on 4 January. Power comes back on 20 January.' });
    expect(landerState(p, '2027-01-01T00:00:00', 500)).toEqual({ on: true, text: 'The lander has power again since 20 January.' });
    const never = { powered: Uint8Array.from([1, 1, 0, 0]), firstBrownoutHour: 2 } as unknown as PowerResult;
    expect(landerState(never, '2027-01-01T00:00:00', 3).text).toBe('The lander is off: its battery ran out on 1 January. Power does not come back in this period.');
  });
  it('joins the ground panel’s two sentences, in total darkness too', () => {
    const s = series({ sunEl: [-0.5], sunFraction: [0], earthEl: [-3], earthVisible: [0] });
    expect(liveSentence(s, 0)).toBe('It is night at the site: the Sun is below the horizon, to the north-west. Earth is below the horizon: no radio contact.');
  });

  // From a high point the skyline dips below level, so the Sun and Earth can show while just below the
  // level horizon: whether a body shows comes from the skyline, as in the ground panel's words.
  it('calls a body that shows over a skyline below level "on the horizon", not below it', () => {
    const s = series({ sunEl: [-0.4], sunFraction: [1], earthEl: [-0.3], earthVisible: [1] });
    expect(skyLabel('sun', s, 0)).toBe('Sun, on the horizon');
    expect(skyLabel('earth', s, 0)).toBe('Earth, on the horizon');
  });
  it('agrees with the ground panel for every hour of a test month, bodies seen from just below level included', () => {
    const site = sites.find((x) => x.id === 'de_gerlache_rim_2')!;
    const mask = readJson<{ elevation_deg: number[] }>('data', 'masks', 'de_gerlache_rim_2.json').elevation_deg;
    const s = hourlySeries(site, mask, eph, utcToEt('2027-03-01T00:00:00'), 30 * 24);
    const hours = [...new Array(s.hours).keys()];
    const where = (text: string) => (text.includes('below the horizon') ? 'below' : text.includes('behind the hills') ? 'hidden' : 'seen');
    const differ = hours.filter((h) => {
      const w = groundWords(s, h);
      const sun = w.siteState === 'at night' ? 'below' : w.siteState === 'in shadow' ? 'hidden' : 'seen';
      return where(skyLabel('sun', s, h)) !== sun || where(skyLabel('earth', s, h)) !== where(w.earth);
    });
    expect(differ).toEqual([]);
    expect(hours.some((h) => s.sunFraction[h] > 0 && s.sunEl[h] < 0)).toBe(true);
    expect(hours.some((h) => s.earthVisible[h] === 1 && s.earthEl[h] < 0)).toBe(true);
  });

  // A long period can hold several power cuts: the words date the cut the hour is in, not the first one.
  it('dates the power cut the hour is in, when the period holds more than one', () => {
    const powered = Uint8Array.from([...new Array(48).fill(1), ...new Array(48).fill(0), ...new Array(96).fill(1), ...new Array(48).fill(0), ...new Array(48).fill(1)]);
    const p = { powered, firstBrownoutHour: 48 } as unknown as PowerResult;
    expect(landerState(p, '2027-01-01T00:00:00', 150).text).toBe('The lander has power again since 5 January.');
    expect(landerState(p, '2027-01-01T00:00:00', 200)).toEqual({ on: false, text: 'The lander is off: its battery ran out on 9 January. Power comes back on 11 January.' });
    expect(landerState(p, '2027-01-01T00:00:00', 260).text).toBe('The lander has power again since 11 January.');
  });
});
