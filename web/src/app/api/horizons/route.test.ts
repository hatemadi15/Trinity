import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const BODY = {
  result: `$$SOE\n 2025-Jan-01 00:00,     ,*m, 160.569358,  -7.795780,\n 2025-Jan-02 00:00,     ,  , 170.000000,  -6.000000,\n$$EOE`,
};

function request(query: string): Request {
  return new Request(`http://localhost/api/horizons?${query}`);
}

describe('GET /api/horizons', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('proxies a Horizons query and returns parsed rows', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(BODY), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await GET(request('lat=-80.13&lon=1.44&body=SUN&start=2025-01-01&stop=2025-01-03&step=1'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { rows: { utc: string; az: number; el: number }[] };
    expect(json.rows).toHaveLength(2);
    expect(json.rows[0]).toEqual({ utc: '2025-01-01T00:00:00', az: 160.569358, el: -7.79578 });
    const calledUrl = String((fetchMock.mock.calls as unknown as unknown[][])[0][0]);
    expect(calledUrl).toContain('ssd.jpl.nasa.gov/api/horizons.api');
    expect(calledUrl).toContain('COMMAND=%2710%27');
  });

  it('rejects missing or invalid parameters with 400', async () => {
    vi.stubGlobal('fetch', vi.fn());
    expect((await GET(request('lat=-80&lon=1&body=MARS&start=2025-01-01&stop=2025-01-02&step=1'))).status).toBe(400);
    expect((await GET(request('lat=abc&lon=1&body=SUN&start=2025-01-01&stop=2025-01-02&step=1'))).status).toBe(400);
    expect((await GET(request('lat=-80&lon=1&body=SUN'))).status).toBe(400);
  });

  it('reports an unreachable or failing JPL service as 502 with a message, never throwing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('getaddrinfo ENOTFOUND ssd.jpl.nasa.gov'); }));
    const res = await GET(request('lat=-80.13&lon=1.44&body=SUN&start=2025-01-01&stop=2025-01-03&step=1'));
    expect(res.status).toBe(502);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/ENOTFOUND/);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('busy', { status: 503 })));
    expect((await GET(request('lat=-80.13&lon=1.44&body=SUN&start=2025-01-01&stop=2025-01-03&step=1'))).status).toBe(502);
  });
});
