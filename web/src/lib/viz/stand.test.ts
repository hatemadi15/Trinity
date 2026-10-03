import { describe, expect, it } from 'vitest';
import { hourlySeries, summarize, type Series } from '@/lib/engine/metrics';
import { DEFAULT_POWER, powerBudget, type PowerConfig, type PowerResult } from '@/lib/engine/power';
import { utcToEt } from '@/lib/engine/time';
import { readJson } from '@/lib/engine/__tests__/helpers';
import { standHref } from '@/lib/links';
import { eph, sites } from '@/test/file-loaders';
import { answerFor } from './answer';
import { groundWords } from './ground';
import { betterLabel, keyMoments, landerState, liveSentence, measuredNote, momentCaption, nightHeadline, poleLine, radioHeadline, radioNext, skyLabel, standHeadline, standingLine, standQuery, statusLine, viewCaption, watchNext, whyLines, type MomentKind } from './stand';

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
    expect(skyLabel('sun', s, 0)).toBe('Sun 2.4° up');
    expect(skyLabel('sun', s, 1)).toBe('Sun, behind the hills');
    expect(skyLabel('sun', s, 2)).toBe('Sun, below the horizon');
    expect(skyLabel('sun', s, 3)).toBe('Sun 1.6° up');
    expect(skyLabel('earth', s, 0)).toBe('Earth 4.2° up');
    expect(skyLabel('earth', s, 1)).toBe('Earth, behind the hills');
    expect(skyLabel('earth', s, 2)).toBe('Earth, below the horizon');
    expect(skyLabel('earth', s, 3)).toBe('Earth 1.2° up');
  });
  // Near a pole the Sun and Earth stay within a few degrees of the horizon, where a whole degree says too little.
  it('gives a height under 10° to a tenth of a degree, and whole degrees from 10°', () => {
    const s = series({ sunEl: [2.4, 2.0, 9.94, 9.96, 12.36], sunFraction: [1, 1, 1, 1, 1], earthEl: [0.6, 0.83, 1.95, 10, 41.5], earthVisible: [1, 1, 1, 1, 1] });
    expect([0, 1, 2, 3, 4].map((h) => skyLabel('sun', s, h))).toEqual(['Sun 2.4° up', 'Sun 2.0° up', 'Sun 9.9° up', 'Sun 10° up', 'Sun 12° up']);
    expect([0, 1, 2, 3, 4].map((h) => skyLabel('earth', s, h))).toEqual(['Earth 0.6° up', 'Earth 0.8° up', 'Earth 2.0° up', 'Earth 10° up', 'Earth 42° up']);
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
    expect(statusLine(s, p, start, 10)).toEqual({ on: true, tone: 'radio', text: 'The lander has power and can radio Earth.' });
  });
  it('says why the lander cannot radio home while Earth is out of view', () => {
    expect(statusLine(s, p, start, 20)).toEqual({ on: true, tone: 'power', text: 'The lander has power, but Earth is below the horizon, so it cannot radio home.' });
    expect(statusLine(s, p, start, 30)).toEqual({ on: true, tone: 'power', text: 'The lander has power, but Earth is behind the hills, so it cannot radio home.' });
  });
  it('says since when the lander has had power again after a power cut', () => {
    expect(statusLine(s, p, start, 500)).toEqual({ on: true, tone: 'radio', text: 'The lander has power again since 20 January, and can radio Earth.' });
    expect(statusLine(s, p, start, 600)).toEqual({ on: true, tone: 'power', text: 'The lander has power again since 20 January, but Earth is below the horizon, so it cannot radio home.' });
  });
  it('does not promise radio contact while the lander is off, even with Earth in view', () => {
    expect(statusLine(s, p, start, 100)).toEqual({ on: false, tone: 'off', text: 'The lander is off: its battery ran out on 4 January. Earth is in view, but the radio has no power.' });
  });
  // The line on what to watch next says when the power comes back; this one says so only when it never does.
  it('stops at the battery running out when the power comes back in the period, and says so when it never does', () => {
    expect(statusLine(s, p, start, 200)).toEqual({ on: false, tone: 'off', text: 'The lander is off: its battery ran out on 4 January.' });
    const never = { powered: Uint8Array.from([1, 1, 0, 0]), firstBrownoutHour: 2 } as unknown as PowerResult;
    expect(statusLine(series({ sunEl: [1, 1, 1, 1] }), never, start, 3)).toEqual({ on: false, tone: 'off', text: 'The lander is off: its battery ran out on 1 January. Power does not come back in this period.' });
    // With Earth in view too, both: the radio has no power, and the power does not come back.
    expect(statusLine(series({ sunEl: [1, 1, 1, 1], earthEl: [4, 4, 4, 4], earthVisible: [1, 1, 1, 1] }), never, start, 3)).toEqual({
      on: false,
      tone: 'off',
      text: 'The lander is off: its battery ran out on 1 January. Earth is in view, but the radio has no power. Power does not come back in this period.',
    });
  });
  it('says the power is being worked out until it is known', () => {
    expect(statusLine(s, null, start, 10)).toEqual({ on: true, tone: 'power', text: 'Working out the lander’s power…' });
  });
  it('agrees with the line on the power alone at every hour', () => {
    const differ = [...new Array(720).keys()].filter((h) => statusLine(s, p, start, h).on !== landerState(p, start, h).on);
    expect(differ).toEqual([]);
  });
  it('gives the dot its tone at every hour: radio only with power and Earth in view, power with power alone, off without power', () => {
    const tone = (h: number) => (powered[h] === 0 ? 'off' : seen(h) ? 'radio' : 'power');
    const differ = [...new Array(720).keys()].filter((h) => statusLine(s, p, start, h).tone !== tone(h));
    expect(differ).toEqual([]);
  });
});

describe('why the view looks as it does', () => {
  const pole = "Near the Moon's south pole the Sun circles the sky once a month, never more than a few degrees above or below the horizon, so a low hill can hide it for days.";
  const earthMoves =
    "Earth hangs almost still in the Moon's sky, because the Moon keeps one face towards it. But the Moon rocks a little as it goes round, and this close to the pole that is enough to lift Earth above the horizon and lower it again over the month.";
  // Why few stars show by day, and that looking up, away from the ground, brings them out.
  const black = 'With no air to scatter sunlight, the sky stays black by day. Eyes dazzled by the sunlit ground, or a camera set for it as on Apollo, see few stars; look up, away from the ground, and they come out.';
  const hidden = 'The Sun is still up, hidden behind the hills: higher ground farther off still catches its light.';
  const justBelow = 'The Sun is just below the horizon here, but higher ground farther off still catches its light.';
  const earthLight = 'At night only Earth lights the ground: sunlight bounced off Earth. The view is brightened, as a long-exposure photo would be, so the ground shows, and that light is why it looks blue.';
  const earthSize = 'Earth looks about 2° wide from here, nearly four times as wide as the full Moon looks from Earth.';
  const south = 'North and south still work here: the pole itself is 52 km to the south.';
  const cold = 'The night here is colder than −170 °C. Most landers are not built to survive it, which is why the forecast says "if".';

  it('near a pole by day: why the Sun stays low, why Earth rises and sets, why the sky is black, and where the pole is', () => {
    const day = series({ sunEl: [2.4], sunFraction: [1], earthEl: [-3], earthVisible: [0] });
    expect(whyLines(-88.28, day, 0)).toEqual([pole, earthMoves, black, south]);
    // Any part of the Sun in view is day, and the north pole has the same lines.
    const sliver = series({ sunEl: [0.2], sunFraction: [0.3] });
    expect(whyLines(85, sliver, 0)).toEqual([poleLine(85), earthMoves, black, 'North and south still work here: the pole itself is 152 km to the north.']);
  });
  it('near a pole at night with Earth in view: only Earth lights the ground, how big Earth looks, where the pole is, and how cold the night is', () => {
    const night = series({ sunEl: [-3], sunFraction: [0], earthEl: [4], earthVisible: [1] });
    expect(whyLines(-88.28, night, 0)).toEqual([pole, earthMoves, earthLight, earthSize, south, cold]);
  });
  it('says how big Earth looks whenever it is in view, by day or by night, after the lines on the light', () => {
    const day = series({ sunEl: [2.4], sunFraction: [1], earthEl: [4], earthVisible: [1] });
    expect(whyLines(-88.28, day, 0)).toEqual([pole, earthMoves, black, earthSize, south]);
    const shade = series({ sunEl: [1.2], sunFraction: [0], earthEl: [4], earthVisible: [1] });
    expect(whyLines(-88.28, shade, 0)).toEqual([pole, earthMoves, hidden, earthLight, earthSize, south, cold]);
    const dusk = series({ sunEl: [-0.5], sunFraction: [0], earthEl: [4], earthVisible: [1] });
    expect(whyLines(-88.28, dusk, 0)).toEqual([pole, earthMoves, justBelow, earthLight, earthSize, south, cold]);
    // Earth above the level horizon but behind the hills is not in view.
    const hiddenEarth = series({ sunEl: [2.4], sunFraction: [1], earthEl: [2], earthVisible: [0] });
    expect(whyLines(-88.28, hiddenEarth, 0)).toEqual([pole, earthMoves, black, south]);
  });
  it('says the Sun is still up when the hills hide it', () => {
    const shade = series({ sunEl: [1.2], sunFraction: [0], earthEl: [-3], earthVisible: [0] });
    expect(whyLines(-88.28, shade, 0)).toEqual([pole, earthMoves, hidden, south, cold]);
  });
  it('says the Sun is just below the horizon when it is, and not once it is two degrees down', () => {
    const dusk = series({ sunEl: [-0.5], sunFraction: [0], earthEl: [-3], earthVisible: [0] });
    expect(whyLines(-88.28, dusk, 0)).toEqual([pole, earthMoves, justBelow, south, cold]);
    expect(whyLines(-88.28, series({ sunEl: [-2], sunFraction: [0] }), 0)).toEqual([pole, earthMoves, south, cold]);
  });
  it('says nothing of the pole, of Earth rising and setting, or of how far the pole is, far from the poles', () => {
    expect(whyLines(-45, series({ sunEl: [30], sunFraction: [1], earthEl: [40], earthVisible: [1] }), 0)).toEqual([black, earthSize]);
    expect(whyLines(-45, series({ sunEl: [-30], sunFraction: [0], earthEl: [40], earthVisible: [1] }), 0)).toEqual([earthLight, earthSize, cold]);
  });
  it('says how far off the pole is, and which way, so that north and south still mean something there', () => {
    // 30.32 km to a degree on the Moon: 1.72° from the pole is 52 km, 5° is 152 km and 10° is 303 km.
    const day = series({ sunEl: [2.4], sunFraction: [1] });
    expect(whyLines(-88.28, day, 0)).toContain(south);
    expect(whyLines(85, day, 0)).toContain('North and south still work here: the pole itself is 152 km to the north.');
    expect(whyLines(-80, day, 0)).toContain('North and south still work here: the pole itself is 303 km to the south.');
    expect(whyLines(-79.9, day, 0).filter((l) => l.startsWith('North and south'))).toEqual([]);
  });
  it('says how cold the night is, and why the forecast says "if", whenever no part of the Sun shows', () => {
    expect(whyLines(-45, series({ sunEl: [-30], sunFraction: [0] }), 0)).toEqual([cold]);
    expect(whyLines(-88.28, series({ sunEl: [1.2], sunFraction: [0] }), 0)).toContain(cold);
    // Any part of the Sun in view is day.
    expect(whyLines(-88.28, series({ sunEl: [0.2], sunFraction: [0.3] }), 0)).not.toContain(cold);
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
  const start = '2027-01-01T00:00:00';

  it('counts the days of night from the power running out to its coming back, so the dates add up', () => {
    // The power runs out at hour 76, 4 January 04:00, and comes back with the Sun at 472, 20 January 16:00:
    // 16.5 days. Rounded up, "17 days of night" after "power for 3 days 4 hours" would bring you to 21
    // January; 16 brings you to 20 January, where the power comes back.
    const { s, p } = night(67, 405, 720, 9);
    expect(nightHeadline('Landing at de Gerlache Rim 2 on 1 January: power for 3 days 4 hours, then night', s, p, start)).toBe(
      'Landing at de Gerlache Rim 2 on 1 January: power for 3 days 4 hours, then 16 days of night',
    );
    // 2 January 16:00 to 4 January 06:00.
    const two = night(30, 48, 192, 10);
    expect(nightHeadline('Landing at Alpha Ridge on 1 January: power for 1 day 16 hours, then night', two.s, two.p, start)).toBe('Landing at Alpha Ridge on 1 January: power for 1 day 16 hours, then 2 days of night');
    // Across the end of a year: 28 December to 13 January.
    expect(nightHeadline('Landing at Alpha Ridge on 25 December: power for 3 days 4 hours, then night', s, p, '2027-12-25T00:00:00')).toBe(
      'Landing at Alpha Ridge on 25 December: power for 3 days 4 hours, then 16 days of night',
    );
    // The line on what to watch next counts the same night the same way.
    expect(watchNext(s, p, start, 100)).toBe('Press Play or a flag below: the Sun comes back on 20 January, and the power with it, if the lander survives 16 days of night colder than −170 °C.');
  });
  it('counts a night of a day or less without power as a day, and says "1 day"', () => {
    // 10 hours without power, overnight: 2 January 16:00 to 3 January 02:00.
    const short = night(30, 20, 96, 10);
    expect(nightHeadline('Landing at Alpha Ridge on 1 January: power for 1 day 16 hours, then night', short.s, short.p, start)).toBe('Landing at Alpha Ridge on 1 January: power for 1 day 16 hours, then 1 day of night');
    // 6 hours, within 2 January: still a day.
    const brief = night(30, 8, 96, 2);
    expect(nightHeadline('Landing at Alpha Ridge on 1 January: power for 1 day 8 hours, then night', brief.s, brief.p, start)).toBe('Landing at Alpha Ridge on 1 January: power for 1 day 8 hours, then 1 day of night');
    // 37 hours: 2 January 16:00 to 4 January 05:00.
    const almost = night(30, 47, 192, 10);
    expect(nightHeadline('Landing at Alpha Ridge on 1 January: power for 1 day 16 hours, then night', almost.s, almost.p, start)).toBe('Landing at Alpha Ridge on 1 January: power for 1 day 16 hours, then 2 days of night');
  });
  it('says so when the night runs to the end of the period', () => {
    const { s, p } = night(20, 172, 192, 10);
    expect(nightHeadline('Landing at Alpha Ridge on 1 January: power for 1 day 6 hours, then night', s, p, start)).toBe('Landing at Alpha Ridge on 1 January: power for 1 day 6 hours, then night to the end of the period');
  });
  it('leaves any other headline as it is', () => {
    const { s, p } = night(67, 405, 720, 9);
    expect(nightHeadline('Landing at Alpha Ridge on 1 January: power for 1 day 7 hours, then too little sunlight', s, p, start)).toBe('Landing at Alpha Ridge on 1 January: power for 1 day 7 hours, then too little sunlight');
    const all = { powered: Uint8Array.from({ length: 720 }, () => 1), firstBrownoutHour: null } as unknown as PowerResult;
    expect(nightHeadline('Landing at Alpha Ridge on 1 January: power for 1 day 7 hours, then night', s, all, start)).toBe('Landing at Alpha Ridge on 1 January: power for 1 day 7 hours, then night');
  });
  it('counts from the power running out when the period starts in the dark too', () => {
    // The night began before the landing, but the count starts where the power runs out, 1 January 10:00,
    // and ends where it comes back, 2 January 06:00.
    const { s, p } = night(0, 30, 96, 10);
    expect(nightHeadline('Landing at Alpha Ridge on 1 January: power for 10 hours, then night', s, p, start)).toBe('Landing at Alpha Ridge on 1 January: power for 10 hours, then 1 day of night');
  });
});

describe('the stand view’s headline', () => {
  // 1361 W while any Sun shows, 100 W load, 1000 Wh battery: ten hours in the dark.
  const CFG: PowerConfig = { ...DEFAULT_POWER, panel: 'full_tracking', areaM2: 1, efficiency: 1, loadW: 100, batteryWh: 1000 };
  const start = '2027-01-01T00:00:00';
  const rep = (v: number, n: number) => new Array<number>(n).fill(v);
  // Explore's verdict for a lander at Alpha Ridge from 1 January, hour by hour, and the headline the view makes of it.
  const headline = (sun: number[], cfg: PowerConfig = CFG, earth: number[] = []) => {
    const s = series({ sunEl: sun.map(() => 5), sunFraction: sun, earthVisible: sun.map((_, h) => earth[h] ?? 0) });
    const p = powerBudget(s, cfg);
    const a = answerFor({ siteName: 'Alpha Ridge', series: s, summary: summarize(s), power: p, startUtc: start, days: sun.length / 24, loadW: cfg.loadW, batteryWh: cfg.batteryWh, best: null });
    return { title: a.title, headline: standHeadline(a.title, 'Alpha Ridge', s, p, start, a.contactHours, a.poweredHours) };
  };

  it('leaves the site’s name to the line above, says the radio straight after the power, and counts the night', () => {
    // Sun for 30 hours, then night: the battery lasts 10 hours into it, 2 January 16:00, and the power
    // comes back with the Sun at 3 January 22:00.
    expect(headline([...rep(1, 30), ...rep(0, 40), ...rep(1, 26)])).toEqual({
      title: 'Landing at Alpha Ridge on 1 January: power for 1 day 16 hours, then night',
      headline: 'Landing on 1 January: power for 1 day 16 hours, no radio contact, then 1 day of night',
    });
    // The night outlasts the period.
    expect(headline([...rep(1, 20), ...rep(0, 28)]).headline).toBe('Landing on 1 January: power for 1 day 6 hours, no radio contact, then night to the end of the period');
    // The period starts in the dark.
    expect(headline([...rep(0, 30), ...rep(1, 18)]).headline).toBe('Landing on 1 January: power for 10 hours, no radio contact, then 1 day of night');
  });
  it('keeps the words of every other title but the site’s name', () => {
    // Power all the while, with Earth in view for a day of the two.
    expect(headline(rep(1, 48), CFG, rep(1, 24))).toEqual({ title: 'Landing at Alpha Ridge on 1 January: power for all 2 days', headline: 'Landing on 1 January: power for all 2 days, radio for 1 day' });
    // A panel of 68 W against a 100 W load runs the battery down in 31 hours, with the Sun up.
    const weak = { ...CFG, areaM2: 0.05 };
    expect(headline(rep(1, 48), weak, rep(1, 25))).toEqual({
      title: 'Landing at Alpha Ridge on 1 January: power for 1 day 7 hours, then too little sunlight',
      headline: 'Landing on 1 January: power for 1 day 7 hours, radio for 1 day 1 hour, then too little sunlight',
    });
    // No power from the first hour: no radio to speak of.
    expect(headline([...rep(0, 30), ...rep(1, 18)], { ...CFG, batteryWh: 0 }).headline).toBe('Landing on 1 January: no power, it is night');
    expect(headline(rep(1, 48), { ...weak, batteryWh: 0 }).headline).toBe('Landing on 1 January: too little sunlight from the first hour');
  });
  it('drops the name from a period without sunlight too, and adds no radio verdict to a title that says nothing of the power', () => {
    // The battery's ten hours all have Earth in view: "radio all the while" would read as the whole period.
    expect(headline(rep(0, 48), CFG, rep(1, 48))).toEqual({ title: 'No sunlight at Alpha Ridge in these 2 days', headline: 'No sunlight in these 2 days' });
  });
  it('drops only the site’s own name', () => {
    const s = series({ sunEl: rep(5, 48), sunFraction: rep(1, 48) });
    const p = powerBudget(s, CFG);
    expect(standHeadline('Landing at Alpha Ridge on 1 January: power for all 2 days', 'Alpha', s, p, start, 0, 48)).toBe('Landing at Alpha Ridge on 1 January: power for all 2 days, no radio contact');
  });
});

describe('the headline’s radio', () => {
  it('says the radio’s verdict straight after the power’s, before what ends the power', () => {
    expect(radioHeadline('Landing on 1 January: power for 3 days 4 hours, then 16 days of night', 0, 76)).toBe('Landing on 1 January: power for 3 days 4 hours, no radio contact, then 16 days of night');
    expect(radioHeadline('Landing at Alpha Ridge on 1 January: power for 1 day 16 hours, then 2 days of night', 12, 40)).toBe(
      'Landing at Alpha Ridge on 1 January: power for 1 day 16 hours, radio for 12 hours, then 2 days of night',
    );
    expect(radioHeadline('Landing at Alpha Ridge on 1 January: power for 1 day 16 hours, then 2 days of night', 40, 40)).toBe(
      'Landing at Alpha Ridge on 1 January: power for 1 day 16 hours, radio all the while, then 2 days of night',
    );
    expect(radioHeadline('Landing at Alpha Ridge on 1 January: power for 1 day 7 hours, then too little sunlight', 25, 31)).toBe(
      'Landing at Alpha Ridge on 1 January: power for 1 day 7 hours, radio for 1 day 1 hour, then too little sunlight',
    );
    expect(radioHeadline('Landing at Alpha Ridge on 1 January: power for 1 day 6 hours, then night to the end of the period', 0, 30)).toBe(
      'Landing at Alpha Ridge on 1 January: power for 1 day 6 hours, no radio contact, then night to the end of the period',
    );
  });
  it('says it at the end when the power lasts the whole period', () => {
    expect(radioHeadline('Landing at Alpha Ridge on 1 January: power for all 30 days', 291, 720)).toBe('Landing at Alpha Ridge on 1 January: power for all 30 days, radio for 12 days 3 hours');
    expect(radioHeadline('Landing at Alpha Ridge on 1 January: power for all 30 days', 0, 720)).toBe('Landing at Alpha Ridge on 1 January: power for all 30 days, no radio contact');
    expect(radioHeadline('Landing at Alpha Ridge on 1 January: power for all 30 days', 720, 720)).toBe('Landing at Alpha Ridge on 1 January: power for all 30 days, radio all the while');
  });
  it('leaves the headline as it is when the lander has no power from the landing', () => {
    expect(radioHeadline('Landing at Alpha Ridge on 1 January: no power, it is night', 0, 0)).toBe('Landing at Alpha Ridge on 1 January: no power, it is night');
    expect(radioHeadline('Landing at Alpha Ridge on 1 January: too little sunlight from the first hour', 0, 0)).toBe('Landing at Alpha Ridge on 1 January: too little sunlight from the first hour');
  });
  it('leaves a headline that says nothing of the power as it is, with no power to follow', () => {
    // The battery alone carries the lander for its first 10 hours, all with Earth in view.
    expect(radioHeadline('No sunlight in these 30 days', 10, 10)).toBe('No sunlight in these 30 days');
    expect(radioHeadline('No sunlight at Alpha Ridge in these 30 days', 0, 10)).toBe('No sunlight at Alpha Ridge in these 30 days');
  });
});

describe('the better landing day’s button', () => {
  it('says what it does, and the power and the radio from that day in whole days, each with its unit', () => {
    // 12 days 15 hours of power, 3 days 3 hours of it with Earth in view.
    expect(betterLabel('20 January', 303, 75)).toBe('Try 20 January instead: power for 13 days, radio for 3 days');
    // To the nearest day: 12 days 11 hours is 12 days, a day and a half is 2.
    expect(betterLabel('20 January', 299, 36)).toBe('Try 20 January instead: power for 12 days, radio for 2 days');
    // A whole period's power, as the page passes it.
    expect(betterLabel('13 January 2028', 720, 720)).toBe('Try 13 January 2028 instead: power for 30 days, radio for 30 days');
    // The page passes the hours with Earth in view as a share of the hours with power: not always whole.
    expect(betterLabel('20 January', 303, 75.6)).toBe('Try 20 January instead: power for 13 days, radio for 3 days');
  });
  it('counts any time at all as at least a day, and says "1 day"', () => {
    expect(betterLabel('2 January', 5, 3)).toBe('Try 2 January instead: power for 1 day, radio for 1 day');
    expect(betterLabel('2 January', 30, 1)).toBe('Try 2 January instead: power for 1 day, radio for 1 day');
  });
  it('says so when Earth is never in view in that time', () => {
    expect(betterLabel('20 January', 303, 0)).toBe('Try 20 January instead: power for 13 days, no radio contact');
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
  // The power comes back at 490, on 21 January, the day after the Sun.
  const late = { powered: Uint8Array.from({ length: hours }, (_, h) => (h < 100 || h >= 490 ? 1 : 0)) } as unknown as PowerResult;
  // Earth is in view for hours 200-499.
  const e = series({
    sunEl: Array.from({ length: hours }, () => 1),
    sunFraction: Array.from({ length: hours }, (_, h) => (lit(h) ? 1 : 0)),
    earthVisible: Array.from({ length: hours }, (_, h) => (h >= 200 && h < 500 ? 1 : 0)),
  });
  const start = '2027-01-01T00:00:00';
  // The key moments are flags on the time bar under the card: the line says they can be pressed.
  it('names the next thing that happens, and its day, and what follows within three days', () => {
    expect(watchNext(s, p, start, 10)).toBe('Press Play or a flag below: the Sun goes behind the hills on 4 January, and the battery runs out on 5 January.');
    expect(watchNext(s, p, start, 80)).toBe('Press Play or a flag below: the battery runs out on 5 January.');
    // No power from 5 January to 20 January: 15 days of night.
    expect(watchNext(s, p, start, 467)).toBe('Press Play or a flag below: the power comes back on 20 January, if the lander survives 15 days of night colder than −170 °C.');
    expect(watchNext(s, null, start, 200)).toBe('Press Play or a flag below: the Sun comes back on 20 January.');
  });
  it('says the day once when the second thing happens the same day', () => {
    // The Sun comes back at 466 and the power at 470, both on 20 January.
    expect(watchNext(s, p, start, 200)).toBe('Press Play or a flag below: the Sun comes back on 20 January, and the power with it, if the lander survives 15 days of night colder than −170 °C.');
    expect(watchNext(s, p, start, 300)).toBe('Press Play or a flag below: the Sun comes back on 20 January, and the power with it, if the lander survives 15 days of night colder than −170 °C.');
    expect(watchNext(s, sameDay, start, 10)).toBe('Press Play or a flag below: the Sun goes behind the hills on 4 January, and the battery runs out the same day.');
  });
  it('counts the Sun back with the first part of its disc, as the time bar draws it, so it comes back before the power', () => {
    // Three hours without power from the landing: at least a day of night.
    const dawn = series({ sunEl: [-0.5, -0.2, 0.1, 0.3], sunFraction: [0, 0, 0.3, 1] });
    const off = { powered: Uint8Array.from([0, 0, 0, 1]) } as unknown as PowerResult;
    expect(watchNext(dawn, off, start, 0)).toBe('Press Play or a flag below: the Sun comes back on 1 January, and the power with it, if the lander survives 1 day of night colder than −170 °C.');
    // In the same hour, the Sun comes first: the power comes back because of it.
    const same = { powered: Uint8Array.from([0, 0, 1, 1]) } as unknown as PowerResult;
    expect(watchNext(dawn, same, start, 0)).toBe('Press Play or a flag below: the Sun comes back on 1 January, and the power with it, if the lander survives 1 day of night colder than −170 °C.');
  });
  it('says the power comes back only if the lander survives so many days of night that cold, and nothing of the kind when it does not come back', () => {
    // The Sun comes back on 20 January and the power on 21 January, 16 days after it ran out: the condition
    // ends the sentence.
    expect(watchNext(s, late, start, 200)).toBe('Press Play or a flag below: the Sun comes back on 20 January, and the power comes back on 21 January, if the lander survives 16 days of night colder than −170 °C.');
    expect(watchNext(s, late, start, 470)).toBe('Press Play or a flag below: the power comes back on 21 January, if the lander survives 16 days of night colder than −170 °C.');
    expect(watchNext(s, late, start, 10)).toBe('Press Play or a flag below: the Sun goes behind the hills on 4 January, and the battery runs out on 5 January.');
  });
  it('says how long the lander is without power, and claims no night, when the battery ran down with the Sun still up', () => {
    // Too little sunlight from hour 20; the battery runs out at 30, on 2 January, and the power comes back
    // with a stronger Sun at 60, on 3 January.
    const weak = series({ sunEl: Array.from({ length: 96 }, () => 1), sunFraction: Array.from({ length: 96 }, (_, h) => (h >= 20 && h < 60 ? 0.05 : 1)) });
    const dim = { powered: Uint8Array.from({ length: 96 }, (_, h) => (h < 30 || h >= 60 ? 1 : 0)) } as unknown as PowerResult;
    expect(watchNext(weak, dim, start, 40)).toBe('Press Play or a flag below: the power comes back on 3 January, if the lander survives 1 day without power.');
  });
  it('keeps the condition with the power when the Sun goes after it, so it does not read as a condition on the Sun', () => {
    // The Sun is up from hour 1 to 4; the power comes back at 3, and the Sun goes behind the hills at 5.
    const brief = series({ sunEl: [1, 1, 1, 1, 1, 1, 1, 1], sunFraction: [0, 1, 1, 1, 1, 0, 0, 0] });
    const back = { powered: Uint8Array.from([0, 0, 0, 1, 1, 1, 0, 0]) } as unknown as PowerResult;
    expect(watchNext(brief, back, start, 1)).toBe('Press Play or a flag below: the power comes back on 1 January, if the lander survives 1 day of night colder than −170 °C, and the Sun goes behind the hills the same day.');
  });

  it('says the Sun sets below the horizon when it goes down, and goes behind the hills while it is still up', () => {
    const night = series({ sunEl: [1, 1, -0.4, -0.4], sunFraction: [1, 1, 0, 0] });
    expect(watchNext(night, null, start, 0)).toBe('Press Play or a flag below: the Sun sets below the horizon on 1 January.');
    // A Sun still above the level horizon has not set: the hills hide it.
    const hills = series({ sunEl: [1, 1, 0.4, 0.4], sunFraction: [1, 1, 0, 0] });
    expect(watchNext(hills, null, start, 0)).toBe('Press Play or a flag below: the Sun goes behind the hills on 1 January.');
  });
  it('says where you stand, near which pole, and what is measured and what is drawn, at the top of a wide screen, on a phone and under More', () => {
    const site = { name: 'de Gerlache Rim 2', lat: -88.28, lon: -64.31, blurb: 'A ridge on a crater rim, 52 km from the pole' };
    expect(standingLine(site, 'de Gerlache Rim 2', 'top')).toBe("Standing at de Gerlache Rim 2, near the Moon's south pole: hills from NASA heights, small craters and rocks drawn.");
    expect(standingLine(site, 'de Gerlache Rim 2', 'phone')).toBe("At de Gerlache Rim 2, near the Moon's south pole.");
    // Under More, the latitude and the site's own note.
    expect(standingLine(site, 'de Gerlache Rim 2', 'more')).toBe('Standing on the Moon at de Gerlache Rim 2, 88.3° S. A ridge on a crater rim, 52 km from the pole. Drawn from NASA data, not a photograph.');
    expect(standingLine({ lat: 85 }, 'Peary Rim', 'top')).toBe("Standing at Peary Rim, near the Moon's north pole: hills from NASA heights, small craters and rocks drawn.");
    expect(standingLine({ lat: 85 }, 'Peary Rim', 'phone')).toBe("At Peary Rim, near the Moon's north pole.");
  });
  it('names the pole from 80° on, and no pole between', () => {
    expect(standingLine({ lat: 80 }, 'Alpha Ridge', 'phone')).toBe("At Alpha Ridge, near the Moon's north pole.");
    expect(standingLine({ lat: -80 }, 'Alpha Ridge', 'phone')).toBe("At Alpha Ridge, near the Moon's south pole.");
    expect(standingLine({ lat: -79.9 }, 'Alpha Ridge', 'phone')).toBe('At Alpha Ridge.');
    expect(standingLine({ lat: -79.9 }, 'Alpha Ridge', 'top')).toBe('Standing at Alpha Ridge: hills from NASA heights, small craters and rocks drawn.');
    const mare = { name: 'Blue Ghost', lat: 18.56, lon: 61.81 };
    expect(standingLine(mare, 'Blue Ghost Mission 1', 'phone')).toBe('At Blue Ghost Mission 1.');
    expect(standingLine(mare, 'Blue Ghost Mission 1', 'more')).toBe('Standing on the Moon at Blue Ghost Mission 1, 18.6° N. Drawn from NASA data, not a photograph.');
  });
  // Blue Ghost's site has no NASA heights: its ground is drawn flat, under a flat horizon.
  it('says the ground is drawn flat where there are no NASA heights, and claims no hills', () => {
    const mare = { name: 'Blue Ghost', lat: 18.56, lon: 61.81 };
    expect(standingLine(mare, 'Blue Ghost Mission 1', 'top', true)).toBe('Standing at Blue Ghost Mission 1: no NASA heights here, so the ground is drawn flat, with small craters and rocks.');
    // The other two say nothing of the ground.
    expect(standingLine(mare, 'Blue Ghost Mission 1', 'phone', true)).toBe('At Blue Ghost Mission 1.');
    expect(standingLine(mare, 'Blue Ghost Mission 1', 'more', true)).toBe(standingLine(mare, 'Blue Ghost Mission 1', 'more'));
  });

  it('says why the Sun stays low near a pole, and nothing elsewhere', () => {
    expect(poleLine(-88.28)).toBe("Near the Moon's south pole the Sun circles the sky once a month, never more than a few degrees above or below the horizon, so a low hill can hide it for days.");
    expect(poleLine(80)).toBe("Near the Moon's north pole the Sun circles the sky once a month, never more than a few degrees above or below the horizon, so a low hill can hide it for days.");
    expect(poleLine(-80)).toBe(poleLine(-88.28));
    expect(poleLine(79.9)).toBeNull();
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

  it('lists the key moments of the period, in order, each once, each with its kind', () => {
    // The Sun leaves the view on 4 January and the battery runs out on 5 January: two moments. The Sun is
    // still 1° up as the hills hide it, so it has not set. The Sun comes back at 466 and the power at 470,
    // both on 20 January: one moment, at the Sun's hour.
    expect(keyMoments(e, p, start)).toEqual([
      { kind: 'sunset', label: 'Sun behind the hills', hour: 76, day: '4 Jan' },
      { kind: 'battery-out', label: 'Battery runs out', hour: 100, day: '5 Jan' },
      { kind: 'earth-in', label: 'Earth in view', hour: 200, day: '9 Jan' },
      { kind: 'sun-power-back', label: 'Sun and power back', hour: 466, day: '20 Jan' },
    ]);
  });

  it('makes one moment of the Sun leaving the view and the battery running out on the same day', () => {
    expect(keyMoments(e, sameDay, start)).toEqual([
      { kind: 'sunset-power-off', label: 'Sun behind the hills, power off', hour: 76, day: '4 Jan' },
      { kind: 'earth-in', label: 'Earth in view', hour: 200, day: '9 Jan' },
      { kind: 'sun-power-back', label: 'Sun and power back', hour: 466, day: '20 Jan' },
    ]);
  });

  it('calls it a sunset only when the Sun goes below the level horizon, and "Sun behind the hills" while it is still up', () => {
    // At the hour the Sun leaves the view: below the level horizon, on it, or above it.
    const at = (el: number, powered: number[]) => keyMoments(series({ sunEl: [1, el], sunFraction: [1, 0] }), { powered: Uint8Array.from(powered) } as unknown as PowerResult, start);
    expect(at(-0.1, [1, 1])).toEqual([{ kind: 'sunset', label: 'Sunset', hour: 1, day: '1 Jan' }]);
    expect(at(0, [1, 1])).toEqual([{ kind: 'sunset', label: 'Sun behind the hills', hour: 1, day: '1 Jan' }]);
    expect(at(0.4, [1, 1])).toEqual([{ kind: 'sunset', label: 'Sun behind the hills', hour: 1, day: '1 Jan' }]);
    // And so when the power goes with it.
    expect(at(-0.1, [1, 0])).toEqual([{ kind: 'sunset-power-off', label: 'Sunset and power off', hour: 1, day: '1 Jan' }]);
    expect(at(0.4, [1, 0])).toEqual([{ kind: 'sunset-power-off', label: 'Sun behind the hills, power off', hour: 1, day: '1 Jan' }]);
  });

  it('keeps the Sun and the power apart on different days, and when the power goes before the Sun', () => {
    // The power comes back at 490, on 21 January, the day after the Sun.
    expect(keyMoments(e, late, start)).toEqual([
      { kind: 'sunset', label: 'Sun behind the hills', hour: 76, day: '4 Jan' },
      { kind: 'battery-out', label: 'Battery runs out', hour: 100, day: '5 Jan' },
      { kind: 'earth-in', label: 'Earth in view', hour: 200, day: '9 Jan' },
      { kind: 'sun-back', label: 'Sun back', hour: 466, day: '20 Jan' },
      { kind: 'power-back', label: 'Power back', hour: 490, day: '21 Jan' },
    ]);
    // Too little sunlight: the battery runs out at 73, three hours before the Sun leaves the view the same
    // day. The Sun going did not cut the power, so the two stay apart.
    const low = { powered: Uint8Array.from({ length: hours }, (_, h) => (h < 73 || h >= 490 ? 1 : 0)) } as unknown as PowerResult;
    expect(keyMoments(e, low, start).slice(0, 2)).toEqual([
      { kind: 'battery-out', label: 'Battery runs out', hour: 73, day: '4 Jan' },
      { kind: 'sunset', label: 'Sun behind the hills', hour: 76, day: '4 Jan' },
    ]);
  });

  it('has a caption for every kind of key moment', () => {
    const moments = [p, sameDay, late].flatMap((pw) => keyMoments(e, pw, start));
    expect(new Set(moments.map((m) => m.kind))).toEqual(new Set(['sunset', 'battery-out', 'earth-in', 'sun-power-back', 'sunset-power-off', 'sun-back', 'power-back']));
    expect(moments.filter((m) => momentCaption(m.kind, e, m.hour) === '')).toEqual([]);
  });

  it('falls back to the light on the ground when nothing more happens in the period', () => {
    expect(watchNext(s, p, start, 600)).toBe('Press Play to watch the light move across the ground.');
  });
});

describe('the caption for a key moment', () => {
  // The Sun sets at hour 1: behind the hills, or below the horizon.
  const behind = series({ sunEl: [1, 0.4], sunFraction: [1, 0] });
  const below = series({ sunEl: [0.2, -0.3], sunFraction: [1, 0] });
  // The Sun is up, with Earth out of view or in view.
  const sun = series({ sunEl: [1], sunFraction: [1], earthEl: [-3], earthVisible: [0] });
  const both = series({ sunEl: [1], sunFraction: [1], earthEl: [4], earthVisible: [1] });

  it('says the Sun has not set when a hill hides it, or that it sinks below the horizon, and that this close to the pole it never climbs high', () => {
    expect(momentCaption('sunset', behind, 1)).toBe('The Sun has not set: it is so low that this hill hides it. This close to the pole it never climbs more than a few degrees.');
    expect(momentCaption('sunset', below, 1)).toBe('The Sun sinks below the horizon. This close to the pole it never climbs more than a few degrees.');
  });
  it('leaves the pole out at a site far from it, when given the site’s latitude', () => {
    expect(momentCaption('sunset', below, 1, 18.56)).toBe('The Sun sinks below the horizon.');
    expect(momentCaption('sunset', behind, 1, 18.56)).toBe('The Sun has not set: it is so low that this hill hides it.');
    expect(momentCaption('sunset', behind, 1, -88.28)).toBe('The Sun has not set: it is so low that this hill hides it. This close to the pole it never climbs more than a few degrees.');
  });
  it('says the lander’s power goes with the Sun, hidden by a hill or below the horizon', () => {
    expect(momentCaption('sunset-power-off', behind, 1)).toBe("The Sun has not set: it is so low that this hill hides it, and the lander's power goes with it.");
    expect(momentCaption('sunset-power-off', below, 1)).toBe("The Sun sinks below the horizon, and the lander's power goes with it.");
  });
  it('says why the battery runs out: the Sun behind the hills or below the horizon, or still up but giving the panel too little sunlight', () => {
    expect(momentCaption('battery-out', series({ sunEl: [1], sunFraction: [0] }), 0)).toBe('The battery runs out: with the Sun behind the hills, the panel makes nothing until it comes back.');
    expect(momentCaption('battery-out', series({ sunEl: [-1], sunFraction: [0] }), 0)).toBe('The battery runs out: with the Sun below the horizon, the panel makes nothing until it comes back.');
    expect(momentCaption('battery-out', series({ sunEl: [1], sunFraction: [0.4] }), 0)).toBe('The battery runs out: the Sun is still up, but the panel gets too little sunlight to keep the lander going.');
  });
  it('says why Earth comes into view', () => {
    expect(momentCaption('earth-in', both, 0)).toBe("Earth rises over the hills. It barely moves in the Moon's sky: the Moon's slight rocking lifts it over the horizon here for about two weeks a month.");
  });
  it('says the Sun is back, and that with Earth in view too a working lander could radio home', () => {
    expect(momentCaption('sun-back', sun, 0)).toBe('The Sun is back over the hills.');
    expect(momentCaption('sun-back', both, 0)).toBe('The Sun is back over the hills. With Earth in view too, a working lander could radio home.');
  });
  it('says the Sun and the power are back, and that with Earth in view the lander can radio home', () => {
    expect(momentCaption('sun-power-back', sun, 0)).toBe('The Sun is back, and the panel powers the lander again.');
    expect(momentCaption('sun-power-back', both, 0)).toBe('The Sun is back, and the panel powers the lander again. Earth is in view, so it can radio home.');
  });
  it('says the panel makes enough power again', () => {
    expect(momentCaption('power-back', sun, 0)).toBe('The panel makes enough power again.');
    expect(momentCaption('power-back', both, 0)).toBe('The panel makes enough power again.');
  });
  // The captions go by the moment's kind, so a label's words can change freely: a label is no kind.
  it('says nothing for anything but a kind, labels included', () => {
    expect(momentCaption('Sunset' as MomentKind, behind, 1)).toBe('');
    expect(momentCaption('Battery runs out' as MomentKind, series({ sunEl: [1], sunFraction: [0] }), 0)).toBe('');
    expect(momentCaption('landing' as MomentKind, both, 0)).toBe('');
  });
});

describe('the line over the view', () => {
  it('says why Earth barely moves, after Face Earth, and near a pole why it still rises and sets', () => {
    const near = "Earth barely moves in the Moon's sky: the Moon keeps one face towards it, and only its slight rocking lifts Earth over the horizon or hides it.";
    const far = "Earth barely moves in the Moon's sky: the Moon keeps one face towards it.";
    expect(viewCaption('earth', -88.28)).toBe(near);
    expect(viewCaption('earth', 85)).toBe(near);
    expect(viewCaption('earth', -80)).toBe(near);
    expect(viewCaption('earth', 79.9)).toBe(far);
    expect(viewCaption('earth', 18.56)).toBe(far);
  });
  it('says why the stars show by day, after Look up, and from a southern site first says which way the view turned', () => {
    // From a southern site Look up turns towards the Southern Cross: the caption says so before it says why.
    expect(viewCaption('up', -88.28)).toBe(
      "Turned towards the Southern Cross and its two pointers, Alpha Centauri and Hadar: the stars seen from Earth's southern half. With no air, the sky stays black and the stars show even with the Sun up.",
    );
    expect(viewCaption('up', 18.56)).toBe('With no air, the sky stays black and the stars show even with the Sun up. These are the same stars seen from Earth.');
    expect(viewCaption('up', 85)).toBe(viewCaption('up', 18.56));
  });
  it('says what lights the ground when night falls with Earth in view', () => {
    expect(viewCaption('earthlight', -88.28)).toBe('Lit only by Earthlight: sunlight bounced off Earth, brightened here as a long-exposure photo would show it.');
    expect(viewCaption('earthlight', 18.56)).toBe(viewCaption('earthlight', -88.28));
  });
  it('says why the lander’s solar panel stands upright, after Face the lander, and far from the poles that it is drawn as built for them', () => {
    const near = 'Its solar panel stands upright because here the Sun never climbs more than a few degrees: a flat panel would catch almost nothing.';
    expect(viewCaption('lander', -88.28)).toBe(near);
    expect(viewCaption('lander', 85)).toBe(near);
    expect(viewCaption('lander', -80)).toBe(near);
    const far = 'The lander is drawn as built for the poles, its solar panel upright for a low Sun.';
    expect(viewCaption('lander', 79.9)).toBe(far);
    expect(viewCaption('lander', 18.56)).toBe(far);
  });
});

describe('the stand view’s words on real data', () => {
  it('reads de Gerlache Rim 2 in January 2027 the way the page shows it', () => {
    const site = sites.find((x) => x.id === 'de_gerlache_rim_2')!;
    const mask = readJson<{ elevation_deg: number[] }>('data', 'masks', 'de_gerlache_rim_2.json').elevation_deg;
    const s = hourlySeries(site, mask, eph, utcToEt('2027-01-01T00:00:00'), 30 * 24);
    const p = powerBudget(s, DEFAULT_POWER);
    const start = '2027-01-01T00:00:00';
    // The battery runs out on 4 January at 04:00 and the power comes back with the Sun on 20 January at
    // 10:00: 16 days of night, so 1 January, 3 days 4 hours and 16 days bring you to 20 January.
    expect(nightHeadline('Landing at de Gerlache Rim 2 on 1 January: power for 3 days 4 hours, then night', s, p, start)).toBe('Landing at de Gerlache Rim 2 on 1 January: power for 3 days 4 hours, then 16 days of night');
    // The headline from the verdict, as the page builds it: Earth stays below the horizon until 10 January, so
    // the three days with power have no radio contact at all. The better landing day plays no part in it.
    // The site's name is in the line above.
    const a = answerFor({ siteName: 'de Gerlache Rim 2', series: s, summary: summarize(s), power: p, startUtc: start, days: 30, loadW: DEFAULT_POWER.loadW, batteryWh: DEFAULT_POWER.batteryWh, best: null });
    expect(standHeadline(a.title, 'de Gerlache Rim 2', s, p, start, a.contactHours, a.poweredHours)).toBe('Landing on 1 January: power for 3 days 4 hours, no radio contact, then 16 days of night');
    expect(standingLine(site, 'de Gerlache Rim 2', 'top')).toBe("Standing at de Gerlache Rim 2, near the Moon's south pole: hills from NASA heights, small craters and rocks drawn.");
    // The battery runs out the day after the Sun leaves the view, so the two stay apart; the power comes back
    // with the Sun. The Sun is still 1.7° up as the hills hide it on 3 January: it has not set.
    const moments = keyMoments(s, p, start);
    expect(moments.map((m) => `${m.label}, ${m.day}`)).toEqual(['Sun behind the hills, 3 Jan', 'Battery runs out, 4 Jan', 'Earth in view, 10 Jan', 'Sun and power back, 20 Jan']);
    expect(moments.map((m) => m.kind)).toEqual(['sunset', 'battery-out', 'earth-in', 'sun-power-back']);
    expect(moments.map((m) => momentCaption(m.kind, s, m.hour, site.lat))).toEqual([
      'The Sun has not set: it is so low that this hill hides it. This close to the pole it never climbs more than a few degrees.',
      'The battery runs out: with the Sun behind the hills, the panel makes nothing until it comes back.',
      "Earth rises over the hills. It barely moves in the Moon's sky: the Moon's slight rocking lifts it over the horizon here for about two weeks a month.",
      'The Sun is back, and the panel powers the lander again. Earth is in view, so it can radio home.',
    ]);
    // The pole is as far off as the site's own note says.
    expect(site.blurb).toContain('52 km from the pole');
    expect(whyLines(site.lat, s, 10)).toContain('North and south still work here: the pole itself is 52 km to the south.');
    expect(watchNext(s, p, start, 10)).toBe('Press Play or a flag below: the Sun goes behind the hills on 3 January, and the battery runs out on 4 January.');
    // No power from 4 January to 20 January, as the headline counts it.
    expect(watchNext(s, p, start, 219)).toBe('Press Play or a flag below: the Sun comes back on 20 January, and the power with it, if the lander survives 16 days of night colder than −170 °C.');
    expect(radioNext(s, p, start)).toBe('The first day the lander has both power and a view of Earth is 20 January.');
    expect(statusLine(s, p, start, 10)).toEqual({ on: true, tone: 'power', text: 'The lander has power, but Earth is below the horizon, so it cannot radio home.' });
    expect(statusLine(s, p, start, 219)).toEqual({ on: false, tone: 'off', text: 'The lander is off: its battery ran out on 4 January. Earth is in view, but the radio has no power.' });
    // Off with Earth out of view: the line on what to watch next says when the power comes back.
    expect(statusLine(s, p, start, 200)).toEqual({ on: false, tone: 'off', text: 'The lander is off: its battery ran out on 4 January.' });
    expect(skyLabel('sun', s, 10)).toBe('Sun 2.4° up');
  });
});
