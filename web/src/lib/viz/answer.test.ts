import { describe, expect, it } from 'vitest';
import { loadEphemeris, type EphemerisHeader } from '../engine/ephemeris';
import { bestLanding } from '../engine/landing';
import { hourlySeries, summarize, type Series } from '../engine/metrics';
import { DEFAULT_POWER, powerBudget, type PowerConfig } from '../engine/power';
import { utcToEt } from '../engine/time';
import { readBytes, readJson } from '../engine/__tests__/helpers';
import { answerFor } from './answer';

// 1361 W while any Sun shows, 100 W load, 1000 Wh battery: ten hours in the dark.
const CFG: PowerConfig = { ...DEFAULT_POWER, panel: 'full_tracking', areaM2: 1, efficiency: 1, loadW: 100, batteryWh: 1000 };
const START = '2027-01-01T00:00:00';
const rep = (v: number, n: number) => new Array<number>(n).fill(v);

function series(sun: number[]): Series {
  const n = sun.length;
  return {
    i0: 0,
    hours: n,
    sunAz: new Float64Array(n),
    sunEl: new Float64Array(n).fill(5),
    earthAz: new Float64Array(n),
    earthEl: new Float64Array(n),
    sunFraction: Float64Array.from(sun),
    earthVisible: new Uint8Array(n),
    sunAu: new Float64Array(n).fill(1),
  };
}

/** The answer for the first `days` days of a longer series, the way the store asks for it. */
function answer(sun: number[], days: number, cfg: PowerConfig = CFG) {
  const scan = series(sun);
  const hours = days * 24;
  const period = series(sun.slice(0, hours));
  return answerFor({
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
    expect(a).toMatchObject({ tone: 'good', kind: 'all', title: 'Landing on 1 January: power for all 2 days', better: null, hint: null });
    expect(a.sentences).toEqual(['The Sun never sets in these 2 days.']);
  });

  it('names the longest night when the battery covers it', () => {
    const a = answer([...rep(1, 20), ...rep(0, 8), ...rep(1, 68)], 2);
    expect(a.title).toBe('Landing on 1 January: power for all 2 days');
    expect(a.sentences).toEqual(['The Sun is up 83 % of the time. The longest night lasts 8 hours, and the battery covers it.']);
  });

  it('says how long the power lasts, when the Sun sets, what the battery covers and when the lander is back', () => {
    // Sun for 30 h, night for 40 h, Sun again: the battery carries 10 h of the night.
    const a = answer([...rep(1, 30), ...rep(0, 40), ...rep(1, 122)], 4);
    expect(a).toMatchObject({ tone: 'bad', kind: 'night', title: 'Landing on 1 January: power for 1 day 16 hours, then night' });
    expect(a.sentences).toEqual([
      'The Sun sets on 2 January and stays behind the hills for 1 day 16 hours.',
      'The battery covers the first 10 hours of the night; the lander is back on 3 January.',
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
      'The Sun sets on 2 January and stays behind the hills for 1 day 16 hours.',
      'The battery, not quite full when the Sun set, covers the first 9 hours of the night; the lander is back on 3 January.',
    ]);
  });

  it('names a landing that is not at midnight by its day only', () => {
    const scan = series([...rep(1, 30), ...rep(0, 40), ...rep(1, 122)]);
    const period = series([...rep(1, 30), ...rep(0, 40), ...rep(1, 26)]);
    const a = answerFor({ series: period, summary: summarize(period), power: powerBudget(period, CFG), startUtc: '2027-01-20T10:00:00', days: 4, loadW: 100, batteryWh: 1000, best: bestLanding(scan, CFG, { from: 0, to: 96, step: 1, capHours: 96 }) });
    expect(a.title).toBe('Landing on 20 January: power for 1 day 16 hours, then night');
  });

  it('says when there is no power from the first hour', () => {
    const a = answer([...rep(0, 30), ...rep(1, 66)], 2, { ...CFG, batteryWh: 0 });
    expect(a.title).toBe('Landing on 1 January: no power, it is night');
  });

  it('stays true when the period starts in the dark', () => {
    const a = answer([...rep(0, 30), ...rep(1, 20), ...rep(0, 142)], 2);
    expect(a.title).toBe('Landing on 1 January: power for 10 hours, then night');
    expect(a.sentences).toEqual([
      'The period starts in the dark: the Sun stays behind the hills until 2 January.',
      'The battery covers the first 10 hours of the night; the lander is back on 2 January.',
    ]);
    expect(a.better?.label).toBe('Land on 2 January instead');
    expect(a.better?.note).toBe('From 2 January, 06:00 UTC: power for 1 day 6 hours in a row.');
  });

  it('stays true when the night outlasts the period', () => {
    const a = answer([...rep(1, 20), ...rep(0, 172)], 2);
    expect(a.title).toBe('Landing on 1 January: power for 1 day 6 hours, then night');
    expect(a.sentences).toEqual([
      'The Sun sets on 1 January and stays behind the hills for the rest of the period.',
      'The battery covers the first 10 hours of the night, and the lander stays off for the rest of the period.',
    ]);
    expect(a.better).toBeNull();
    expect(a.hint).toBe('No landing date in these 2 days gives more power here. A shorter stay or a bigger battery may.');
  });

  it('does not blame the night when the panel is too small for the load', () => {
    const weak: PowerConfig = { ...CFG, areaM2: 0.05 }; // 68 W against a 100 W load: the battery drains in daylight
    const a = answer(rep(1, 96), 2, weak);
    expect(a).toMatchObject({ tone: 'bad', kind: 'low-sun', title: 'Landing on 1 January: power for 1 day 7 hours, then too little sunlight' });
    expect(a.sentences[0]).toBe('The Sun is up, but the panel makes about 68 W and the lander uses 100 W.');
    expect(a.sentences.join(' ')).not.toMatch(/night/);
    expect(a.better).toBeNull();
  });

  it('says so when there is no sunlight at all', () => {
    const a = answer(rep(0, 96), 2);
    expect(a).toMatchObject({ tone: 'bad', kind: 'no-sun', title: 'No sunlight in these 2 days', better: null });
    expect(a.sentences).toEqual(['This spot stays in shadow for the whole period. A solar lander cannot work here.']);
    expect(a.hint).toBe('Try another site, or another month.');
  });

  it('credits the battery when it alone carries a period without sunlight', () => {
    const a = answer(rep(0, 96), 2, { ...CFG, batteryWh: 10_000 });
    expect(a).toMatchObject({ tone: 'good', kind: 'all', title: 'Landing on 1 January: power for all 2 days' });
    expect(a.sentences).toEqual(['There is no sunlight in these 2 days: the battery alone carries the lander.']);
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
      series: period,
      summary: summarize(period),
      power: powerBudget(period, CFG),
      startUtc: START,
      days: 4,
      loadW: CFG.loadW,
      batteryWh: CFG.batteryWh,
      best: bestLanding(s, CFG, { from: 0, to: 96, step: 1, capHours: 96 }),
    });
    expect(a.sentences[0]).toBe('The Sun sets on 2 January and stays below the horizon for 1 day 16 hours.');
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
      series: period,
      summary: summarize(period),
      power: powerBudget(period, DEFAULT_POWER),
      startUtc: START,
      days: 30,
      loadW: DEFAULT_POWER.loadW,
      batteryWh: DEFAULT_POWER.batteryWh,
      best: bestLanding(scan, DEFAULT_POWER, { from: 0, to: 720, step: 1, capHours: 720 }),
    });
    expect(a.title).toBe('Landing on 1 January: power for 3 days 4 hours, then night');
    expect(a.sentences[0]).toBe('The Sun sets on 3 January and stays behind the hills for 16 days 15 hours.');
    expect(a.sentences[1]).toBe('The battery, not quite full when the Sun set, covers the first 9 hours of the night; the lander is back on 20 January.');
    expect(a.better?.label).toBe('Land on 20 January instead');
    expect(a.better?.note).toBe('From 20 January, 10:00 UTC: power for 12 days 15 hours in a row.');
    expect(a.better?.startUtc).toBe('2027-01-20T10:00:00');
  });
});
