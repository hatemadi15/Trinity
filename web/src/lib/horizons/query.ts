/** JPL Horizons observer-table queries for a lunar surface site (mirrors pipeline/lunar_pipeline/horizons.py). */

export const HORIZONS_API = 'https://ssd.jpl.nasa.gov/api/horizons.api';
export const BODY_IDS = { SUN: 10, EARTH: 399 } as const;
export type HorizonsBody = keyof typeof BODY_IDS;

export interface HorizonsRow {
  utc: string;
  az: number;
  el: number;
}

/** Python's float repr: integral values print with ".0", so the URL matches the pipeline's byte for byte. */
function pyFloat(x: number): string {
  return Number.isInteger(x) ? `${x}.0` : String(x);
}

/**
 * Horizons API URL for the topocentric azimuth/elevation (QUANTITIES 4, airless) of a body seen from
 * `lat`, `lon`, `altKm` on the Moon (`coord@301`), between `start` and `stop` every `step`.
 */
export function horizonsUrl(lat: number, lon: number, altKm: number, bodyId: number, start: string, stop: string, step: string): string {
  const params = new URLSearchParams([
    ['format', 'json'],
    ['COMMAND', `'${bodyId}'`],
    ['OBJ_DATA', "'NO'"],
    ['MAKE_EPHEM', "'YES'"],
    ['EPHEM_TYPE', "'OBSERVER'"],
    ['CENTER', "'coord@301'"],
    ['COORD_TYPE', "'GEODETIC'"],
    ['SITE_COORD', `'${pyFloat(lon)},${pyFloat(lat)},${pyFloat(altKm)}'`],
    ['START_TIME', `'${start}'`],
    ['STOP_TIME', `'${stop}'`],
    ['STEP_SIZE', `'${step}'`],
    ['QUANTITIES', "'4'"],
    ['APPARENT', "'AIRLESS'"],
    ['CSV_FORMAT', "'YES'"],
    ['TIME_TYPE', "'UT'"],
  ]);
  return `${HORIZONS_API}?${params.toString()}`;
}

const MONTHS: Record<string, string> = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
};
const ROW = /^\s*(\d{4})-([A-Za-z]{3})-(\d{2}) (\d{2}):(\d{2})/;
const NUMBER = /^[-+]?\d+(\.\d+)?$/;

/** Rows between $$SOE and $$EOE of a CSV observer table; the last two numeric fields are azimuth and elevation. */
export function parseHorizonsCsv(text: string): HorizonsRow[] {
  if (!text.includes('$$SOE') || !text.includes('$$EOE')) {
    throw new Error(`Horizons result has no $$SOE/$$EOE block: ${text.slice(0, 200)}`);
  }
  const body = text.split('$$SOE', 2)[1].split('$$EOE', 2)[0];
  const rows: HorizonsRow[] = [];
  for (const line of body.trim().split('\n')) {
    const m = ROW.exec(line);
    if (!m) continue;
    const fields = line.split(',').map((f) => f.trim());
    const numeric = fields.slice(1).filter((f) => NUMBER.test(f));
    if (numeric.length < 2) continue;
    const month = MONTHS[m[2]];
    if (!month) continue;
    rows.push({
      utc: `${m[1]}-${month}-${m[3]}T${m[4]}:${m[5]}:00`,
      az: Number(numeric[numeric.length - 2]),
      el: Number(numeric[numeric.length - 1]),
    });
  }
  if (rows.length === 0) throw new Error('Horizons result contained no ephemeris rows');
  return rows;
}
