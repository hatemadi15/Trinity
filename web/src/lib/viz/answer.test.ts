import { describe, expect, it } from 'vitest';
import { loadEphemeris, type EphemerisHeader } from '../engine/ephemeris';
import { bestLanding } from '../engine/landing';
import { hourlySeries, summarize, type Series } from '../engine/metrics';
import { DEFAULT_POWER, powerBudget, type PowerConfig } from '../engine/power';
import { utcToEt } from '../engine/time';
import { readBytes, readJson } from '../engine/__tests__/helpers';
import { answerFor, nearbyAdvice, nearbyWords } from './answer';

// 1361 W while any Sun shows, 100 W load, 1000 Wh battery: ten hours in the dark.
const CFG: PowerConfig = { ...DEFAULT_POWER, panel: 'full_tracking', areaM2: 1, efficiency: 1, loadW: 100, batteryWh: 1000 };
const START = '2027-01-01T00:00:00';
const rep = (v: number, n: number) => new Array<number>(n).fill(v);

function series(sun: number[], earth: number[] = []): Series {
  const n = sun.length;
  return {
    i0: 0,
    hours: n,
    sunAz: new Float64Array(n),
    sunEl: new Float64Array(n).fill(5),
    earthAz: new Float64Array(n),
    earthEl: new Float64Array(n),
    sunFraction: Float64Array.from(sun),
    earthVisible: Uint8Array.from({ length: n }, (_, h) => earth[h] ?? 0),
    sunAu: new Float64Array(n).fill(1),
  };
}

/** The answer for the first `days` days of a longer series, the way the store asks for it. */
function answer(sun: number[], days: number, cfg: PowerConfig = CFG, earth: number[] = []) {
  const scan = series(sun, earth);
  const hours = days * 24;
  const period = series(sun.slice(0, hours), earth.slice(0, hours));
  return answerFor({
    siteName: 'Alpha Ridge',
    series: period,
    summary: summarize(period),
    power: powerBudget(period, cfg),
    startUtc: START,
    days,
    loadW: cfg.loadW,
    batteryWh: cfg.batteryWh,
    best: bestLanding(scan, cfg, { from: 0, to: hours, step: 1, capHours: hours }),
  });
}

describe('answerFor', () => {
  it('says the lander keeps power when the Sun never sets', () => {
    const a = answer(rep(1, 96), 2);
    expect(a).toMatchObject({ tone: 'good', kind: 'all', title: 'Landing at Alpha Ridge on 1 January: power for all 2 days', better: null, hint: null });
    // Contact with Earth comes first: the lander is no use if it cannot send home what it sees.
    expect(a.sentences).toEqual(['No radio contact: Earth is out of view for all 2 days.', 'The Sun never sets in these 2 days.']);
  });

  it('names the longest night when the battery covers it', () => {
    const a = answer([...rep(1, 20), ...rep(0, 8), ...rep(1, 68)], 2);
    expect(a.title).toBe('Landing at Alpha Ridge on 1 January: power for all 2 days');
    expect(a.sentences).toEqual(['No radio contact: Earth is out of view for all 2 days.', 'The Sun is up 83 % of the time. The longest night lasts 8 hours, and the battery covers it.']);
  });

  it('says how long the power lasts, when the Sun sets, what the battery covers and when power comes back', () => {
    // Sun for 30 h, night for 40 h, Sun again: the battery carries 10 h of the night.
    const a = answer([...rep(1, 30), ...rep(0, 40), ...rep(1, 122)], 4);
    expect(a).toMatchObject({ tone: 'bad', kind: 'night', title: 'Landing at Alpha Ridge on 1 January: power for 1 day 16 hours, then night' });
    expect(a.sentences).toEqual([
      'No radio contact: Earth is out of view for all 1 day 16 hours with power.',
      'The Sun sets behind the hills on 2 January, and the night lasts 1 day 16 hours.',
      'The battery covers the first 10 hours of the night; power comes back on 3 January, if the lander starts again after the cold.',
    ]);
    expect(a.better).toEqual({
      hour: 70,
      startUtc: '2027-01-03T22:00:00',
      label: 'Land on 3 January instead',
      note: 'From 3 January, 22:00 UTC, the lander keeps power for all 4 days.',
    });
    expect(a.hint).toBeNull();
  });

  it('says why the battery covers less of the night than a full one would', () => {
    // A thin last sliver of Sun gives 68 W against the 100 W load: the battery is down 32 Wh when the night starts.
    const a = answer([...rep(1, 30), 0.05, ...rep(0, 40), ...rep(1, 121)], 4);
    expect(a.sentences).toEqual([
      'No radio contact: Earth is out of view for all 1 day 16 hours with power.',
      'The Sun sets behind the hills on 2 January, and the night lasts 1 day 16 hours.',
      'As the Sun set, the panel already gave less than the lander uses, so the battery covers only the first 9 hours of the night; power comes back on 3 January, if the lander starts again after the cold.',
    ]);
  });

  it('names a landing that is not at midnight by its day only', () => {
    const scan = series([...rep(1, 30), ...rep(0, 40), ...rep(1, 122)]);
    const period = series([...rep(1, 30), ...rep(0, 40), ...rep(1, 26)]);
    const a = answerFor({ siteName: 'Alpha Ridge', series: period, summary: summarize(period), power: powerBudget(period, CFG), startUtc: '2027-01-20T10:00:00', days: 4, loadW: 100, batteryWh: 1000, best: bestLanding(scan, CFG, { from: 0, to: 96, step: 1, capHours: 96 }) });
    expect(a.title).toBe('Landing at Alpha Ridge on 20 January: power for 1 day 16 hours, then night');
  });

  it('says when there is no power from the first hour', () => {
    const a = answer([...rep(0, 30), ...rep(1, 66)], 2, { ...CFG, batteryWh: 0 });
    expect(a.title).toBe('Landing at Alpha Ridge on 1 January: no power, it is night');
  });

  it('hands the page the hours with power and the hours of contact in them', () => {
    const a = answer([...rep(1, 30), ...rep(0, 40), ...rep(1, 122)], 4, CFG, rep(1, 12));
    expect(a.poweredHours).toBe(40);
    expect(a.contactHours).toBe(12);
    const all = answer(rep(1, 96), 2, CFG, rep(1, 24));
    expect(all.poweredHours).toBe(48);
    expect(all.contactHours).toBe(24);
  });

  it('says how much of the time with power Earth is in view', () => {
    const sun = [...rep(1, 30), ...rep(0, 40), ...rep(1, 122)];
    const some = answer(sun, 4, CFG, rep(1, 12));
    expect(some.sentences[0]).toBe('Earth is in view for 12 hours of the 1 day 16 hours with power.');
    const all = answer(sun, 4, CFG, rep(1, 192));
    expect(all.sentences[0]).toBe('Earth is in view for all 1 day 16 hours with power.');
    const whole = answer(rep(1, 96), 2, CFG, rep(1, 24));
    expect(whole.sentences[0]).toBe('Earth is in view for 1 day of the 2 days.');
    expect(answer(rep(1, 96), 2, CFG, rep(1, 96)).sentences[0]).toBe('Earth is in view for all 2 days.');
  });

  it('stays true when the period starts at night', () => {
    const a = answer([...rep(0, 30), ...rep(1, 20), ...rep(0, 142)], 2);
    expect(a.title).toBe('Landing at Alpha Ridge on 1 January: power for 10 hours, then night');
    expect(a.sentences).toEqual([
      'No radio contact: Earth is out of view for all 10 hours with power.',
      'The period starts at night: the Sun is set behind the hills until it rises on 2 January.',
      'The battery covers the first 10 hours of the night; power comes back on 2 January, if the lander starts again after the cold.',
    ]);
    expect(a.better?.label).toBe('Land on 2 January instead');
    expect(a.better?.note).toBe('From 2 January, 06:00 UTC: power for 1 day 6 hours in a row.');
  });

  it('stays true when the night outlasts the period', () => {
    const a = answer([...rep(1, 20), ...rep(0, 172)], 2);
    expect(a.title).toBe('Landing at Alpha Ridge on 1 January: power for 1 day 6 hours, then night');
    expect(a.sentences).toEqual([
      'No radio contact: Earth is out of view for all 1 day 6 hours with power.',
      'The Sun sets behind the hills on 1 January, and the night lasts the rest of the period.',
      'The battery covers the first 10 hours of the night, and the lander stays off for the rest of the period.',
    ]);
    expect(a.better).toBeNull();
    expect(a.hint).toBe('No landing date in these 2 days gives more power here. For power through the night, choose a bigger battery (Lander, above) or a shorter stay.');
  });

  it('does not blame the night when the panel is too small for the load', () => {
    const weak: PowerConfig = { ...CFG, areaM2: 0.05 }; // 68 W against a 100 W load: the battery drains in daylight
    const a = answer(rep(1, 96), 2, weak);
    expect(a).toMatchObject({ tone: 'bad', kind: 'low-sun', title: 'Landing at Alpha Ridge on 1 January: power for 1 day 7 hours, then too little sunlight' });
    expect(a.sentences[1]).toBe('The Sun is up, but the panel makes about 68 W and the lander uses 100 W.');
    expect(a.sentences.join(' ')).not.toMatch(/night/);
    expect(a.better).toBeNull();
  });

  it('says power comes back only if the lander starts again: the forecast counts energy, not the cold or a restart', () => {
    const night = answer([...rep(1, 30), ...rep(0, 40), ...rep(1, 122)], 4);
    expect(night.sentences.join(' ')).toMatch(/power comes back on \d+ January, if the lander starts again after the cold\./);
    const weak = answer([...rep(1, 40), ...rep(0.02, 10), ...rep(1, 46)], 2, { ...CFG, areaM2: 0.2 });
    for (const line of [...night.sentences, ...weak.sentences]) expect(line).not.toMatch(/\b(is back on|survives?|lives|safe)\b/);
  });

  it('says so when there is no sunlight at all', () => {
    const a = answer(rep(0, 96), 2);
    expect(a).toMatchObject({ tone: 'bad', kind: 'no-sun', title: 'No sunlight at Alpha Ridge in these 2 days', better: null });
    expect(a.sentences).toEqual(['This spot stays in shadow for the whole period. A solar lander cannot work here.']);
    expect(a.hint).toBe('Try another site, or another month.');
  });

  it('credits the battery when it alone carries a period without sunlight', () => {
    const a = answer(rep(0, 96), 2, { ...CFG, batteryWh: 10_000 });
    expect(a).toMatchObject({ tone: 'good', kind: 'all', title: 'Landing at Alpha Ridge on 1 January: power for all 2 days' });
    expect(a.sentences).toEqual(['No radio contact: Earth is out of view for all 2 days.', 'There is no sunlight in these 2 days: the battery alone carries the lander.']);
  });

  it('never writes "undefined", "NaN" or a zero duration in a sentence', () => {
    const cases = [rep(1, 96), rep(0, 96), [...rep(0, 30), ...rep(1, 66)], [...rep(1, 47), 0, ...rep(1, 48)], [...rep(1, 1), ...rep(0, 95)]];
    for (const sun of cases) {
      for (const cfg of [CFG, { ...CFG, batteryWh: 0 }, { ...CFG, initialSocFraction: 0 }]) {
        const a = answer(sun, 2, cfg);
        const text = [a.title, ...a.sentences, a.better?.label ?? '', a.better?.note ?? '', a.hint ?? ''].join(' ');
        expect(text).not.toMatch(/undefined|NaN|null|\b0 hours|\b0 days/);
      }
    }
  });
});

describe('answerFor where the Sun goes below the horizon', () => {
  it('says so instead of blaming the hills when the Sun is under the horizon for the whole night', () => {
    // A site far from the pole: the Sun is well below the horizon all night.
    const sun = [...rep(1, 30), ...rep(0, 40), ...rep(1, 122)];
    const s = { ...series(sun), sunEl: Float64Array.from(sun.map((v) => (v ? 30 : -20))) };
    const period = { ...series(sun.slice(0, 96)), sunEl: s.sunEl.slice(0, 96) };
    const a = answerFor({
      siteName: 'Alpha Ridge',
      series: period,
      summary: summarize(period),
      power: powerBudget(period, CFG),
      startUtc: START,
      days: 4,
      loadW: CFG.loadW,
      batteryWh: CFG.batteryWh,
      best: bestLanding(s, CFG, { from: 0, to: 96, step: 1, capHours: 96 }),
    });
    expect(a.sentences[1]).toBe('The Sun sets below the horizon on 2 January, and the night lasts 1 day 16 hours.');
  });
});

describe('answerFor on real data', () => {
  it('reads de Gerlache Rim 2 in January 2027 the way the approved design does', () => {
    const header = readJson<EphemerisHeader>('data', 'ephemeris', 'moon_me_2024_2036_1h.json');
    const eph = loadEphemeris(readBytes('data', 'ephemeris', 'moon_me_2024_2036_1h.f32'), header);
    const site = { lat: -88.28, lon: -64.31 };
    const mask = readJson<{ elevation_deg: number[] }>('data', 'masks', 'de_gerlache_rim_2.json').elevation_deg;
    const scan = hourlySeries(site, mask, eph, utcToEt(START), 1440);
    const period = hourlySeries(site, mask, eph, utcToEt(START), 720);
    const a = answerFor({
      siteName: 'de Gerlache Rim 2',
      series: period,
      summary: summarize(period),
      power: powerBudget(period, DEFAULT_POWER),
      startUtc: START,
      days: 30,
      loadW: DEFAULT_POWER.loadW,
      batteryWh: DEFAULT_POWER.batteryWh,
      best: bestLanding(scan, DEFAULT_POWER, { from: 0, to: 720, step: 1, capHours: 720 }),
    });
    expect(a.title).toBe('Landing at de Gerlache Rim 2 on 1 January: power for 3 days 4 hours, then night');
    // Earth stays below the horizon until 10 January: the three days with power have no contact at all.
    expect(a.sentences[0]).toBe('No radio contact: Earth is out of view for all 3 days 4 hours with power.');
    expect(a.sentences[1]).toBe('The Sun sets behind the hills on 3 January, and the night lasts 16 days 15 hours.');
    expect(a.sentences[2]).toBe('As the Sun set, the panel already gave less than the lander uses, so the battery covers only the first 9 hours of the night; power comes back on 20 January, if the lander starts again after the cold.');
    expect(a.better?.label).toBe('Land on 20 January instead');
    expect(a.better?.note).toBe('From 20 January, 10:00 UTC: power for 12 days 15 hours in a row.');
    expect(a.better?.startUtc).toBe('2027-01-20T10:00:00');
  });
});

describe('nearbyAdvice', () => {
  const here = { id: 'here', name: 'Here', label: 'Here', lat: -88.3, lon: -64.3, category: 'artemis3', polar: true, source: 'x' };
  // About 12 km, 6 km and 55 km from here, on the same meridian.
  const summit = { ...here, id: 'summit', name: 'Summit', label: 'Summit', lat: -88.7, lon: -64.3 };
  const step = { ...here, id: 'step', name: 'Step', label: 'Step', lat: -88.1, lon: -64.3 };
  const far = { ...here, id: 'far', name: 'Far', label: 'Far', lat: -86.5, lon: -64.3 };
  const sites = [here, summit, step, far];
  const o = (nowHours: number) => ({ sunFraction: 0.5, earthFraction: 0.5, nowHours, best: null });

  it('names the nearest site within 30 km that keeps power at least a day longer from the same landing day', () => {
    const advice = nearbyAdvice(here, sites, { summit: o(720), step: o(90), far: o(720) }, 76);
    expect(advice?.site.id).toBe('summit');
    expect(advice?.km).toBeGreaterThan(9);
    expect(advice?.km).toBeLessThan(15);
    expect(advice?.hours).toBe(720);
  });

  it('says it in one sentence: where, how far and how long the power lasts there', () => {
    expect(nearbyWords({ site: summit, km: 12.3, hours: 720 }, 30)).toBe('Nearby, Summit (12 km away) keeps power for all 30 days from the same landing day.');
    expect(nearbyWords({ site: summit, km: 4.04, hours: 300 }, 30)).toBe('Nearby, Summit (4 km away) keeps power for 12 days 12 hours from the same landing day.');
  });

  it('says nothing when no site nearby does clearly better, or before their figures are in', () => {
    expect(nearbyAdvice(here, sites, { summit: o(80), step: o(90), far: o(720) }, 76)).toBeNull();
    expect(nearbyAdvice(here, sites, {}, 76)).toBeNull();
  });
});
