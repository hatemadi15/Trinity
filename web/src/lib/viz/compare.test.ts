import { describe, expect, it } from 'vitest';
import type { SiteResult } from '@/lib/store/explore';
import { bestSentence, compareRow, READY_PAIRS } from './compare';

/** A compared site with only what the table reads. */
function result(id: string, label: string, o: { sun: number; earth: number; nightH: number; brownout: number | null; backAt?: number; hours?: number }): SiteResult {
  const hours = o.hours ?? 720;
  // Powered until the brownout, off until `backAt` (or to the end), then powered again.
  const powered = Uint8Array.from({ length: hours }, (_, h) => (o.brownout === null || h < o.brownout || (o.backAt !== undefined && h >= o.backAt) ? 1 : 0));
  return {
    site: { id, name: `${label} (formal)`, label, lat: -88, lon: 0, category: 'x', polar: true, source: 'x' },
    summary: { hours, illumFraction: o.sun, meanSunFraction: o.sun, longestDarkH: o.nightH, earthVisFraction: o.earth, longestEarthGapH: 0, jointFraction: 0 },
    power: { firstBrownoutHour: o.brownout, powerW: new Float64Array(hours), powered },
  } as unknown as SiteResult;
}

const START = '2027-01-01T00:00:00';

describe('compareRow', () => {
  it('gives the figures a row shows, with their units, and a link to Explore on the same period', () => {
    const row = compareRow(result('a', 'Ridge', { sun: 0.724, earth: 0.538, nightH: 400, brownout: 76, backAt: 466 }), START, 30);
    expect(row).toMatchObject({ id: 'a', name: 'Ridge', sunlight: '72 %', earth: '54 %', longestNight: '16 d 16 h', power: '3 d 4 h, then off until 20 Jan', tone: 'bad' });
    expect(row).not.toHaveProperty('verdict');
    expect(row.href).toBe('/explore?site=a&start=2027-01-01&days=30');
  });

  it('says when the power comes back, or that it does not in the period', () => {
    expect(compareRow(result('n', 'Nobile', { sun: 0.37, earth: 0.23, nightH: 254, brownout: 10 }), START, 30).power).toBe('10 h, then off to the end');
    expect(compareRow(result('d', 'Dusk', { sun: 0.4, earth: 0.3, nightH: 200, brownout: 0, backAt: 300 }), START, 30).power).toBe('none at landing; on from 13 Jan');
  });

  it('says when power lasts the whole period, and when there is no sunlight at all', () => {
    expect(compareRow(result('b', 'Summit', { sun: 1, earth: 0.5, nightH: 0, brownout: null }), START, 30)).toMatchObject({ power: 'all 30 days', tone: 'good', longestNight: 'none' });
    expect(compareRow(result('c', 'Floor', { sun: 0, earth: 0, nightH: 720, brownout: 9 }), START, 30)).toMatchObject({ power: '9 h on the battery; no sunlight', tone: 'bad', sunlight: '0 %' });
  });
});

describe('bestSentence', () => {
  const ridge = result('a', 'Ridge', { sun: 0.72, earth: 0.54, nightH: 400, brownout: 76 });
  const summit = result('b', 'Summit', { sun: 1, earth: 0.49, nightH: 0, brownout: null });
  const floor = result('c', 'Floor', { sun: 0, earth: 0, nightH: 720, brownout: 9 });

  it('names the best site for time with power, sunlight and contact with Earth, for the same landing day, each site once', () => {
    expect(bestSentence([ridge, summit, floor], START, 30)).toBe(
      'Landing on 1 January, Summit has the longest time with power (all 30 days) and the most sunlight (100 %); Ridge has the most contact with Earth (54 %).',
    );
    expect(bestSentence([ridge, floor], START, 30)).toBe(
      'Landing on 1 January, Ridge has the longest time with power (3 d 4 h), the most sunlight (72 %) and the most contact with Earth (54 %).',
    );
  });

  it('names every site that ties', () => {
    const twin = result('d', 'Twin', { sun: 1, earth: 0.49, nightH: 0, brownout: null });
    expect(bestSentence([summit, twin], START, 30)).toBe(
      'Landing on 1 January, Summit and Twin have the longest time with power (all 30 days), the most sunlight (100 %) and the most contact with Earth (49 %).',
    );
  });

  it('does not crown a site where every site scores nothing', () => {
    const dark = result('e', 'Pit', { sun: 0, earth: 0, nightH: 720, brownout: 3 });
    expect(bestSentence([floor, dark], START, 30)).toBe('Landing on 1 January, Floor has the longest time with power (9 h); none of these sites sees the Sun or Earth.');
    const blind = result('f', 'Blind', { sun: 0.5, earth: 0, nightH: 300, brownout: 40 });
    // A lander that lands with an empty battery in the dark has no time with power anywhere.
    const flat = result('g', 'Flat', { sun: 0, earth: 0, nightH: 720, brownout: 0 });
    const pit = result('h', 'Pit', { sun: 0, earth: 0, nightH: 720, brownout: 0 });
    expect(bestSentence([flat, pit], START, 30)).toBe('Landing on 1 January, none of these sites has power at landing or sees the Sun or Earth.');
    const dusk = result('i', 'Dusk', { sun: 0.4, earth: 0.3, nightH: 200, brownout: 0 });
    expect(bestSentence([dusk, flat], START, 30)).toBe('Landing on 1 January, Dusk has the most sunlight (40 %) and the most contact with Earth (30 %); none of these sites has power at landing.');
    expect(bestSentence([blind, floor], START, 30)).toBe('Landing on 1 January, Blind has the longest time with power (1 d 16 h) and the most sunlight (50 %); none of these sites sees Earth.');
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
