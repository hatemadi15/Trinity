import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { degreesText, HOME, MISSIONS, thousandsText } from './home';

const validation = (name: string) => JSON.parse(fs.readFileSync(path.resolve(process.cwd(), '../data/validation', name), 'utf8'));

describe('home facts', () => {
  it('formats the tiny angle and the ratio for a sentence', () => {
    expect(degreesText(2.7e-5)).toBe('0.00003°');
    expect(thousandsText(19741)).toBe('20,000');
    expect(thousandsText(1499)).toBe('1,000');
  });

  it('has not drifted from the validation tables it summarises', () => {
    const horizons = validation('horizons.json');
    const mazarico = validation('mazarico.json');
    const backcasts = validation('backcasts.json');
    expect(HOME.facts.horizons_worst_el_deg).toBe(horizons.max_abs_delta_el_deg);
    expect(HOME.facts.horizons_rows).toBe(horizons.n_rows);
    const covered: number[] = mazarico.rows.filter((r: { covered: boolean; delta_points?: number }) => r.covered && r.delta_points !== undefined).map((r: { delta_points: number }) => Math.abs(r.delta_points)).sort((a: number, b: number) => a - b);
    const median = covered.length % 2 ? covered[(covered.length - 1) / 2] : (covered[covered.length / 2 - 1] + covered[covered.length / 2]) / 2;
    expect(HOME.facts.mazarico_sites).toBe(covered.length);
    expect(HOME.facts.mazarico_median_points).toBeCloseTo(median, 1);
    const ghost = backcasts.rows.find((r: { site_id: string }) => r.site_id === 'blue_ghost_m1');
    expect(HOME.facts.blue_ghost_end_minus_sunset_h).toBeCloseTo(ghost.end_minus_sunset_h, 1);
  });

  it('carries a full month of the hero site and its night', () => {
    expect(HOME.sky.hours).toBe(720);
    expect(HOME.sky.sun_el.length).toBe(720);
    expect(HOME.sky.night).toEqual({ sunset_hour: 67, sunrise_hour: 466, hours: 399 });
    expect(HOME.pair.rim_sun_pct).toBe(100);
  });

  it('opens each mission on its site and date', () => {
    expect(MISSIONS.map((m) => m.href)).toEqual(['/explore?site=im2_athena&start=2025-03-06', '/explore?site=blue_ghost_m1&start=2025-03-02', '/explore?site=de_gerlache_rim_2']);
  });
});
