import { afterEach, describe, expect, it, vi } from 'vitest';
import { maxDuration, POST } from './route';

type Reply = { source: string; model?: string; actions: unknown[]; reply: string; dropped?: string[]; error?: string; retryAfterS?: number };

let ipCounter = 0;
function request(body: unknown, ip = `10.0.0.${++ipCounter}`): Request {
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `${ip}, 203.0.113.9` },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const modelAnswer = (content: string) =>
  vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200, headers: { 'content-type': 'application/json' } }));

describe('POST /api/chat', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('answers from the model when the key is set and the reply is JSON in a code fence', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-test');
    vi.stubEnv('NEXT_PUBLIC_AI_MODE', 'live');
    const fetchMock = modelAnswer('```json\n{"actions":[{"type":"select_site","id":"nobile_rim_2"}],"reply":"Nobile Rim 2 selected."}\n```');
    vi.stubGlobal('fetch', fetchMock);
    const res = await POST(request({ prompt: 'Please pick the Nobile site for me', state: null }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as Reply;
    expect(json.source).toBe('model');
    expect(json.model).toBe('qwen/qwen3.8-27b:free');
    expect(json.actions).toEqual([{ type: 'select_site', id: 'nobile_rim_2' }]);
    expect(json.reply).toBe('Nobile Rim 2 selected.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = (fetchMock.mock.calls as unknown as [string, RequestInit][])[0][1];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
    expect(String(init.body)).not.toContain('sk-test');
  });

  it('drops invented sites from a model reply and says so', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-test');
    vi.stubGlobal('fetch', modelAnswer('{"actions":[{"type":"select_site","id":"shackleton_east_rim"}],"reply":"Selected Shackleton east rim."}'));
    const json = (await (await POST(request({ prompt: 'go to shackleton east rim', state: null }))).json()) as Reply;
    expect(json.source).toBe('model');
    expect(json.actions).toEqual([]);
    expect(json.dropped?.join(' ')).toMatch(/shackleton_east_rim/);
  });

  it('retries once when the model answers prose, then falls back to the intent matcher', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-test');
    const fetchMock = modelAnswer('I would be happy to show you Nobile Rim 2!');
    vi.stubGlobal('fetch', fetchMock);
    const json = (await (await POST(request({ prompt: 'show me nobile rim 2', state: null }))).json()) as Reply;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(json.source).toBe('intent');
    expect(json.actions).toEqual([{ type: 'select_site', id: 'nobile_rim_2' }]);
  });

  it('falls back to the cached transcript, then to a polite no-answer, never a 500', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-test');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 503 })));
    const cached = (await (await POST(request({ prompt: 'Which site should Artemis III pick?', state: null }))).json()) as Reply;
    expect(cached.source).toBe('cache');
    expect(cached.reply.length).toBeGreaterThan(20);
    const none = (await (await POST(request({ prompt: 'what is the meaning of life', state: null }))).json()) as Reply;
    expect(none.source).toBe('none');
    expect(none.actions).toEqual([]);
    expect(none.reply).toMatch(/could not/i);
  });

  it('uses cached transcripts in demo mode even with a key, and never calls the model', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-test');
    const fetchMock = modelAnswer('{"actions":[],"reply":"from the model"}');
    vi.stubGlobal('fetch', fetchMock);
    const json = (await (await POST(request({ prompt: 'Show me Nobile Rim 2', state: null, mode: 'cached' }))).json()) as Reply;
    expect(json.source).toBe('cache');
    expect(json.actions).toEqual([{ type: 'select_site', id: 'nobile_rim_2' }]);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.stubEnv('NEXT_PUBLIC_AI_MODE', 'cached');
    const env = (await (await POST(request({ prompt: 'Show me Nobile Rim 2', state: null }))).json()) as Reply;
    expect(env.source).toBe('cache');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('answers from intents and the cache without a key', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const json = (await (await POST(request({ prompt: 'compare de gerlache rim 2 and nobile rim 2', state: null }))).json()) as Reply;
    expect(json.source).toBe('intent');
    expect(json.actions).toHaveLength(3);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rate limits the 31st request in a minute from one address with Retry-After', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', '');
    vi.stubGlobal('fetch', vi.fn());
    const ip = '198.51.100.7';
    for (let i = 0; i < 30; i++) expect((await POST(request({ prompt: 'open compare', state: null }, ip))).status).toBe(200);
    const res = await POST(request({ prompt: 'open compare', state: null }, ip));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThanOrEqual(1);
    const json = (await res.json()) as Reply;
    expect(json.retryAfterS).toBeGreaterThanOrEqual(1);
    expect(json.error).toMatch(/too many/i);
    expect((await POST(request({ prompt: 'open compare', state: null }, '198.51.100.8'))).status).toBe(200);
  });

  it('rejects bodies without a usable prompt with 400', async () => {
    vi.stubGlobal('fetch', vi.fn());
    expect((await POST(request('not json'))).status).toBe(400);
    expect((await POST(request({ state: null }))).status).toBe(400);
    expect((await POST(request({ prompt: '' }))).status).toBe(400);
    expect((await POST(request({ prompt: 'x'.repeat(2001) }))).status).toBe(400);
    expect((await POST(request({ prompt: 'open compare', mode: 'turbo' }))).status).toBe(400);
  });
});

const STATE = {
  site: { id: 'nobile_rim_2', name: 'Nobile Rim 2 (Artemis III region)', lat: -84.20156, lon: 60.69989 },
  window: { startUtc: '2027-03-01T00:00:00', days: 14 },
  summary: { hours: 336, illumFraction: 1, meanSunFraction: 0.998, longestDarkH: 0, earthVisFraction: 0.67, longestEarthGapH: 225, jointFraction: 0.67 },
  power: { socMin: 1, brownoutHours: 0, survives: true, meanPowerW: 1118.4 },
  params: { power: { panel: 'vertical_tracking', panelAzimuthDeg: 0, areaM2: 4, efficiency: 0.3, loadW: 200, batteryWh: 2000, initialSocFraction: 1 }, minEarthElDeg: 0, mastM: 2 },
  compare: [],
  audience: 'planner',
};

describe('POST /api/chat task narrate', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('narrates from the model when every number in the paragraph is in the state', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-test');
    const text = 'Nobile Rim 2 sees the Sun 100 % of the time over these 14 days; Earth is in view 67 % of the time with a longest gap of 9 d 9 h, and the battery survives.';
    const fetchMock = modelAnswer(text);
    vi.stubGlobal('fetch', fetchMock);
    const json = (await (await POST(request({ task: 'narrate', prompt: 'write the brief', state: STATE }))).json()) as Reply;
    expect(json.source).toBe('model');
    expect(json.model).toBe('qwen/qwen3.8-27b:free');
    expect(json.reply).toBe(text);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries once on an invented number, then falls back to the template', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-test');
    const fetchMock = modelAnswer('The Sun is up 87 % of the time.');
    vi.stubGlobal('fetch', fetchMock);
    const json = (await (await POST(request({ task: 'narrate', prompt: 'write the brief', state: STATE }))).json()) as Reply;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(json.source).toBe('template');
    expect(json.reply).toMatch(/Nobile Rim 2/);
    expect(json.reply).toMatch(/100\.0 %/);
  });

  it('uses the template without a key or in cached mode, and needs a state', async () => {
    const fetchMock = modelAnswer('unused');
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('OPENROUTER_API_KEY', '');
    expect(((await (await POST(request({ task: 'narrate', prompt: 'x', state: STATE }))).json()) as Reply).source).toBe('template');
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-test');
    expect(((await (await POST(request({ task: 'narrate', prompt: 'x', state: STATE, mode: 'cached' }))).json()) as Reply).source).toBe('template');
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await POST(request({ task: 'narrate', prompt: 'x', state: null }))).status).toBe(400);
    expect((await POST(request({ task: 'sing', prompt: 'x', state: STATE }))).status).toBe(400);
  });
});

describe('POST /api/chat fallbacks and limits', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('repairs a truncated envelope and falls back to the intents on an empty one', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-test');
    const truncated = modelAnswer('{"actions":[{"type":"select_site","id":"nobile_rim_2"}],"reply":"Nobile Rim 2 is on the rim of Nobile crater and');
    vi.stubGlobal('fetch', truncated);
    let json = (await (await POST(request({ prompt: 'show me nobile rim 2', state: null }))).json()) as Reply;
    expect(truncated).toHaveBeenCalledTimes(1);
    expect(json.source).toBe('model');
    expect(json.actions).toEqual([{ type: 'select_site', id: 'nobile_rim_2' }]);
    expect(json.reply).toBe('Done.');
    expect(json.model).toBe('qwen/qwen3.8-27b:free');
    vi.stubGlobal('fetch', modelAnswer('{"actions":[],"reply":""}'));
    json = (await (await POST(request({ prompt: 'show me nobile rim 2', state: null }))).json()) as Reply;
    expect(json.source).toBe('intent');
  });

  it('strips invented numbers from a planner reply when the state is known', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-test');
    vi.stubGlobal(
      'fetch',
      modelAnswer('{"actions":[{"type":"select_site","id":"nobile_rim_2"}],"reply":"Selected Nobile Rim 2. It is sunlit 92 % of the time with a 310 h night. The Sun is above the skyline 100 % of the time."}'),
    );
    const json = (await (await POST(request({ prompt: 'show me nobile', state: STATE }))).json()) as Reply;
    expect(json.source).toBe('model');
    expect(json.actions).toEqual([{ type: 'select_site', id: 'nobile_rim_2' }]);
    expect(json.reply).not.toMatch(/92|310/);
    expect(json.reply).toMatch(/Selected Nobile Rim 2\./);
    expect(json.reply).toMatch(/100 %/);
  });

  it('answers from the fallbacks inside the model budget when every model hangs', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-test');
    vi.stubEnv('AI_MODEL_BUDGET_MS', '200');
    const hang = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal('fetch', hang);
    const t0 = Date.now();
    const json = (await (await POST(request({ prompt: 'open compare', state: null }))).json()) as Reply;
    expect(Date.now() - t0).toBeLessThan(3000);
    expect(json.source).toBe('intent');
    expect(hang.mock.calls.length).toBeLessThanOrEqual(4);
  });

  it('never answers 500 to a hostile narrate body', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-test');
    vi.stubGlobal('fetch', modelAnswer('unused'));
    const badPanel = { ...STATE, params: { ...STATE.params, power: { ...STATE.params.power, panel: 'constructor' } } };
    expect((await POST(request({ task: 'narrate', prompt: 'x', state: badPanel }))).status).toBe(400);
    expect((await POST(request({ task: 'narrate', prompt: 'x', state: { ...STATE, compare: [{}] } }))).status).toBe(400);
    const badRow = { ...STATE, compare: [{ id: 'x', name: 5, illumFraction: 'a', earthVisFraction: 0.1, survives: true }] };
    expect((await POST(request({ task: 'narrate', prompt: 'x', state: badRow }))).status).toBe(400);
  });

  it('caps the function duration', () => {
    expect(maxDuration).toBe(60);
  });

  it('says why a narration is the template', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 503 })));
    vi.stubEnv('OPENROUTER_API_KEY', '');
    let json = (await (await POST(request({ task: 'narrate', prompt: 'x', state: STATE }))).json()) as Reply & { reason?: string };
    expect([json.source, json.reason]).toEqual(['template', 'no-key']);
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-test');
    json = (await (await POST(request({ task: 'narrate', prompt: 'x', state: STATE, mode: 'cached' }))).json()) as Reply & { reason?: string };
    expect([json.source, json.reason]).toEqual(['template', 'cached']);
    json = (await (await POST(request({ task: 'narrate', prompt: 'x', state: STATE }))).json()) as Reply & { reason?: string };
    expect([json.source, json.reason]).toEqual(['template', 'model-error']);
    vi.stubGlobal('fetch', modelAnswer('The Sun is up 87 % of the time.'));
    json = (await (await POST(request({ task: 'narrate', prompt: 'x', state: STATE }))).json()) as Reply & { reason?: string };
    expect([json.source, json.reason]).toEqual(['template', 'numbers']);
  });
});
