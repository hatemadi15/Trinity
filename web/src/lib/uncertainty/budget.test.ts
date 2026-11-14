import { describe, expect, it } from 'vitest';
import type { Series } from '@/lib/engine/metrics';
import { DEFAULT_POWER, simulateBattery } from '@/lib/engine/power';
import { readJson } from '@/lib/engine/__tests__/helpers';
import { EVENT_KINDS, keyEvents, plusMinusFor, sureLines, withinWords, type EventBudget, type SiteBudget, type UncertaintyDoc } from './budget';

const offsets = (p95: number) => ({ n: 10, median_h: p95 / 2, p05_h: 0, p95_h: p95, p95_abs_h: p95, max_abs_h: p95 });
const event = (shown: number | null, terrain = 1): EventBudget => ({
  sampling: offsets(0.9),
  terrain: { ...offsets(terrain), lost: 0 },
  ephemeris: { n: 10, p95_s: 1.2, max_s: 2 },
  plus_minus_h: shown,
  shown_h: shown,
});
const allEvents = (shown: number | null): SiteBudget['events'] => ({
  sunset: event(shown),
  sunrise: event(shown),
  earthset: event(1),
  earthrise: event(1),
  battery_out: event(shown === null ? null : shown + 1),
  power_back: event(shown),
});
const ridge: SiteBudget = { site_id: 'connecting_ridge', name: 'Connecting Ridge', label: 'Connecting Ridge', lat: -89.5, lon: -150, polar: true, condition: 'a grazing Sun at a polar ridge', skyline: null, terrain_quality: null, events: allEvents(2) };
const flat: SiteBudget = { site_id: 'blue_ghost_m1', name: 'Blue Ghost', label: 'Blue Ghost Mission 1', lat: 18.6, lon: 61.8, polar: false, condition: 'far from the pole, flat horizon', skyline: null, terrain_quality: null, events: allEvents(3.5) };
const doc: UncertaintyDoc = {
  version: 1,
  generated_utc: '2026-11-14T12:00:00+00:00',
  span: { start_utc: '2025-01-01T00:00:00Z', days: 730, fine_step_s: 60, hourly_step_s: 3600 },
  sites: [ridge, flat],
  pooled: { polar: { sunset: { sites: 1, largest_shown_h: 6, median_plus_minus_h: 2 }, sunrise: { sites: 1, largest_shown_h: 6, median_plus_minus_h: 2 }, earthset: { sites: 1, largest_shown_h: 1.5, median_plus_minus_h: 1 }, earthrise: { sites: 1, largest_shown_h: 1.5, median_plus_minus_h: 1 }, battery_out: { sites: 1, largest_shown_h: 7, median_plus_minus_h: 3 }, power_back: { sites: 1, largest_shown_h: 6, median_plus_minus_h: 2 } } },
};

/** Ten days, hour by hour: the Sun up for 50 hours, set for 100, up again; Earth in view from hour 20 to hour 120. */
function series(): Series {
  const hours = 240;
  const s: Series = {
    i0: 0,
    hours,
    sunAz: new Float64Array(hours),
    sunEl: new Float64Array(hours).fill(1),
    earthAz: new Float64Array(hours),
    earthEl: new Float64Array(hours),
    sunFraction: new Float64Array(hours),
    earthVisible: new Uint8Array(hours),
    sunAu: new Float64Array(hours).fill(1),
  };
  for (let h = 0; h < hours; h++) {
    s.sunFraction[h] = h < 50 || h >= 150 ? 1 : 0;
    s.earthVisible[h] = h >= 20 && h < 120 ? 1 : 0;
  }
  return s;
}

describe('the uncertainty budget', () => {
  it('gives a measured site its own plus-or-minus, an unmeasured polar point the largest at the featured polar sites, and a point far from the pole the flat-horizon one', () => {
    expect(plusMinusFor(doc, { id: 'connecting_ridge', polar: true }, 'sunset')).toEqual({ hours: 2, basis: 'site' });
    expect(plusMinusFor(doc, { id: 'custom-1', polar: true }, 'sunset')).toEqual({ hours: 6, basis: 'polar-sites' });
    expect(plusMinusFor(doc, { id: 'custom-2', polar: false }, 'battery_out')).toEqual({ hours: 4.5, basis: 'flat' });
    // An event the site never has over the measured span carries no figure.
    const never: UncertaintyDoc = { ...doc, sites: [{ ...ridge, events: allEvents(null) }] };
    expect(plusMinusFor(never, { id: 'connecting_ridge', polar: true }, 'sunset')).toBeNull();
  });

  it('words a plus-or-minus in minutes under an hour and in hours above', () => {
    expect([0.5, 1, 1.5, 2, 12].map(withinWords)).toEqual(['30 min', '1 h', '1.5 h', '2 h', '12 h']);
  });

  it('finds the events the verdict speaks of: the night the battery runs out in, its sunrise, the power back and Earth’s first change', () => {
    const s = series();
    const cfg = { ...DEFAULT_POWER, loadW: 200, batteryWh: 2000 };
    const power = simulateBattery(Float64Array.from(s.sunFraction, (f) => (f > 0 ? 1000 : 0)), cfg);
    // The battery's 2000 Wh carry a 200 W load for 10 of the 100 hours of night.
    expect(power.firstBrownoutHour).toBe(60);
    expect(keyEvents(s, power)).toEqual([
      { kind: 'earthrise', hour: 20 },
      { kind: 'sunset', hour: 50 },
      { kind: 'battery_out', hour: 60 },
      { kind: 'sunrise', hour: 150 },
      { kind: 'power_back', hour: 150 },
    ]);
  });

  it('writes each event with its time in UTC and the supported margin, and says where the margin comes from', () => {
    const s = series();
    const power = simulateBattery(Float64Array.from(s.sunFraction, (f) => (f > 0 ? 1000 : 0)), DEFAULT_POWER);
    const sure = sureLines({ doc, site: { id: 'connecting_ridge', polar: true }, series: s, power, startUtc: '2027-01-01T00:00:00' });
    expect(sure.lines).toEqual([
      'Earth rises 1 Jan 20:00 UTC, within about 1 h.',
      'Sunset 3 Jan 02:00 UTC, within about 2 h.',
      'Battery runs out 3 Jan 12:00 UTC, within about 3 h.',
      'Sunrise 7 Jan 06:00 UTC, within about 2 h.',
      'Power back 7 Jan 06:00 UTC, within about 2 h.',
    ]);
    expect(sure.basis).toMatch(/^Measured at this site/);
    expect(sure.widest).toBe(3);
    const custom = sureLines({ doc, site: { id: 'custom-1', polar: true }, series: s, power, startUtc: '2027-01-01T00:00:00' });
    expect(custom.lines[1]).toBe('Sunset 3 Jan 02:00 UTC, within about 6 h.');
    expect(custom.basis).toMatch(/^Not measured at this point/);
    const far = sureLines({ doc, site: { id: 'custom-2', polar: false }, series: s, power, startUtc: '2027-01-01T00:00:00' });
    expect(far.basis).toMatch(/flat horizon/);
  });

  it('says nothing it cannot support: no event, no line; no budget, no lines', () => {
    const s = series();
    s.sunFraction.fill(1);
    s.earthVisible.fill(1);
    const power = simulateBattery(new Float64Array(s.hours).fill(1000), DEFAULT_POWER);
    expect(sureLines({ doc, site: { id: 'connecting_ridge', polar: true }, series: s, power, startUtc: '2027-01-01T00:00:00' }).lines).toEqual([]);
    expect(sureLines({ doc: null, site: { id: 'connecting_ridge', polar: true }, series: series(), power, startUtc: '2027-01-01T00:00:00' }).lines).toEqual([]);
  });
});

describe('the budget the app reads (data/uncertainty/budget.json)', () => {
  const real = readJson<UncertaintyDoc>('data', 'uncertainty', 'budget.json');

  it('measures every featured site over two years at one-minute steps, with the four conditions the review asks for', () => {
    expect(real.version).toBe(1);
    expect(real.span).toMatchObject({ days: 730, fine_step_s: 60, hourly_step_s: 3600 });
    const conditions = real.sites.filter((s) => s.condition).map((s) => s.site_id).sort();
    expect(conditions).toEqual(['blue_ghost_m1', 'connecting_ridge', 'im2_athena', 'shackleton_center_rim_high']);
    for (const s of real.sites) expect(Object.keys(s.events).sort()).toEqual([...EVENT_KINDS].sort());
  });

  it('keeps the three sources apart and never shows less than the hourly steps alone', () => {
    for (const s of real.sites) {
      for (const kind of EVENT_KINDS) {
        const e = s.events[kind];
        if (e.shown_h === null) continue;
        expect(e.shown_h).toBeGreaterThanOrEqual(e.sampling.p95_abs_h ?? 0);
        // The hourly series names the first hour in the new state: never more than an hour from the one-minute time.
        expect(e.sampling.max_abs_h ?? 0).toBeLessThanOrEqual(1);
        expect(e.ephemeris.max_s ?? 0).toBeLessThan(60);
        expect(s.polar ? e.terrain : null).toEqual(s.polar ? expect.any(Object) : null);
      }
    }
  });

  it('describes the ground at every polar site from NASA’s adjusted maps, and at none far from the pole', () => {
    for (const s of real.sites) {
      if (!s.polar) expect(s.terrain_quality).toBeNull();
      else expect(s.terrain_quality).toMatchObject({ height_error_m: expect.any(Number), slope_deg: expect.any(Number), effective_resolution_m: expect.any(Number) });
    }
  });
});
