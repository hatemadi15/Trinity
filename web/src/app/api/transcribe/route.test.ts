import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pcmToWav } from '@/lib/audio/wav';
import { AUDIO_MAX_BYTES, RECORDING_MAX_MS } from '@/lib/luna/limits';
import { GET, maxDuration, POST } from './route';

let ipCounter = 0;
function request(body: BodyInit | null, type: string | null = 'audio/wav', ip = `10.3.0.${++ipCounter}`, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/transcribe', {
    method: 'POST',
    headers: { ...(type ? { 'content-type': type } : {}), 'x-forwarded-for': ip, ...headers },
    body,
  });
}

const CLIP = new Uint8Array([82, 73, 70, 70, 36, 0, 0, 0, 87, 65, 86, 69]);
const heard = (text: string) =>
  vi.fn(async () =>
    new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify({ text }) }] }, finishReason: 'STOP' }] }), { status: 200, headers: { 'content-type': 'application/json' } }),
  );
type Sent = { contents: { parts: { text?: string; inlineData?: { mimeType: string; data: string } }[] }[]; generationConfig: { responseMimeType: string } };
const sentBody = (f: ReturnType<typeof vi.fn>) => JSON.parse(String((f.mock.calls as unknown as [string, RequestInit][])[0][1].body)) as Sent;

beforeEach(() => {
  vi.stubEnv('GEMINI_API_KEY', 'AIza-test');
  vi.stubEnv('NEXT_PUBLIC_AI_MODE', 'live');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('POST /api/transcribe: words from a recording, for browsers without speech recognition', () => {
  it('sends the recording to Gemini inline, as base64 with its type, and answers the words', async () => {
    const fetchMock = heard('compare de Gerlache Rim 2 and Nobile Rim 2');
    vi.stubGlobal('fetch', fetchMock);
    const res = await POST(request(CLIP));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: 'compare de Gerlache Rim 2 and Nobile Rim 2' });
    const [url, init] = (fetchMock.mock.calls as unknown as [string, RequestInit][])[0];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('AIza-test');
    expect(url + String(init.body)).not.toContain('AIza-test');
    const body = sentBody(fetchMock);
    expect(body.contents[0].parts[1].inlineData).toEqual({ mimeType: 'audio/wav', data: Buffer.from(CLIP).toString('base64') });
    // The catalogue's names, so Gemini writes them as the app does.
    expect(body.contents[0].parts[0].text).toMatch(/de Gerlache Rim 2/);
    expect(body.contents[0].parts[0].text).toMatch(/Malapert Massif/);
    expect(body.generationConfig.responseMimeType).toBe('application/json');
  });

  it('takes the recordings browsers make: Firefox’s Ogg Opus and Safari’s MP4 by their own types, WAV under any of its names', async () => {
    for (const [given, sent] of [
      ['audio/ogg;codecs=opus', 'audio/ogg'],
      ['audio/mp4', 'audio/mp4'],
      ['audio/webm;codecs=opus', 'audio/webm'],
      ['audio/x-wav', 'audio/wav'],
      ['audio/mpeg', 'audio/mp3'],
    ]) {
      const fetchMock = heard('play');
      vi.stubGlobal('fetch', fetchMock);
      expect((await POST(request(CLIP, given))).status, given).toBe(200);
      expect(sentBody(fetchMock).contents[0].parts[1].inlineData?.mimeType, given).toBe(sent);
    }
  });

  it('takes the model from GEMINI_TRANSCRIBE_MODEL', async () => {
    vi.stubEnv('GEMINI_TRANSCRIBE_MODEL', 'gemini-3.5-transcribe');
    const fetchMock = heard('play');
    vi.stubGlobal('fetch', fetchMock);
    await POST(request(CLIP));
    expect((fetchMock.mock.calls as unknown as [string][])[0][0]).toMatch(/\/models\/gemini-3\.5-transcribe:generateContent$/);
  });

  it('says at once that it is unavailable without a key, or in the offline build, never reading the audio or calling Gemini', async () => {
    const fetchMock = heard('play');
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('GEMINI_API_KEY', '');
    let res = await POST(request(CLIP));
    expect([res.status, ((await res.json()) as { reason: string }).reason]).toEqual([503, 'no-key']);
    expect((await GET()).status).toBe(503);
    vi.stubEnv('GEMINI_API_KEY', 'AIza-test');
    vi.stubEnv('NEXT_PUBLIC_AI_MODE', 'cached');
    res = await POST(request(CLIP));
    expect([res.status, ((await res.json()) as { reason: string }).reason]).toEqual([503, 'offline']);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('says it is available, with the model, when a key is set', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ available: true, model: 'gemini-3.5-flash-lite' });
  });

  it('refuses a type that is not audio with 415, an empty body with 400, and more than the cap with 413, by its header or by its bytes', async () => {
    const fetchMock = heard('play');
    vi.stubGlobal('fetch', fetchMock);
    expect((await POST(request(CLIP, 'text/plain'))).status).toBe(415);
    expect((await POST(request(CLIP, null))).status).toBe(415);
    expect((await POST(request(new Uint8Array(0)))).status).toBe(400);
    expect((await POST(request(CLIP, 'audio/wav', undefined, { 'content-length': String(AUDIO_MAX_BYTES + 1) }))).status).toBe(413);
    // A body longer than it says, or one sent in pieces without a length, is cut off at the cap all the same.
    let sentBytes = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        sentBytes += 64_000;
        c.enqueue(new Uint8Array(64_000));
        if (sentBytes > AUDIO_MAX_BYTES * 3) c.close();
      },
    });
    const res = await POST(new Request('http://localhost/api/transcribe', { method: 'POST', headers: { 'content-type': 'audio/wav', 'x-forwarded-for': '10.3.9.9' }, body: stream, duplex: 'half' } as RequestInit));
    expect(res.status).toBe(413);
    expect(sentBytes).toBeLessThan(AUDIO_MAX_BYTES * 2);
    expect((await POST(request(new Uint8Array(AUDIO_MAX_BYTES)))).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(AUDIO_MAX_BYTES).toBe(1_000_000);
  });

  it('refuses a WAV longer than a recording may last with 413, by its header', async () => {
    const fetchMock = heard('play');
    vi.stubGlobal('fetch', fetchMock);
    const seconds = (s: number) => pcmToWav(new Uint8Array(s * 32_000), 16_000);
    expect((await POST(request(seconds(17)))).status).toBe(413);
    expect((await POST(request(seconds(15)))).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(RECORDING_MAX_MS).toBe(15_000);
  });

  it('answers 502 when Gemini fails, without the key, and logs why', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { code: 500, message: 'Internal error for AIza-test', status: 'INTERNAL' } }), { status: 500, headers: { 'content-type': 'application/json' } })));
    const res = await POST(request(CLIP));
    expect(res.status).toBe(502);
    const body = await res.text();
    expect(JSON.parse(body)).toEqual({ error: 'Gemini gave no transcript', upstream: 500 });
    expect(body + info.mock.calls.flat().join(' ')).not.toContain('AIza-test');
    expect(info.mock.calls.flat().join(' ')).toMatch(/transcription failed: gemini-3\.5-flash-lite: HTTP 500 INTERNAL/);
  });

  it('gives Gemini at most AI_MODEL_TIMEOUT_MS', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.stubEnv('AI_MODEL_TIMEOUT_MS', '50');
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
    const t0 = Date.now();
    expect((await POST(request(CLIP))).status).toBe(502);
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  it('limits each address as the chat route does, before reading the audio', async () => {
    vi.stubGlobal('fetch', heard('play'));
    const ip = '198.51.100.40';
    for (let i = 0; i < 30; i++) expect((await POST(request(CLIP, 'audio/wav', ip))).status).toBe(200);
    const res = await POST(request(CLIP, 'audio/wav', ip));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThanOrEqual(1);
  });

  it('caps the function duration', () => {
    expect(maxDuration).toBe(30);
  });
});
