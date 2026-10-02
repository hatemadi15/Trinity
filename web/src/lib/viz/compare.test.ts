import { describe, expect, it } from 'vitest';
import type { SiteResult } from '@/lib/store/explore';
import { bestSentence, compareRow, READY_PAIRS } from './compare';

/** A compared site with only what the table reads. */
function result(id: string, label: string, o: { sun: number; earth: number; nightH: number; brownout: number | null; hours?: number }): SiteResult {
  const hours = o.hours ?? 720;
  return {
    site: { id, name: `${label} (formal)`, label, lat: -88, lon: 0, category: 'x', polar: true, source: 'x' },
    summary: { hours, illumFraction: o.sun, meanSunFraction: o.sun, longestDarkH: o.nightH, earthVisFraction: o.earth, longestEarthGapH: 0, jointFraction: 0 },
    power: { firstBrownoutHour: o.brownout, powerW: new Float64Array(hours) },
  } as unknown as SiteResult;
}

const START = '2027-01-01T00:00:00';

describe('compareRow', () => {
  it('gives the figures a row shows, with their units, and a link to Explore on the same period', () => {
    const row = compareRow(result('a', 'Ridge', { sun: 0.724, earth: 0.538, nightH: 400, brownout: 76 }), START, 30);
    expect(row).toMatchObject({ id: 'a', name: 'Ridge', sunlight: '72 %', earth: '54 %', longestNight: '16 d 16 h', power: '3 d 4 h', verdict: 'Power for 3 d 4 h, then night', tone: 'bad' });
    expect(row.href).toBe('/explore?site=a&start=2027-01-01&days=30');
  });

  it('says when power lasts the whole period, and when there is no sunlight at all', () => {
    expect(compareRow(result('b', 'Summit', { sun: 1, earth: 0.5, nightH: 0, brownout: null }), START, 30)).toMatchObject({ power: 'all 30 days', verdict: 'Power for all 30 days', tone: 'good', longestNight: 'none' });
    expect(compareRow(result('c', 'Floor', { sun: 0, earth: 0, nightH: 720, brownout: 9 }), START, 30)).toMatchObject({ verdict: 'No sunlight', tone: 'bad', sunlight: '0 %' });
  });
});

describe('bestSentence', () => {
  const ridge = result('a', 'Ridge', { sun: 0.72, earth: 0.54, nightH: 400, brownout: 76 });
  const summit = result('b', 'Summit', { sun: 1, earth: 0.49, nightH: 0, brownout: null });
  const floor = result('c', 'Floor', { sun: 0, earth: 0, nightH: 720, brownout: 9 });

  it('names the best site for time with power, sunlight and contact with Earth, for the same landing day', () => {
    expect(bestSentence([ridge, summit, floor], START, 30)).toBe(
      'Landing on 1 January, the longest time with power is at Summit (all 30 days), the most sunlight at Summit (100 %) and the most contact with Earth at Ridge (54 %).',
    );
  });

  it('names every site that ties', () => {
    const twin = result('d', 'Twin', { sun: 1, earth: 0.49, nightH: 0, brownout: null });
    expect(bestSentence([summit, twin], START, 30)).toBe(
      'Landing on 1 January, the longest time with power is at Summit and Twin (all 30 days), the most sunlight at Summit and Twin (100 %) and the most contact with Earth at Summit and Twin (49 %).',
    );
  });

  it('does not crown a site where every site scores nothing', () => {
    const dark = result('e', 'Pit', { sun: 0, earth: 0, nightH: 720, brownout: 3 });
    expect(bestSentence([floor, dark], START, 30)).toBe('Landing on 1 January, the longest time with power is at Floor (9 h); none of these sites sees the Sun or Earth.');
    expect(bestSentence([ridge, floor], START, 30)).toMatch(/the most contact with Earth at Ridge/);
    const blind = result('f', 'Blind', { sun: 0.5, earth: 0, nightH: 300, brownout: 40 });
    expect(bestSentence([blind, floor], START, 30)).toBe('Landing on 1 January, the longest time with power is at Blind (1 d 16 h) and the most sunlight at Blind (50 %); none of these sites sees Earth.');
  });

  it('asks for a second site when there is one', () => {
    expect(bestSentence([ridge], START, 30)).toBe('Add another site to compare it with Ridge.');
    expect(bestSentence([], START, 30)).toBe('');
  });
});

describe('READY_PAIRS', () => {
  it('offers two pairs of catalogue sites, each with a plain title', () => {
    expect(READY_PAIRS).toHaveLength(2);
    expect(READY_PAIRS[0]).toEqual({ title: 'A ridge and the summit 12 km away', ids: ['de_gerlache_rim_2', 'de_gerlache_center_rim_high'] });
    expect(READY_PAIRS[1]).toEqual({ title: 'A rim in sunlight and a floor in shadow', ids: ['shackleton_center_rim_high', 'shackleton_center'] });
  });
});
