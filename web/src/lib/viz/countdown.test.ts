import { describe, expect, it } from 'vitest';
import type { Series } from '../engine/metrics';
import { hero } from './arrival';
import { countdown, countdownForms, countdownWords, earthInView, firstSetAfter, sunHeight, sunHeightWords, sunUp } from './countdown';
import { keyMoments } from './stand';
import { statusSentence } from './status';

/** A series of `sun` disc fractions and `earth` flags, hour by hour, with the Sun 5° up unless `sunEl` says otherwise. */
function series(sun: number[], earth: number[], sunEl?: number[]): Series {
  const n = sun.length;
  return {
    i0: 0,
    hours: n,
    sunAz: new Float64Array(n),
    sunEl: sunEl ? Float64Array.from(sunEl) : new Float64Array(n).fill(5),
    earthAz: new Float64Array(n),
    earthEl: new Float64Array(n).fill(3),
    sunFraction: Float64Array.from(sun),
    earthVisible: Uint8Array.from(earth),
    sunAu: new Float64Array(n).fill(1),
  };
}

describe('sunUp and earthInView', () => {
  it('count the Sun as up while any part of its disc shows, as the time bar and the sunlight figure do', () => {
    const s = series([1, 0.4, 0.001, 0], [0, 0, 0, 0]);
    expect([0, 1, 2, 3].map((h) => sunUp(s, h))).toEqual([true, true, true, false]);
  });

  it('count Earth as in view by the series’ own flag, which the clearance above the hills has already set', () => {
    const s = series([1, 1, 1], [1, 0, 1]);
    expect([0, 1, 2].map((h) => earthInView(s, h))).toEqual([true, false, true]);
  });
});

describe('countdown', () => {
  // Up for three hours, partly up at the fourth, then down for four, up again for two.
  const s = series([1, 1, 1, 0.3, 0, 0, 0, 0, 1, 1], [0, 0, 1, 1, 1, 1, 1, 0, 0, 0]);

  it('gives the hours to the first hour with the Sun set while it is up, a part of its disc still counting as up', () => {
    expect(countdown(s, 'sun', 0)).toEqual({ body: 'sun', up: true, next: 'sets', at: 4, inHours: 4, leftHours: 10 });
    expect(countdown(s, 'sun', 3)).toMatchObject({ up: true, next: 'sets', at: 4, inHours: 1 });
  });

  it('gives the hours to the first hour with any of the Sun back while it is set', () => {
    expect(countdown(s, 'sun', 4)).toEqual({ body: 'sun', up: false, next: 'rises', at: 8, inHours: 4, leftHours: 6 });
    expect(countdown(s, 'sun', 7)).toMatchObject({ next: 'rises', at: 8, inHours: 1 });
  });

  it('does the same for Earth: it sets while in view and rises while not', () => {
    expect(countdown(s, 'earth', 0)).toEqual({ body: 'earth', up: false, next: 'rises', at: 2, inHours: 2, leftHours: 10 });
    expect(countdown(s, 'earth', 2)).toEqual({ body: 'earth', up: true, next: 'sets', at: 7, inHours: 5, leftHours: 8 });
  });

  it('never guesses past the end of the period: a change that has not come by then is null, with the hours that are left', () => {
    expect(countdown(s, 'sun', 8)).toEqual({ body: 'sun', up: true, next: 'sets', at: null, inHours: null, leftHours: 2 });
    expect(countdown(s, 'earth', 9)).toEqual({ body: 'earth', up: false, next: 'rises', at: null, inHours: null, leftHours: 1 });
  });

  it('agrees with the key moments on the hour of each change, at every hour of the home page’s month', () => {
    const h = hero();
    const moments = keyMoments(h.series, h.power, h.startUtc);
    const first = (kind: string) => moments.find((m) => m.kind === kind)?.hour;
    // The first sunset, Earth rising and Earth setting of the month, counted down from the landing.
    expect(countdown(h.series, 'sun', 0).at).toBe(first('sunset') ?? first('sunset-power-off'));
    expect(countdown(h.series, 'earth', 0).at).toBe(first('earth-in'));
    expect(countdown(h.series, 'earth', first('earth-in')!).at).toBe(first('earth-out'));
    // And never disagrees with the time bar's sentence beside it: up when it says so, set when it says so.
    for (let hour = 0; hour < h.series.hours; hour++) {
      const said = statusSentence(h.series, null, hour, 0);
      const sun = countdown(h.series, 'sun', hour);
      const earth = countdown(h.series, 'earth', hour);
      expect(sun.up, said).toBe(/^Sun (?:up|rising|setting|partly)/.test(said));
      expect(earth.up, said).toBe(/Earth in view/.test(said));
      if (sun.at !== null) expect(sunUp(h.series, sun.at)).toBe(!sun.up);
      if (earth.at !== null) expect(earthInView(h.series, earth.at)).toBe(!earth.up);
    }
  });
});

describe('countdownWords', () => {
  const s = series([1, 1, 0, 0, 1], [1, 1, 1, 0, 0]);

  it('names each change one way, as the key moments do, with the hours as the cards write them', () => {
    expect(countdownWords(countdown(s, 'sun', 0))).toBe('Sunset in 2 h');
    expect(countdownWords(countdown(s, 'sun', 2))).toBe('Sunrise in 2 h');
    expect(countdownWords(countdown(s, 'earth', 0))).toBe('Earth sets in 3 h');
    const long = series([...new Array<number>(80).fill(0), 1], new Array<number>(81).fill(0));
    expect(countdownWords(countdown(long, 'sun', 1))).toBe('Sunrise in 3 d 7 h');
  });

  it('says plainly that the change does not come before the end of the period, with no date it cannot know', () => {
    expect(countdownWords(countdown(s, 'sun', 4))).toBe('No sunset before the end');
    expect(countdownWords(countdown(series([0, 0], [0, 0]), 'sun', 0))).toBe('No sunrise before the end');
    expect(countdownWords(countdown(series([1, 1], [1, 1]), 'earth', 0))).toBe('Earth in view to the end');
    expect(countdownWords(countdown(s, 'earth', 3))).toBe('Earth out of view to the end');
    // Away from the time bar, whose track ends where the period does, the end can be named in full.
    expect(countdownWords(countdown(s, 'sun', 4), 'the end of the period')).toBe('No sunset before the end of the period');
    expect(countdownWords(countdown(s, 'earth', 3), 'the end of the period')).toBe('Earth out of view to the end of the period');
  });

  it('keeps the Sun’s words true beside a Sun the status calls setting: a sliver still up is no sunset yet', () => {
    const setting = series([1, 0.6, 0.2], [0, 0, 0]);
    expect(statusSentence(setting, null, 1, 0)).toMatch(/^Sun setting/);
    expect(countdownWords(countdown(setting, 'sun', 1))).toBe('No sunset before the end');
  });
});

describe('countdownForms', () => {
  it('lists every form the words take over the period, each digit a 0, so a slot as wide as the widest never moves', () => {
    // Up, set for 30 hours, then up to the end.
    const s = series([1, ...new Array<number>(30).fill(0), 1, 1], new Array<number>(33).fill(0));
    expect(countdownForms(s, 'sun').sort()).toEqual(['No sunset before the end', 'Sunrise in 0 d 0 h', 'Sunrise in 0 d', 'Sunrise in 0 h', 'Sunrise in 00 h', 'Sunset in 0 h'].sort());
    expect(countdownForms(s, 'earth')).toEqual(['Earth out of view to the end']);
  });

  it('covers the words of every hour of the home page’s month', () => {
    const h = hero();
    for (const body of ['sun', 'earth'] as const) {
      const forms = new Set(countdownForms(h.series, body));
      for (let hour = 0; hour < h.series.hours; hour++) expect(forms.has(countdownWords(countdown(h.series, body, hour)).replace(/\d/g, '0'))).toBe(true);
    }
  });
});

describe('firstSetAfter', () => {
  it('gives the first sunset after the landing hour, after a sunrise when the landing is at night', () => {
    const s = series([0, 0, 1, 1, 0, 1, 0], [1, 1, 1, 1, 1, 0, 0]);
    expect(firstSetAfter(s, 'sun', 0)).toEqual({ at: 4, inHours: 4, leftHours: 7 });
    expect(firstSetAfter(s, 'sun', 4)).toEqual({ at: 6, inHours: 2, leftHours: 3 });
    expect(firstSetAfter(s, 'earth', 1)).toEqual({ at: 5, inHours: 4, leftHours: 6 });
  });

  it('says when no set comes before the period ends, rather than guess', () => {
    const s = series([1, 1, 1], [0, 1, 1]);
    expect(firstSetAfter(s, 'sun', 0)).toEqual({ at: null, inHours: null, leftHours: 3 });
    expect(firstSetAfter(s, 'earth', 0)).toEqual({ at: null, inHours: null, leftHours: 3 });
  });

  it('finds the home page’s first sunset and first Earth setting where the key moments put them', () => {
    const h = hero();
    const moments = keyMoments(h.series, h.power, h.startUtc);
    const sunset = moments.find((m) => m.kind === 'sunset' || m.kind === 'sunset-power-off')!.hour;
    expect(firstSetAfter(h.series, 'sun', 0).at).toBe(sunset);
    expect(firstSetAfter(h.series, 'earth', 0).at).toBe(moments.find((m) => m.kind === 'earth-out')!.hour);
  });
});

describe('sunHeight', () => {
  it('gives the Sun’s elevation above the level horizon at the hour and its highest in the period, with that hour', () => {
    const s = series([1, 1, 0, 0], [0, 0, 0, 0], [1.2, 2.46, -0.3, -1.5]);
    expect(sunHeight(s, 0)).toEqual({ deg: 1.2, maxDeg: 2.46, maxHour: 1 });
    expect(sunHeight(s, 3)).toEqual({ deg: -1.5, maxDeg: 2.46, maxHour: 1 });
  });

  it('writes a height as the view from the site does, a tenth of a degree under 10°, and below the horizon with a minus sign', () => {
    expect(sunHeightWords(2.46)).toBe('2.5°');
    expect(sunHeightWords(0.02)).toBe('0.0°');
    expect(sunHeightWords(-1.54)).toBe('−1.5°');
    expect(sunHeightWords(-0.02)).toBe('0.0°');
    expect(sunHeightWords(71.2)).toBe('71°');
  });
});
