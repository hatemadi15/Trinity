import { describe, expect, it } from 'vitest';
import { interpVectors, loadEphemeris, type EphemerisHeader } from '../engine/ephemeris';
import { azElFromBodyVector } from '../engine/geometry';
import { utcToEt } from '../engine/time';
import { readBytes, readJson } from '../engine/__tests__/helpers';
import { recheckSite } from './recheck';

const header = readJson<EphemerisHeader>('data', 'ephemeris', 'moon_me_2024_2036_1h.json');
const eph = loadEphemeris(readBytes('data', 'ephemeris', 'moon_me_2024_2036_1h.f32'), header);
const site = { lat: -80.13, lon: 1.44 };
const epochs = ['2026-01-01T00:00:00', '2026-02-22T03:00:00', '2026-04-15T06:00:00', '2026-06-06T09:00:00', '2026-07-28T12:00:00', '2026-09-18T15:00:00', '2026-11-09T18:00:00', '2026-12-31T21:00:00'];

function jplLikeResponse(): Response {
  const rows = epochs.map((utc) => {
    const { az, el } = azElFromBodyVector(interpVectors(eph, utcToEt(utc)).sun, site.lat, site.lon, 0);
    return { utc, az, el };
  });
  return new Response(JSON.stringify({ rows }), { status: 200, headers: { 'content-type': 'application/json' } });
}

describe('recheckSite', () => {
  it('agrees with our own numbers to 1e-6 when JPL returns them, and asks the proxy for the epochs', async () => {
    const urls: string[] = [];
    let signal: AbortSignal | null | undefined;
    const r = await recheckSite(site, 'SUN', epochs, eph, async (input: RequestInfo | URL, init?: RequestInit) => {
      urls.push(String(input));
      signal = init?.signal;
      return jplLikeResponse();
    });
    expect(signal).toBeInstanceOf(AbortSignal); // the proxy call itself times out, not only JPL
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.n).toBe(epochs.length);
      expect(r.worstEl).toBeLessThan(1e-6);
      expect(r.worstAzCosEl).toBeLessThan(1e-6);
      expect(r.ms).toBeGreaterThanOrEqual(0);
    }
    expect(urls[0]).toContain('/api/horizons?');
    expect(urls[0]).toContain('body=SUN');
    expect(urls[0]).toContain('step=7');
  });

  it('falls back with a message when the API fails or answers with an error, never throwing', async () => {
    const r = await recheckSite(site, 'SUN', epochs, eph, async () => {
      throw new Error('network down');
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/network down/);
    const r2 = await recheckSite(site, 'SUN', epochs, eph, async () => new Response(JSON.stringify({ error: 'JPL Horizons answered HTTP 503' }), { status: 502 }));
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.message).toMatch(/HTTP 503/);
  });
});
