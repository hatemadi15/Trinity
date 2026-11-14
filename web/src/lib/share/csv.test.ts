import { describe, expect, it } from 'vitest';
import { hasFile } from '../engine/__tests__/helpers';
import { contactWindows } from '../engine/metrics';
import { createExploreStore, type ExploreState } from '../store/explore';
import { fileLoaders } from '@/test/file-loaders';
import { aboutJson, ascii, cell, fileStem, fixed, HOURLY_COLUMNS, hourlyCsv, numbersCsv, WINDOW_COLUMNS, windowsCsv, type ExportInput } from './csv';
import { collectProvenance } from './provenance';

const haveData = hasFile('data', 'ephemeris', 'moon_me_2024_2036_1h.f32') && hasFile('data', 'masks', 'haworth.json');

async function explore(id: string, power: Partial<ExploreState['params']['power']> = {}) {
  const store = createExploreStore(fileLoaders());
  await store.getState().init();
  await store.getState().selectSite(id);
  if (Object.keys(power).length > 0) store.getState().setPower(power);
  return store.getState();
}

const input = (s: ExploreState): ExportInput => ({ site: s.site!, startUtc: s.startUtc, days: s.days, params: s.params, eph: s.eph!, series: s.series!, power: s.power!, summary: s.summary!, maskMeta: s.maskMeta, best: s.best });
const versions = { app: { version: '0.1.0', commit: 'abc123def456' }, data: { sites: 'sites.json version 1', ephemeris: null } };
const provenance = (s: ExploreState) => collectProvenance({ site: s.site!, maskMeta: s.maskMeta, params: s.params, eph: s.eph!, startUtc: s.startUtc, days: s.days }, versions);

/** The rows of a CSV as a spreadsheet splits them: a quoted cell may hold commas and doubled quotes. */
function rows(text: string): string[][] {
  const out: string[][] = [];
  for (const line of text.split('\r\n').slice(0, -1)) {
    const cells: string[] = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (quoted) {
        if (c === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (c === '"') quoted = false;
        else cur += c;
      } else if (c === '"') quoted = true;
      else if (c === ',') {
        cells.push(cur);
        cur = '';
      } else cur += c;
    }
    cells.push(cur);
    out.push(cells);
  }
  return out;
}

describe('cells', () => {
  it('quotes a cell with a comma or a quote, spells the app’s signs in ASCII, and never writes minus zero', () => {
    expect(cell('Custom site -89.500°, 10.000°')).toBe('"Custom site -89.500 deg, 10.000 deg"');
    expect(cell('say "hi"')).toBe('"say ""hi"""');
    expect(ascii('8.5–12.0 km, 4 m² panel, Niépce')).toBe('8.5-12.0 km, 4 m2 panel, Niepce');
    expect(fixed(-0.00001, 4)).toBe('0.0000');
    expect(fixed(-1.23456, 2)).toBe('-1.23');
    expect(fileStem('haworth', '2027-01-01T00:00:00', 30)).toBe('earthrise_haworth_2027-01-01_30d');
    expect(fileStem('haworth', '2027-01-20T10:00:00', 7)).toBe('earthrise_haworth_2027-01-20T1000_7d');
  });
});

describe.skipIf(!haveData)('the files Explore and the brief save', () => {
  it('give one row for each hour after the row of column names, times in UTC on the hour, and the numbers Explore works with', async () => {
    const s = await explore('haworth');
    const file = hourlyCsv(input(s));
    expect(file.name).toBe('earthrise_haworth_2027-01-01_30d_hourly.csv');
    expect(/^[\x20-\x7e\r\n]*$/.test(file.text)).toBe(true);
    expect(file.text.endsWith('\r\n')).toBe(true);
    const r = rows(file.text);
    expect(r[0]).toEqual(HOURLY_COLUMNS.map((c) => c.name));
    expect(r).toHaveLength(721);
    expect(r[1][0]).toBe('2027-01-01T00:00:00Z');
    expect(r[720][0]).toBe('2027-01-30T23:00:00Z');
    const series = s.series!, power = s.power!;
    for (const h of [0, 66, 300, 719]) {
      const row = r[h + 1];
      expect(Number(row[1])).toBeCloseTo(series.sunEl[h], 4);
      expect(Number(row[2])).toBeCloseTo(series.sunAz[h], 4);
      expect(Number(row[3])).toBeCloseTo(series.sunFraction[h], 4);
      expect(Number(row[4])).toBeCloseTo(series.earthEl[h], 4);
      expect(Number(row[5])).toBeCloseTo(series.earthAz[h], 4);
      expect(Number(row[6])).toBe(series.earthVisible[h]);
      expect(Number(row[7])).toBeCloseTo(power.powerW[h], 2);
      expect(Number(row[8])).toBeCloseTo(power.energyWh[h], 2);
      expect(Number(row[9])).toBeCloseTo(power.energyWh[h] / s.params.power.batteryWh, 4);
      expect(Number(row[10])).toBe(power.powered[h]);
    }
  });

  it('list the radio windows as the engine finds them, opening and closing in UTC, with how long each lasts and its powered hours', async () => {
    const s = await explore('haworth');
    const file = windowsCsv(input(s));
    const r = rows(file.text);
    const windows = contactWindows(s.series!);
    expect(r[0]).toEqual(WINDOW_COLUMNS.map((c) => c.name));
    expect(r).toHaveLength(windows.length + 1);
    expect(windows.length).toBeGreaterThan(0);
    const total = r.slice(1).reduce((sum, row) => sum + Number(row[2]), 0);
    expect(total).toBe(Math.round(s.summary!.earthVisFraction * 720));
    const first = r[1];
    expect(first[0]).toBe(`${new Date(Date.UTC(2027, 0, 1) + windows[0].start * 3600_000).toISOString().slice(0, 19)}Z`);
    expect(Number(first[2])).toBe(windows[0].end - windows[0].start);
    expect(first[3]).toBe(windows[0].start === 0 ? '1' : '0');
  });

  it('give every figure of All numbers with the settings and the period behind it, as keys and values', async () => {
    const s = await explore('haworth', { loadW: 400, batteryWh: 20000, areaM2: 8 });
    const table = Object.fromEntries(rows(numbersCsv(input(s), provenance(s)).text).slice(1).map(([k, v, unit]) => [k, { v, unit }]));
    expect(table.site_id.v).toBe('haworth');
    expect(table.period_start_utc.v).toBe('2027-01-01T00:00:00Z');
    expect(table.period_end_utc.v).toBe('2027-01-31T00:00:00Z');
    expect(table.load_w).toEqual({ v: '400', unit: 'W' });
    expect(table.battery_wh.v).toBe('20000');
    expect(table.panel_area_m2.v).toBe('8');
    expect(table.mast_m.v).toBe('2');
    expect(Number(table.sunlight_fraction.v)).toBeCloseTo(s.summary!.illumFraction, 4);
    expect(Number(table.longest_night_h.v)).toBe(s.summary!.longestDarkH);
    expect(Number(table.time_without_power_h.v)).toBe(s.power!.brownoutHours);
    expect(Number(table.battery_hours_when_full.v)).toBe(50);
    expect(table.skyline.v).toBe('featured');
  });

  it('put the settings, the versions, the sources, the link and every column in the JSON beside the tables', async () => {
    const s = await explore('haworth');
    const x = input(s);
    const files = [hourlyCsv(x), numbersCsv(x, provenance(s)), windowsCsv(x)];
    const about = aboutJson(x, provenance(s), 'https://earthrise.example/explore?site=haworth&start=2027-01-01&days=30', files, '2026-11-14T12:00:00Z');
    expect(about.name).toBe('earthrise_haworth_2027-01-01_30d_about.json');
    const doc = JSON.parse(about.text);
    expect(doc.format).toBe('earthrise-export');
    expect(doc.format_version).toBe(1);
    expect(doc.link).toBe('https://earthrise.example/explore?site=haworth&start=2027-01-01&days=30');
    expect(doc.settings).toEqual({ panel: 'vertical_tracking', panel_facing_deg: 0, panel_area_m2: 4, panel_efficiency: 0.3, load_w: 200, battery_wh: 2000, battery_at_landing_fraction: 1, mast_m: 2, earth_min_clearance_deg: 0 });
    expect(doc.period).toEqual({ start_utc: '2027-01-01T00:00:00Z', end_utc: '2027-01-31T00:00:00Z', days: 30, hours: 720 });
    expect(doc.versions).toEqual({ app: '0.1.0', commit: 'abc123def456', sites: 'sites.json version 1', ephemeris: null });
    expect(doc.skyline.grids[0]).toMatch(/^LOLA LDEM 80 m/);
    expect(doc.files.map((f: { name: string }) => f.name)).toEqual(files.map((f) => f.name));
    expect(doc.files[0].columns[0]).toEqual({ name: 'time_utc', unit: 'UTC', description: expect.stringMatching(/UTC/) });
  });
});
