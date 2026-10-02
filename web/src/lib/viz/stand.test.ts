import { describe, expect, it } from 'vitest';
import { hourlySeries, type Series } from '@/lib/engine/metrics';
import type { PowerResult } from '@/lib/engine/power';
import { utcToEt } from '@/lib/engine/time';
import { readJson } from '@/lib/engine/__tests__/helpers';
import { standHref } from '@/lib/links';
import { eph, sites } from '@/test/file-loaders';
import { groundWords } from './ground';
import { landerState, liveSentence, measuredNote, poleLine, skyLabel, standingLine, standQuery, watchNext } from './stand';

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
    const s = series({ sunEl: [2.4, 1.0, -0.5, 1.6], sunFraction: [1, 0, 0, 1], earthEl: [4.2, 1.2, -3, 1.2], earthVisible: [1, 0, 0, 1] });
    expect(skyLabel('sun', s, 0)).toBe('Sun 2° up');
    expect(skyLabel('sun', s, 1)).toBe('Sun, behind the hills');
    expect(skyLabel('sun', s, 2)).toBe('Sun, below the horizon');
    expect(skyLabel('sun', s, 3)).toBe('Sun 1.6° up');
    expect(skyLabel('earth', s, 0)).toBe('Earth 4° up');
    expect(skyLabel('earth', s, 1)).toBe('Earth, behind the hills');
    expect(skyLabel('earth', s, 2)).toBe('Earth, below the horizon');
    expect(skyLabel('earth', s, 3)).toBe('Earth 1.2° up');
  });
  it('gives the Sun and Earth the same height in the label as in the sentence', () => {
    const s = series({ sunEl: [2.4, 1.62], sunFraction: [1, 1], earthEl: [4.2, 0.83], earthVisible: [1, 1] });
    for (const h of [0, 1]) {
      const w = groundWords(s, h);
      expect(w.sun).toContain(`${skyLabel('sun', s, h).replace(/^Sun | up$/g, '')} above the horizon`);
      expect(w.earth).toContain(`${skyLabel('earth', s, h).replace(/^Earth | up$/g, '')} above the horizon`);
    }
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
  it('does not promise radio contact while the lander has no power', () => {
    const s = series({ sunEl: [-0.5], sunFraction: [0], earthEl: [4.2], earthVisible: [1] });
    expect(liveSentence(s, 0, true)).toBe('It is night at the site: the Sun is below the horizon, to the north-west. Earth is in view, 4° above the horizon to the east: radio contact is possible.');
    expect(liveSentence(s, 0, false)).toBe('It is night at the site: the Sun is below the horizon, to the north-west. Earth is in view, 4° above the horizon to the east, but the lander has no power for its radio.');
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

describe('the note on how we know this', () => {
  const nb = '\u00a0';
  const rest = "The Sun and Earth are placed by NASA's tables of the planets' positions, the stars come from a catalogue of 8,404 stars, and Earth is NASA's Blue Marble photograph. With no air, the sky is black by day as well as by night. Earth stays over the same part of the horizon, rising and sinking a few degrees over the month as the Moon nods. The lander and the small craters underfoot are drawn, not measured.";
  it('says in plain words where the heights, the shadows, the sky and Earth come from, and what is drawn', () => {
    expect(measuredNote([20, 80, 960], 8404)).toBe(
      `Heights measured from orbit by the laser on NASA's Lunar Reconnaissance Orbiter: 20${nb}m steps near you, 80${nb}m out to 20${nb}km and 960${nb}m out to 125${nb}km. The shadows are worked out from those heights for every hour. ${rest}`,
    );
    expect(measuredNote([80, 960], 8404)).toContain(`Orbiter: 80${nb}m steps near you and 960${nb}m out to 125${nb}km.`);
    expect(measuredNote([960, 960], 8404)).toContain(`Orbiter: 960${nb}m steps out to 125${nb}km.`);
  });

  it('says plainly when there is no detailed ground and the ground is drawn flat', () => {
    expect(measuredNote([], 8404)).toBe(`There are no detailed NASA heights for this site, so the ground here is drawn flat. ${rest}`);
  });
});

describe('what to watch for', () => {
  // 30 days from 1 January: the Sun sets at hour 76, the battery runs out at 100, the Sun comes back at 466
  // and the power at 470.
  const hours = 720;
  const lit = (h: number) => h < 76 || h >= 466;
  const s = series({
    sunEl: Array.from({ length: hours }, (_, h) => (h >= 200 && h < 400 ? -0.5 : 0.8)),
    sunFraction: Array.from({ length: hours }, (_, h) => (lit(h) ? 1 : 0)),
  });
  const p = { powered: Uint8Array.from({ length: hours }, (_, h) => (h < 100 || h >= 470 ? 1 : 0)) } as unknown as PowerResult;
  const start = '2027-01-01T00:00:00';
  it('names the next thing that happens, and its day, and what follows within three days', () => {
    expect(watchNext(s, p, start, 10)).toBe('Press Play to watch the Sun set behind the hills on 4 January, then the battery run out on 5 January.');
    expect(watchNext(s, p, start, 80)).toBe('Press Play to watch the battery run out on 5 January.');
    expect(watchNext(s, p, start, 200)).toBe('Press Play to watch the Sun come back on 20 January, then the power come back on 20 January.');
    expect(watchNext(s, p, start, 467)).toBe('Press Play to watch the power come back on 20 January.');
    // The Sun comes back at 466 and the power at 470: one sentence for both.
    expect(watchNext(s, p, start, 300)).toBe('Press Play to watch the Sun come back on 20 January, then the power come back on 20 January.');
  });
  it('counts the Sun back with the first part of its disc, as the time bar draws it, so it comes back before the power', () => {
    const dawn = series({ sunEl: [-0.5, -0.2, 0.1, 0.3], sunFraction: [0, 0, 0.3, 1] });
    const off = { powered: Uint8Array.from([0, 0, 0, 1]) } as unknown as PowerResult;
    expect(watchNext(dawn, off, start, 0)).toBe('Press Play to watch the Sun come back on 1 January, then the power come back on 1 January.');
    // In the same hour, the Sun comes first: the power comes back because of it.
    const same = { powered: Uint8Array.from([0, 0, 1, 1]) } as unknown as PowerResult;
    expect(watchNext(dawn, same, start, 0)).toBe('Press Play to watch the Sun come back on 1 January, then the power come back on 1 January.');
  });

  it('says the Sun sets below the horizon when it goes down rather than behind the hills', () => {
    const night = series({ sunEl: [1, 1, -0.4, -0.4], sunFraction: [1, 1, 0, 0] });
    expect(watchNext(night, null, start, 0)).toBe('Press Play to watch the Sun set below the horizon on 1 January.');
  });
  it('says the Moon, near which pole, and that the view is drawn from NASA data', () => {
    const site = { name: 'de Gerlache Rim 2', lat: -88.28, lon: -64.31, blurb: 'A ridge on a crater rim, 52 km from the pole' };
    expect(standingLine(site, 'de Gerlache Rim 2', false)).toBe('Standing on the Moon at de Gerlache Rim 2, 88.3° S. A ridge on a crater rim, 52 km from the pole. Drawn from NASA data, not a photograph.');
    expect(standingLine(site, 'de Gerlache Rim 2', true)).toBe('Standing on the Moon, near its south pole. Drawn from NASA data.');
    const mare = { name: 'Blue Ghost', lat: 18.56, lon: 61.81 };
    expect(standingLine(mare, 'Blue Ghost Mission 1', false)).toBe('Standing on the Moon at Blue Ghost Mission 1, 18.6° N. Drawn from NASA data, not a photograph.');
    expect(standingLine(mare, 'Blue Ghost Mission 1', true)).toBe('Standing on the Moon. Drawn from NASA data.');
  });

  it('says why the Sun stays low near a pole, and nothing elsewhere', () => {
    expect(poleLine(-88.28)).toBe("Near the Moon's south pole the Sun never climbs high: it circles just above the horizon once a month, so a low hill can hide it for days.");
    expect(poleLine(18.56)).toBeNull();
  });

  it('falls back to the light on the ground when nothing more happens in the period', () => {
    expect(watchNext(s, p, start, 600)).toBe('Press Play to watch the light move across the ground.');
  });
});
