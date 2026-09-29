import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

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
    expect(json.model).toBe('google/gemma-4-31b-it:free');
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
