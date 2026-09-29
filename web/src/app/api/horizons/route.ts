import { BODY_IDS, horizonsUrl, parseHorizonsCsv, type HorizonsBody } from '@/lib/horizons/query';

export const dynamic = 'force-dynamic';

/** JPL answers most queries in a few seconds; the venue Wi-Fi gets this long before the page falls back to the stored table. */
const TIMEOUT_MS = 12_000;
const TIME_TOKEN = /^[0-9A-Za-z:.\- ]{1,32}$/;

/**
 * Proxies one Horizons observer-table query so the browser never talks to JPL directly (no CORS
 * surprises, one place to time out). Query: lat, lon, body=SUN|EARTH, start, stop, step.
 */
export async function GET(request: Request): Promise<Response> {
  const q = new URL(request.url).searchParams;
  const lat = Number(q.get('lat'));
  const lon = Number(q.get('lon'));
  const body = q.get('body') as HorizonsBody | null;
  const start = q.get('start') ?? '';
  const stop = q.get('stop') ?? '';
  const step = q.get('step') ?? '1';
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !body || !Object.hasOwn(BODY_IDS, body) || !TIME_TOKEN.test(start) || !TIME_TOKEN.test(stop) || !TIME_TOKEN.test(step)) {
    return Response.json({ error: 'lat, lon, body (SUN or EARTH), start and stop are required' }, { status: 400 });
  }
  const url = horizonsUrl(lat, lon, 0, BODY_IDS[body], start, stop, step);
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: 'application/json' } });
    if (!res.ok) return Response.json({ error: `JPL Horizons answered HTTP ${res.status}` }, { status: 502 });
    const json = (await res.json()) as { result?: string; error?: string };
    if (!json.result) return Response.json({ error: json.error ?? 'JPL Horizons returned no result' }, { status: 502 });
    return Response.json({ rows: parseHorizonsCsv(json.result), url });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: /abort|timeout/i.test(message) ? 504 : 502 });
  }
}
