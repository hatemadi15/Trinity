import { describe, expect, it } from 'vitest';
import { readJson } from '../engine/__tests__/helpers';
import { horizonsUrl, parseHorizonsCsv } from './query';

interface Fixture {
  site_id: string;
  body: string;
  lat: number;
  lon: number;
  alt_km: number;
  query_url: string;
  rows: { utc: string; az: number; el: number }[];
}

const SAMPLE = `*******************************************************************************
$$SOE
 2025-Jan-01 00:00,     ,*m, 160.569358,  -7.795780,
 2025-Jan-31 00:00,     ,  , 226.128702,  12.086047,
 2025-Mar-02 00:00,     ,*m, 292.345678,   1.000000,
$$EOE
*******************************************************************************`;

describe('horizonsUrl', () => {
  it('reproduces the pipeline query URL byte for byte', () => {
    const fx = readJson<Fixture>('data', 'fixtures', 'horizons', 'im1_odysseus_sun.json');
    const url = horizonsUrl(fx.lat, fx.lon, fx.alt_km, 10, '2025-01-01', '2027-01-01', '30d');
    expect(url).toBe(fx.query_url);
    const earth = readJson<Fixture>('data', 'fixtures', 'horizons', 'im1_odysseus_earth.json');
    expect(horizonsUrl(earth.lat, earth.lon, earth.alt_km, 399, '2025-01-01', '2027-01-01', '30d')).toBe(earth.query_url);
  });
});

describe('parseHorizonsCsv', () => {
  it('reads the rows between $$SOE and $$EOE, taking the last two numbers as azimuth and elevation', () => {
    const rows = parseHorizonsCsv(SAMPLE);
    expect(rows).toEqual([
      { utc: '2025-01-01T00:00:00', az: 160.569358, el: -7.79578 },
      { utc: '2025-01-31T00:00:00', az: 226.128702, el: 12.086047 },
      { utc: '2025-03-02T00:00:00', az: 292.345678, el: 1 },
    ]);
  });
  it('throws on a result without an ephemeris block or without rows', () => {
    expect(() => parseHorizonsCsv('no data here')).toThrow(/\$\$SOE/);
    expect(() => parseHorizonsCsv('$$SOE\n\n$$EOE')).toThrow(/no ephemeris rows/);
  });
});
