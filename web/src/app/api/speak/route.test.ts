import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SPEECH_MAX_CHARS } from '@/lib/luna/limits';
import { GET, maxDuration, POST } from './route';

let ipCounter = 0;
function request(body: unknown, ip = `10.2.0.${++ipCounter}`): Request {
  return new Request('http://localhost/api/speak', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

/** Four samples, little-endian: 0, 1, -1 and 32767. */
const PCM = new Uint8Array([0x00, 0x00, 0x01, 0x00, 0xff, 0xff, 0xff, 0x7f]);
const geminiAudio = (mimeType = 'audio/L16;codec=pcm;rate=24000', pcm = PCM) =>
  vi.fn(async () =>
    new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ inlineData: { mimeType, data: Buffer.from(pcm).toString('base64') } }] }, finishReason: 'STOP' }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );
const word = (b: Uint8Array, at: number) => String.fromCharCode(...b.subarray(at, at + 4));
type Sent = { contents: { parts: { text: string }[] }[]; generationConfig: { responseModalities: string[]; speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: string } } } } };

beforeEach(() => {
  vi.stubEnv('GEMINI_API_KEY', 'AIza-test');
  vi.stubEnv('NEXT_PUBLIC_AI_MODE', 'live');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('POST /api/speak: a reply in Gemini’s voice', () => {
  it('asks the speech model for the words in the voice set, and answers a WAV wrapped round the PCM it gives', async () => {
    const fetchMock = geminiAudio();
    vi.stubGlobal('fetch', fetchMock);
    const res = await POST(request({ text: 'Opening the forecast.' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('audio/wav');
    expect(res.headers.get('cache-control')).toBe('no-store');
    const wav = new Uint8Array(await res.arrayBuffer());
    const v = new DataView(wav.buffer);
    expect([word(wav, 0), word(wav, 8), word(wav, 12), word(wav, 36)]).toEqual(['RIFF', 'WAVE', 'fmt ', 'data']);
    expect([v.getUint32(4, true), v.getUint16(20, true), v.getUint16(22, true), v.getUint32(24, true), v.getUint32(28, true), v.getUint16(34, true), v.getUint32(40, true)]).toEqual([
      44, 1, 1, 24_000, 48_000, 16, 8,
    ]);
    expect([...wav.subarray(44)]).toEqual([...PCM]);
    const [url, init] = (fetchMock.mock.calls as unknown as [string, RequestInit][])[0];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash-tts:generateContent');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('AIza-test');
    expect(url + String(init.body)).not.toContain('AIza-test');
    const body = JSON.parse(String(init.body)) as Sent;
    expect(body.contents[0].parts[0].text).toMatch(/: Opening the forecast\.$/);
    expect(body.generationConfig.responseModalities).toEqual(['AUDIO']);
    expect(body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Leda');
  });

  it('takes the model from GEMINI_TTS_MODEL and the voice from GEMINI_VOICE, and the rate from the type Gemini gives', async () => {
    vi.stubEnv('GEMINI_TTS_MODEL', 'gemini-2.5-flash-preview-tts');
    vi.stubEnv('GEMINI_VOICE', 'Aoede');
    const fetchMock = geminiAudio('audio/L16;codec=pcm;rate=16000');
    vi.stubGlobal('fetch', fetchMock);
    const res = await POST(request({ text: 'Turning to Earth.' }));
    const wav = new Uint8Array(await res.arrayBuffer());
    expect(new DataView(wav.buffer).getUint32(24, true)).toBe(16_000);
    const [url, init] = (fetchMock.mock.calls as unknown as [string, RequestInit][])[0];
    expect(url).toMatch(/\/models\/gemini-2\.5-flash-preview-tts:generateContent$/);
    expect((JSON.parse(String(init.body)) as Sent).generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Aoede');
  });

  it('passes on audio Gemini already wraps, with its own type', async () => {
    const mp3 = new Uint8Array([0x49, 0x44, 0x33, 1, 2, 3]);
    vi.stubGlobal('fetch', geminiAudio('audio/mpeg', mp3));
    const res = await POST(request({ text: 'Paused.' }));
    expect(res.headers.get('content-type')).toBe('audio/mpeg');
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([...mp3]);
  });

  it('says at once that speech is unavailable without a key, or in the offline build, and never calls Gemini', async () => {
    const fetchMock = geminiAudio();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('GEMINI_API_KEY', '');
    let res = await POST(request({ text: 'Playing.' }));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ reason: 'no-key' });
    expect((await GET()).status).toBe(503);
    vi.stubEnv('GEMINI_API_KEY', 'AIza-test');
    vi.stubEnv('NEXT_PUBLIC_AI_MODE', 'cached');
    res = await POST(request({ text: 'Playing.' }));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ reason: 'offline' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('says it is available, with the model and the voice, when a key is set', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ available: true, model: 'gemini-3.8-flash-tts', voice: 'Leda' });
  });

  it('answers 502 when Gemini fails or gives no audio, without the key or Gemini’s message, and logs why without the key', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { code: 429, message: 'Quota exceeded for AIza-test', status: 'RESOURCE_EXHAUSTED' } }), { status: 429, headers: { 'content-type': 'application/json' } })));
    let res = await POST(request({ text: 'Faster.' }));
    expect(res.status).toBe(502);
    const body = await res.text();
    expect(body).not.toContain('AIza-test');
    expect(JSON.parse(body)).toEqual({ error: 'Gemini gave no speech', upstream: 429 });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Hello!' }] }, finishReason: 'STOP' }] }), { status: 200 })));
    res = await POST(request({ text: 'Slower.' }));
    expect(res.status).toBe(502);
    const logged = info.mock.calls.map((c) => c.map(String).join(' ')).join('\n');
    expect(logged).toMatch(/speech failed: gemini-3\.8-flash-tts: HTTP 429 RESOURCE_EXHAUSTED/);
    expect(logged).toMatch(/no audio in the answer/);
    expect(logged).not.toContain('AIza-test');
  });

  it('gives Gemini at most AI_MODEL_TIMEOUT_MS', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.stubEnv('AI_MODEL_TIMEOUT_MS', '50');
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
    const t0 = Date.now();
    const res = await POST(request({ text: 'Looking up.' }));
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(res.status).toBe(502);
  });

  it('refuses text that is missing, empty or not text with 400, and text over the cap with 413, before asking Gemini', async () => {
    const fetchMock = geminiAudio();
    vi.stubGlobal('fetch', fetchMock);
    for (const bad of ['not json', {}, { text: '   ' }, { text: 42 }, [1]]) expect((await POST(request(bad))).status).toBe(400);
    expect((await POST(request({ text: 'x'.repeat(SPEECH_MAX_CHARS + 1) }))).status).toBe(413);
    expect((await POST(request({ text: 'x'.repeat(SPEECH_MAX_CHARS) }))).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps recent phrases, so the same words again are said without asking Gemini', async () => {
    const fetchMock = geminiAudio();
    vi.stubGlobal('fetch', fetchMock);
    const first = await POST(request({ text: 'Next moment.' }));
    const again = await POST(request({ text: '  Next moment. ' }));
    expect([first.status, again.status]).toEqual([200, 200]);
    expect([first.headers.get('x-speech-cache'), again.headers.get('x-speech-cache')]).toEqual(['miss', 'hit']);
    expect([...new Uint8Array(await again.arrayBuffer())]).toEqual([...new Uint8Array(await first.arrayBuffer())]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Another voice is another recording.
    vi.stubEnv('GEMINI_VOICE', 'Aoede');
    await POST(request({ text: 'Next moment.' }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('limits each address as the chat route does, with Retry-After', async () => {
    vi.stubGlobal('fetch', geminiAudio());
    const ip = '198.51.100.30';
    for (let i = 0; i < 30; i++) expect((await POST(request({ text: 'Replay.' }, ip))).status).toBe(200);
    const res = await POST(request({ text: 'Replay.' }, ip));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThanOrEqual(1);
    expect((await POST(request({ text: 'Replay.' }, '198.51.100.31'))).status).toBe(200);
  });

  it('caps the function duration', () => {
    expect(maxDuration).toBe(30);
  });
});
