import type { Site } from '../data/loaders';
import type { Ephemeris } from '../engine/ephemeris';
import type { Landing } from '../engine/landing';
import { contactWindows, type Series, type Summary } from '../engine/metrics';
import type { PowerResult } from '../engine/power';
import { etToIso } from '../engine/time';
import { batteryHours } from '../lander';
import type { MaskMeta, PlannerParams } from '../store/explore';
import type { Provenance } from './provenance';

/**
 * Explore's figures as files a spreadsheet or a script opens as they are: plain CSV, the first row naming the columns,
 * one row per hour, per figure or per radio window. A spreadsheet has no comment lines: "#" lines at the top open as rows
 * of data and break sorting, filtering and charts, and pandas or R need an extra option to skip them. So the settings,
 * the versions and the data's sources go in a small JSON file beside the tables (aboutJson), which also names and
 * describes every column, and on the printable brief. Every file is ASCII, so Excel reads it right without a byte-order
 * mark, which R and some scripts would take for part of the first column's name; lines end in CRLF (RFC 4180).
 */

/** One site, period and lander's figures: what Explore and the brief show. */
export interface ExportInput {
  site: Site;
  startUtc: string;
  days: number;
  params: PlannerParams;
  eph: Ephemeris;
  series: Series;
  power: PowerResult;
  summary: Summary;
  maskMeta: MaskMeta | null;
  best: Landing | null;
}

export interface Column {
  name: string;
  unit: string;
  description: string;
}

/** A table ready to save: its file name, its columns described for the JSON beside it, and its text. */
export interface CsvFile {
  name: string;
  columns: Column[];
  text: string;
}

const EOL = '\r\n';

/** A cell: quoted when it holds a comma, a quote or a line break; anything outside ASCII spelt in ASCII. */
export function cell(v: string | number): string {
  const s = ascii(String(v));
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The few non-ASCII signs the app's names and units use, in ASCII; anything else becomes a question mark. */
export function ascii(s: string): string {
  return s
    .replace(/[–—]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/°/g, ' deg')
    .replace(/²/g, '2')
    .replace(/ /g, ' ')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7e]/g, '?');
}

/** A number to `d` places, never "-0.00". */
export function fixed(x: number, d: number): string {
  const s = x.toFixed(d);
  return Number(s) === 0 ? (0).toFixed(d) : s;
}

function table(columns: Column[], rows: (string | number)[][]): string {
  return [columns.map((c) => c.name), ...rows].map((r) => r.map(cell).join(',')).join(EOL) + EOL;
}

/** The time of hour `h` of the series, from its row of the hourly table: an ISO time in UTC, with its Z. */
function rowUtc(eph: Ephemeris, series: Series, h: number): string {
  return `${etToIso(eph.t0Et + (series.i0 + h) * eph.stepS)}Z`;
}

/** The files' shared name: the site, the period's start (to the minute when it is not midnight) and its length. */
export function fileStem(siteId: string, startUtc: string, days: number): string {
  const start = startUtc.slice(11, 16) === '00:00' ? startUtc.slice(0, 10) : `${startUtc.slice(0, 10)}T${startUtc.slice(11, 13)}${startUtc.slice(14, 16)}`;
  return `earthrise_${siteId}_${start}_${days}d`;
}

export const HOURLY_COLUMNS: Column[] = [
  { name: 'time_utc', unit: 'UTC', description: 'the hour, on the hourly Sun and Earth table, as an ISO time in UTC' },
  { name: 'sun_elevation_deg', unit: 'deg', description: "the Sun's centre above the level horizon (negative below)" },
  { name: 'sun_azimuth_deg', unit: 'deg', description: "the Sun's direction, clockwise from north" },
  { name: 'sun_disc_in_view', unit: 'fraction 0 to 1', description: "the share of the Sun's disc above the skyline" },
  { name: 'earth_elevation_deg', unit: 'deg', description: "Earth's centre above the level horizon (negative below)" },
  { name: 'earth_azimuth_deg', unit: 'deg', description: "Earth's direction, clockwise from north" },
  { name: 'earth_in_view', unit: '1 or 0', description: "1 while Earth's centre clears the skyline by the clearance set (a clear line of sight, not a working link)" },
  { name: 'panel_power_w', unit: 'W', description: "the panel's output that hour" },
  { name: 'battery_wh', unit: 'Wh', description: 'the energy in the battery at the end of the hour' },
  { name: 'battery_fraction', unit: 'fraction 0 to 1', description: "the battery's charge as a share of its capacity at the end of the hour" },
  { name: 'load_met', unit: '1 or 0', description: '1 while the lander has power for its load that hour, 0 while it is off' },
];

/** Hour by hour: the Sun and Earth, the panel and the battery, one row for each hour of the period. */
export function hourlyCsv(x: ExportInput): CsvFile {
  const { series: s, power: p } = x;
  const cap = Math.max(0, x.params.power.batteryWh);
  const rows: (string | number)[][] = [];
  for (let h = 0; h < s.hours; h++) {
    rows.push([
      rowUtc(x.eph, s, h),
      fixed(s.sunEl[h], 4),
      fixed(s.sunAz[h], 4),
      fixed(s.sunFraction[h], 4),
      fixed(s.earthEl[h], 4),
      fixed(s.earthAz[h], 4),
      s.earthVisible[h],
      fixed(p.powerW[h], 2),
      fixed(p.energyWh[h], 2),
      fixed(cap > 0 ? p.energyWh[h] / cap : 0, 4),
      p.powered[h],
    ]);
  }
  return { name: `${fileStem(x.site.id, x.startUtc, x.days)}_hourly.csv`, columns: HOURLY_COLUMNS, text: table(HOURLY_COLUMNS, rows) };
}

/** A radio window: a run of hours with Earth in view, half-open [start, end) on the period's hours. */
export interface RadioWindowRow {
  start: number;
  end: number;
}

export const WINDOW_COLUMNS: Column[] = [
  { name: 'opens_utc', unit: 'UTC', description: 'the first hour with Earth in view; Earth rises within the hour before it' },
  { name: 'closes_utc', unit: 'UTC', description: 'the first hour after the window without Earth in view' },
  { name: 'duration_h', unit: 'h', description: 'hours with Earth in view in the window' },
  { name: 'open_at_period_start', unit: '1 or 0', description: '1 when the window is already open at the first hour: it may have opened before the period' },
  { name: 'open_at_period_end', unit: '1 or 0', description: '1 when the window is still open at the last hour: it may close after the period' },
  { name: 'powered_h', unit: 'h', description: 'hours of the window with the lander powered' },
];

/**
 * The radio windows, one row each: when Earth comes into view over the skyline and when it leaves, in UTC, and how much
 * of each the lander has power for. `windows` defaults to the engine's contact intervals.
 */
export function windowsCsv(x: ExportInput, windows: RadioWindowRow[] = contactWindows(x.series)): CsvFile {
  const n = x.series.hours;
  const rows = windows.map((w) => {
    let powered = 0;
    for (let h = w.start; h < w.end; h++) powered += x.power.powered[h];
    return [rowUtc(x.eph, x.series, w.start), rowUtc(x.eph, x.series, w.end), w.end - w.start, w.start === 0 ? 1 : 0, w.end === n ? 1 : 0, powered];
  });
  return { name: `${fileStem(x.site.id, x.startUtc, x.days)}_radio_windows.csv`, columns: WINDOW_COLUMNS, text: table(WINDOW_COLUMNS, rows) };
}

export const NUMBER_COLUMNS: Column[] = [
  { name: 'key', unit: '', description: 'what the row gives, as a name a script can use' },
  { name: 'value', unit: '', description: 'the value, a number where it is one' },
  { name: 'unit', unit: '', description: 'its unit' },
  { name: 'description', unit: '', description: 'what it measures' },
];

/** Hours with Earth in view before the first power cut: the radio contact while it has power that Explore gives. */
export function contactWhilePowered(series: Series, power: Pick<PowerResult, 'firstBrownoutHour'>): number {
  const to = power.firstBrownoutHour ?? series.hours;
  let n = 0;
  for (let h = 0; h < to; h++) n += series.earthVisible[h];
  return n;
}

/** Every figure of All numbers with the settings behind it and the period in UTC, one row each. */
export function numbersCsv(x: ExportInput, provenance: Provenance): CsvFile {
  const { power: p, summary: s, params } = x;
  const lp = params.power;
  const pv = provenance;
  const withPower = p.firstBrownoutHour ?? s.hours;
  const full = batteryHours(lp);
  const rows: [string, string | number, string, string][] = [
    ['site_id', x.site.id, '', 'the site as the app names it in links'],
    ['site_name', pv.site.name, '', 'the site'],
    ['latitude_deg', fixed(x.site.lat, 5), 'deg', 'selenographic latitude (negative south)'],
    ['longitude_deg', fixed(x.site.lon, 5), 'deg', 'selenographic longitude (negative west)'],
    ['site_height_m', pv.terrain.siteHeightM === null ? '' : fixed(pv.terrain.siteHeightM, 1), 'm', "height above the Moon's mean radius"],
    ['period_start_utc', pv.period.startUtc, 'UTC', 'the landing hour: the first hour of the period'],
    ['period_end_utc', pv.period.endUtc, 'UTC', 'the hour after the last of the period'],
    ['period_days', x.days, 'd', 'the length of the period'],
    ['panel', lp.panel, '', 'how the panel stands: horizontal, vertical (fixed), vertical_tracking (turns to the Sun) or full_tracking'],
    ['panel_facing_deg', lp.panelAzimuthDeg, 'deg', 'where a fixed vertical panel faces, clockwise from north'],
    ['panel_area_m2', lp.areaM2, 'm2', 'the panel area'],
    ['panel_efficiency', lp.efficiency, 'fraction 0 to 1', 'the share of the sunlight the panel turns into power'],
    ['load_w', lp.loadW, 'W', 'what the lander uses, all the time'],
    ['battery_wh', lp.batteryWh, 'Wh', 'the battery capacity'],
    ['battery_at_landing_fraction', lp.initialSocFraction, 'fraction 0 to 1', 'the charge at the landing hour'],
    ['mast_m', pv.terrain.mastM, 'm', 'the height the Sun and Earth are seen from'],
    ['earth_min_clearance_deg', params.minEarthElDeg, 'deg', 'how far Earth must clear the skyline to count as in view'],
    ['sunlight_fraction', fixed(s.illumFraction, 4), 'fraction 0 to 1', 'share of the hours with any part of the Sun above the hills'],
    ['mean_sun_disc_in_view', fixed(s.meanSunFraction, 4), 'fraction 0 to 1', "the mean share of the Sun's disc in view"],
    ['longest_night_h', s.longestDarkH, 'h', 'the longest stretch with the Sun set'],
    ['earth_in_view_fraction', fixed(s.earthVisFraction, 4), 'fraction 0 to 1', 'share of the hours with Earth in view for a direct radio link'],
    ['longest_without_earth_h', s.longestEarthGapH, 'h', 'the longest stretch with Earth set'],
    ['sun_and_earth_fraction', fixed(s.jointFraction, 4), 'fraction 0 to 1', 'share of the hours with both'],
    ['time_with_power_h', withPower, 'h', 'from the landing until the battery first runs out (the whole period when it never does)'],
    ['radio_contact_while_powered_h', contactWhilePowered(x.series, p), 'h', 'hours with Earth in view before the battery first runs out'],
    ['time_without_power_h', p.brownoutHours, 'h', 'hours the lander is off in the period'],
    ['lowest_battery_fraction', fixed(p.socMin, 4), 'fraction 0 to 1', 'the lowest charge in the period'],
    ['mean_panel_power_w', fixed(p.meanPowerW, 2), 'W', "the panel's mean output over the period"],
    ['battery_hours_when_full', Number.isFinite(full) ? fixed(full, 2) : '', 'h', 'how long a full battery carries the load with no sunlight'],
    ['best_landing_utc', x.best ? `${etToIso(x.eph.t0Et + (x.series.i0 + x.best.hour) * x.eph.stepS)}Z` : '', 'UTC', 'the landing hour in the period with the longest time with power (empty when no hour is sunlit)'],
    ['best_landing_power_h', x.best ? fixed(x.best.poweredHours, 0) : '', 'h', 'time with power from that hour, up to the length of the period'],
    ['best_landing_earth_fraction', x.best ? fixed(x.best.earthFraction, 4) : '', 'fraction 0 to 1', 'share of those hours with Earth in view'],
    ['skyline', pv.terrain.kind, '', 'featured (precomputed file), computed (in the browser) or flat (outside the polar grids)'],
    ['skyline_missing_tiles', pv.terrain.missingTiles, '', 'elevation tiles that could not be loaded while the skyline was worked out'],
  ];
  return { name: `${fileStem(x.site.id, x.startUtc, x.days)}_numbers.csv`, columns: NUMBER_COLUMNS, text: table(NUMBER_COLUMNS, rows) };
}

/**
 * The file beside the tables: the settings, the versions, the sources and the assumptions that made them, the link that
 * opens them again, and every column of every table described. JSON, so a script reads it as readily as a person.
 */
export function aboutJson(x: ExportInput, provenance: Provenance, link: string, files: CsvFile[], generatedUtc: string): { name: string; text: string } {
  const lp = x.params.power;
  const doc = {
    format: 'earthrise-export',
    format_version: 1,
    generated_utc: generatedUtc,
    link,
    site: provenance.site,
    period: { start_utc: provenance.period.startUtc, end_utc: provenance.period.endUtc, days: provenance.period.days, hours: provenance.period.hours },
    settings: {
      panel: lp.panel,
      panel_facing_deg: lp.panelAzimuthDeg,
      panel_area_m2: lp.areaM2,
      panel_efficiency: lp.efficiency,
      load_w: lp.loadW,
      battery_wh: lp.batteryWh,
      battery_at_landing_fraction: lp.initialSocFraction,
      mast_m: x.params.mastM,
      earth_min_clearance_deg: x.params.minEarthElDeg,
    },
    skyline: provenance.terrain,
    ephemeris: provenance.ephemeris,
    assumptions: provenance.assumptions,
    versions: provenance.versions,
    files: files.map((f) => ({ name: f.name, columns: f.columns })),
  };
  return { name: `${fileStem(x.site.id, x.startUtc, x.days)}_about.json`, text: `${JSON.stringify(doc, null, 2)}\n` };
}
