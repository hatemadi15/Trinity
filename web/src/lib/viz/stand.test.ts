import { describe, expect, it } from 'vitest';
import { hourlySeries, type Series } from '@/lib/engine/metrics';
import { DEFAULT_POWER, powerBudget, type PowerResult } from '@/lib/engine/power';
import { utcToEt } from '@/lib/engine/time';
import { readJson } from '@/lib/engine/__tests__/helpers';
import { standHref } from '@/lib/links';
import { eph, sites } from '@/test/file-loaders';
import { groundWords } from './ground';
import { keyMoments, landerState, liveSentence, measuredNote, nightHeadline, poleLine, radioNext, skyLabel, standingLine, standQuery, statusLine, watchNext, whyLines } from './stand';

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

describe('the lander’s power and radio in one sentence', () => {
  // Power until hour 76 (4 January), none until 466 (20 January), then power to the end. Earth is in view
  // for hours 0-14, 90-149 and 480-549; below the horizon for 15-24 and from 550; behind the hills otherwise.
  const powered = Uint8Array.from([...new Array(76).fill(1), ...new Array(390).fill(0), ...new Array(254).fill(1)]);
  const p = { powered, firstBrownoutHour: 76 } as unknown as PowerResult;
  const seen = (h: number) => h < 15 || (h >= 90 && h < 150) || (h >= 480 && h < 550);
  const below = (h: number) => (h >= 15 && h < 25) || h >= 550;
  const s = series({
    sunEl: Array.from({ length: 720 }, () => 1),
    earthEl: Array.from({ length: 720 }, (_, h) => (below(h) ? -3 : 1.5)),
    earthVisible: Array.from({ length: 720 }, (_, h) => (seen(h) ? 1 : 0)),
  });
  const start = '2027-01-01T00:00:00';

  it('says the lander can radio Earth while it has power and Earth is in view', () => {
    expect(statusLine(s, p, start, 10)).toEqual({ on: true, text: 'The lander has power and can radio Earth.' });
  });
  it('says why the lander cannot radio home while Earth is out of view', () => {
    expect(statusLine(s, p, start, 20)).toEqual({ on: true, text: 'The lander has power, but Earth is below the horizon, so it cannot radio home.' });
    expect(statusLine(s, p, start, 30)).toEqual({ on: true, text: 'The lander has power, but Earth is behind the hills, so it cannot radio home.' });
  });
  it('says since when the lander has had power again after a power cut', () => {
    expect(statusLine(s, p, start, 500)).toEqual({ on: true, text: 'The lander has power again since 20 January, and can radio Earth.' });
    expect(statusLine(s, p, start, 600)).toEqual({ on: true, text: 'The lander has power again since 20 January, but Earth is below the horizon, so it cannot radio home.' });
  });
  it('does not promise radio contact while the lander is off, even with Earth in view', () => {
    expect(statusLine(s, p, start, 100)).toEqual({ on: false, text: 'The lander is off: its battery ran out on 4 January. Earth is in view, but the radio has no power.' });
  });
  it('says when the power comes back while the lander is off and Earth is out of view, or that it never does', () => {
    expect(statusLine(s, p, start, 200)).toEqual({ on: false, text: 'The lander is off: its battery ran out on 4 January. Power comes back on 20 January.' });
    const never = { powered: Uint8Array.from([1, 1, 0, 0]), firstBrownoutHour: 2 } as unknown as PowerResult;
    expect(statusLine(series({ sunEl: [1, 1, 1, 1] }), never, start, 3)).toEqual({ on: false, text: 'The lander is off: its battery ran out on 1 January. Power does not come back in this period.' });
  });
  it('says the power is being worked out until it is known', () => {
    expect(statusLine(s, null, start, 10)).toEqual({ on: true, text: 'Working out the lander’s power…' });
  });
  it('agrees with the line on the power alone at every hour', () => {
    const differ = [...new Array(720).keys()].filter((h) => statusLine(s, p, start, h).on !== landerState(p, start, h).on);
    expect(differ).toEqual([]);
  });
});

describe('why the view looks as it does', () => {
  const pole = "Near the Moon's south pole the Sun never climbs high: it circles just above the horizon once a month, so a low hill can hide it for days.";
  const earthMoves =
    "Earth hangs almost still in the Moon's sky, because the Moon keeps one face towards it. But the Moon rocks a little as it goes round, and this close to the pole that is enough to lift Earth above the horizon and lower it again over the month.";
  const black = 'With no air to scatter sunlight, the sky stays black by day, and the stars shine beside the Sun.';
  const hidden = 'The Sun is still up, hidden behind the hills: higher ground farther off still catches its light.';
  const justBelow = 'The Sun is just below the horizon here, but higher ground farther off still catches its light.';
  const earthLight = 'At night only Earth lights the ground, which is why it looks blue.';

  it('near a pole by day: why the Sun stays low, why Earth rises and sets, and why the sky is black', () => {
    const day = series({ sunEl: [2.4], sunFraction: [1], earthEl: [-3], earthVisible: [0] });
    expect(whyLines(-88.28, day, 0)).toEqual([pole, earthMoves, black]);
    // Any part of the Sun in view is day, and the north pole has the same lines.
    const sliver = series({ sunEl: [0.2], sunFraction: [0.3] });
    expect(whyLines(85, sliver, 0)).toEqual([poleLine(85), earthMoves, black]);
  });
  it('near a pole at night with Earth in view: only Earth lights the ground', () => {
    const night = series({ sunEl: [-3], sunFraction: [0], earthEl: [4], earthVisible: [1] });
    expect(whyLines(-88.28, night, 0)).toEqual([pole, earthMoves, earthLight]);
  });
  it('says the Sun is still up when the hills hide it', () => {
    const shade = series({ sunEl: [1.2], sunFraction: [0], earthEl: [-3], earthVisible: [0] });
    expect(whyLines(-88.28, shade, 0)).toEqual([pole, earthMoves, hidden]);
  });
  it('says the Sun is just below the horizon when it is, and not once it is two degrees down', () => {
    const dusk = series({ sunEl: [-0.5], sunFraction: [0], earthEl: [-3], earthVisible: [0] });
    expect(whyLines(-88.28, dusk, 0)).toEqual([pole, earthMoves, justBelow]);
    expect(whyLines(-88.28, series({ sunEl: [-2], sunFraction: [0] }), 0)).toEqual([pole, earthMoves]);
  });
  it('says nothing of the pole, or of Earth rising and setting, far from the poles', () => {
    expect(whyLines(-45, series({ sunEl: [30], sunFraction: [1], earthEl: [40], earthVisible: [1] }), 0)).toEqual([black]);
    expect(whyLines(-45, series({ sunEl: [-30], sunFraction: [0], earthEl: [40], earthVisible: [1] }), 0)).toEqual([earthLight]);
  });
});

describe('the headline’s night', () => {
  // Sun for `day` hours, then `dark` hours of night, then Sun again to the end of `hours`; the battery lasts
  // `battery` hours into the night, and the power comes back with the Sun.
  const night = (day: number, dark: number, hours: number, battery: number) => {
    const sunrise = day + dark;
    const s = series({ sunEl: Array.from({ length: hours }, () => 1), sunFraction: Array.from({ length: hours }, (_, h) => (h < day || h >= sunrise ? 1 : 0)) });
    const first = day + battery;
    const p = { powered: Uint8Array.from({ length: hours }, (_, h) => (h < first || h >= sunrise ? 1 : 0)), firstBrownoutHour: first } as unknown as PowerResult;
    return { s, p };
  };

  it('says how many days of night follow, to the nearest day', () => {
    // 405 hours is 16.9 days.
    const { s, p } = night(67, 405, 720, 9);
    expect(nightHeadline('Landing at de Gerlache Rim 2 on 1 January: power for 3 days 4 hours, then night', s, p)).toBe(
      'Landing at de Gerlache Rim 2 on 1 January: power for 3 days 4 hours, then 17 days of night',
    );
    const two = night(30, 48, 192, 10);
    expect(nightHeadline('Landing at Alpha Ridge on 1 January: power for 1 day 16 hours, then night', two.s, two.p)).toBe('Landing at Alpha Ridge on 1 January: power for 1 day 16 hours, then 2 days of night');
  });
  it('says a night shorter than two days in days and hours', () => {
    const short = night(30, 20, 96, 10);
    expect(nightHeadline('Landing at Alpha Ridge on 1 January: power for 1 day 16 hours, then night', short.s, short.p)).toBe('Landing at Alpha Ridge on 1 January: power for 1 day 16 hours, then a night of 20 hours');
    const almost = night(30, 47, 192, 10);
    expect(nightHeadline('Landing at Alpha Ridge on 1 January: power for 1 day 16 hours, then night', almost.s, almost.p)).toBe(
      'Landing at Alpha Ridge on 1 January: power for 1 day 16 hours, then a night of 1 day 23 hours',
    );
  });
  it('says so when the night runs to the end of the period', () => {
    const { s, p } = night(20, 172, 192, 10);
    expect(nightHeadline('Landing at Alpha Ridge on 1 January: power for 1 day 6 hours, then night', s, p)).toBe('Landing at Alpha Ridge on 1 January: power for 1 day 6 hours, then night to the end of the period');
  });
  it('leaves any other headline as it is', () => {
    const { s, p } = night(67, 405, 720, 9);
    expect(nightHeadline('Landing at Alpha Ridge on 1 January: power for 1 day 7 hours, then too little sunlight', s, p)).toBe('Landing at Alpha Ridge on 1 January: power for 1 day 7 hours, then too little sunlight');
    const all = { powered: Uint8Array.from({ length: 720 }, () => 1), firstBrownoutHour: null } as unknown as PowerResult;
    expect(nightHeadline('Landing at Alpha Ridge on 1 January: power for 1 day 7 hours, then night', s, all)).toBe('Landing at Alpha Ridge on 1 January: power for 1 day 7 hours, then night');
  });
  it('does not guess the length of a night that began before the period', () => {
    // The period starts in the dark: the night's start, and so its length, is not known.
    const { s, p } = night(0, 30, 96, 10);
    expect(nightHeadline('Landing at Alpha Ridge on 1 January: power for 10 hours, then night', s, p)).toBe('Landing at Alpha Ridge on 1 January: power for 10 hours, then night');
  });
});

describe('the note on how we know this', () => {
  const nb = '\u00a0';
  const rest = "The Sun and Earth are placed by NASA's tables of the planets' positions, the stars come from a catalogue of 8,404 stars, and Earth is NASA's Blue Marble photograph at its true size (Face Earth zooms in on it). Times are Earth's clock (UTC): a day on the Moon lasts about a month. The forecast counts energy only: whether the lander survives the cold of the night is not worked out. The lander, its solar panel standing upright to catch the low Sun, and the small craters underfoot are drawn, not measured.";
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

  it('leaves the black sky, the blue night and Earth rising and setting to the lines on why the view looks as it does', () => {
    for (const note of [measuredNote([20, 80, 960], 8404), measuredNote([], 8404)]) {
      expect(note).not.toContain('With no air, the sky is black by day as well as by night; at night only Earth lights the ground, which is why it looks blue.');
      expect(note).not.toContain('Earth stays over the same part of the horizon, rising and sinking a few degrees over the month as the Moon nods.');
    }
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
  // The battery runs out at 80, four hours after the Sun sets: both on 4 January.
  const sameDay = { powered: Uint8Array.from({ length: hours }, (_, h) => (h < 80 || h >= 470 ? 1 : 0)) } as unknown as PowerResult;
  // Earth is in view for hours 200-499.
  const e = series({
    sunEl: Array.from({ length: hours }, () => 1),
    sunFraction: Array.from({ length: hours }, (_, h) => (lit(h) ? 1 : 0)),
    earthVisible: Array.from({ length: hours }, (_, h) => (h >= 200 && h < 500 ? 1 : 0)),
  });
  const start = '2027-01-01T00:00:00';
  it('names the next thing that happens, and its day, and what follows within three days', () => {
    expect(watchNext(s, p, start, 10)).toBe('Press Play: the Sun sets behind the hills on 4 January, and the battery runs out on 5 January.');
    expect(watchNext(s, p, start, 80)).toBe('Press Play: the battery runs out on 5 January.');
    expect(watchNext(s, p, start, 467)).toBe('Press Play: the power comes back on 20 January.');
    expect(watchNext(s, null, start, 200)).toBe('Press Play: the Sun comes back on 20 January.');
  });
  it('says the day once when the second thing happens the same day', () => {
    // The Sun comes back at 466 and the power at 470, both on 20 January.
    expect(watchNext(s, p, start, 200)).toBe('Press Play: the Sun comes back on 20 January, and the power with it.');
    expect(watchNext(s, p, start, 300)).toBe('Press Play: the Sun comes back on 20 January, and the power with it.');
    expect(watchNext(s, sameDay, start, 10)).toBe('Press Play: the Sun sets behind the hills on 4 January, and the battery runs out the same day.');
  });
  it('counts the Sun back with the first part of its disc, as the time bar draws it, so it comes back before the power', () => {
    const dawn = series({ sunEl: [-0.5, -0.2, 0.1, 0.3], sunFraction: [0, 0, 0.3, 1] });
    const off = { powered: Uint8Array.from([0, 0, 0, 1]) } as unknown as PowerResult;
    expect(watchNext(dawn, off, start, 0)).toBe('Press Play: the Sun comes back on 1 January, and the power with it.');
    // In the same hour, the Sun comes first: the power comes back because of it.
    const same = { powered: Uint8Array.from([0, 0, 1, 1]) } as unknown as PowerResult;
    expect(watchNext(dawn, same, start, 0)).toBe('Press Play: the Sun comes back on 1 January, and the power with it.');
  });

  it('says the Sun sets below the horizon when it goes down rather than behind the hills', () => {
    const night = series({ sunEl: [1, 1, -0.4, -0.4], sunFraction: [1, 1, 0, 0] });
    expect(watchNext(night, null, start, 0)).toBe('Press Play: the Sun sets below the horizon on 1 January.');
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

  it('says the first day the lander has both power and a view of Earth, when it does not from the landing', () => {
    // Earth is in view for hours 200-499; the power is on before 100 and from 470.
    expect(radioNext(e, p, start)).toBe('The first day the lander has both power and a view of Earth is 20 January.');
    const always = series({ sunEl: [1, 1], sunFraction: [1, 1], earthVisible: [1, 1] });
    expect(radioNext(always, { powered: Uint8Array.from([1, 1]) } as unknown as PowerResult, start)).toBeNull();
    const never = series({ sunEl: [1, 1], sunFraction: [1, 1], earthVisible: [0, 0] });
    expect(radioNext(never, { powered: Uint8Array.from([1, 1]) } as unknown as PowerResult, start)).toBe('The lander never has both power and a view of Earth in this period.');
  });

  it('lists the key moments of the period, in order, each once', () => {
    // The Sun sets on 4 January and the battery runs out on 5 January: two moments. The Sun comes back at
    // 466 and the power at 470, both on 20 January: one moment, at the Sun's hour.
    expect(keyMoments(e, p, start)).toEqual([
      { label: 'Sunset', hour: 76, day: '4 Jan' },
      { label: 'Battery runs out', hour: 100, day: '5 Jan' },
      { label: 'Earth in view', hour: 200, day: '9 Jan' },
      { label: 'Sun and power back', hour: 466, day: '20 Jan' },
    ]);
  });

  it('makes one moment of the Sun setting and the battery running out on the same day', () => {
    expect(keyMoments(e, sameDay, start)).toEqual([
      { label: 'Sunset and power off', hour: 76, day: '4 Jan' },
      { label: 'Earth in view', hour: 200, day: '9 Jan' },
      { label: 'Sun and power back', hour: 466, day: '20 Jan' },
    ]);
  });

  it('keeps the Sun and the power apart on different days, and when the power goes before the Sun', () => {
    // The power comes back at 490, on 21 January, the day after the Sun.
    const late = { powered: Uint8Array.from({ length: hours }, (_, h) => (h < 100 || h >= 490 ? 1 : 0)) } as unknown as PowerResult;
    expect(keyMoments(e, late, start)).toEqual([
      { label: 'Sunset', hour: 76, day: '4 Jan' },
      { label: 'Battery runs out', hour: 100, day: '5 Jan' },
      { label: 'Earth in view', hour: 200, day: '9 Jan' },
      { label: 'Sun back', hour: 466, day: '20 Jan' },
      { label: 'Power back', hour: 490, day: '21 Jan' },
    ]);
    // Too little sunlight: the battery runs out at 73, three hours before the Sun sets the same day. The
    // sunset did not cut the power, so the two stay apart.
    const low = { powered: Uint8Array.from({ length: hours }, (_, h) => (h < 73 || h >= 490 ? 1 : 0)) } as unknown as PowerResult;
    expect(keyMoments(e, low, start).slice(0, 2)).toEqual([
      { label: 'Battery runs out', hour: 73, day: '4 Jan' },
      { label: 'Sunset', hour: 76, day: '4 Jan' },
    ]);
  });

  it('falls back to the light on the ground when nothing more happens in the period', () => {
    expect(watchNext(s, p, start, 600)).toBe('Press Play to watch the light move across the ground.');
  });
});

describe('the stand view’s words on real data', () => {
  it('reads de Gerlache Rim 2 in January 2027 the way the page shows it', () => {
    const site = sites.find((x) => x.id === 'de_gerlache_rim_2')!;
    const mask = readJson<{ elevation_deg: number[] }>('data', 'masks', 'de_gerlache_rim_2.json').elevation_deg;
    const s = hourlySeries(site, mask, eph, utcToEt('2027-01-01T00:00:00'), 30 * 24);
    const p = powerBudget(s, DEFAULT_POWER);
    const start = '2027-01-01T00:00:00';
    // The Sun sets on 3 January and stays behind the hills for 16 days 15 hours.
    expect(nightHeadline('Landing at de Gerlache Rim 2 on 1 January: power for 3 days 4 hours, then night', s, p)).toBe('Landing at de Gerlache Rim 2 on 1 January: power for 3 days 4 hours, then 17 days of night');
    // The battery runs out the day after the sunset, so the two stay apart; the power comes back with the Sun.
    expect(keyMoments(s, p, start).map((m) => `${m.label}, ${m.day}`)).toEqual(['Sunset, 3 Jan', 'Battery runs out, 4 Jan', 'Earth in view, 10 Jan', 'Sun and power back, 20 Jan']);
    expect(watchNext(s, p, start, 10)).toBe('Press Play: the Sun sets behind the hills on 3 January, and the battery runs out on 4 January.');
    expect(radioNext(s, p, start)).toBe('The first day the lander has both power and a view of Earth is 20 January.');
    expect(statusLine(s, p, start, 10)).toEqual({ on: true, text: 'The lander has power, but Earth is below the horizon, so it cannot radio home.' });
    expect(statusLine(s, p, start, 219)).toEqual({ on: false, text: 'The lander is off: its battery ran out on 4 January. Earth is in view, but the radio has no power.' });
  });
});
