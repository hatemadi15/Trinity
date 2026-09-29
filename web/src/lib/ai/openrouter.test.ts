import { describe, expect, it, vi } from 'vitest';
import { askModel, DEFAULT_MODELS, modelsFromEnv, OPENROUTER_URL } from './openrouter';

const ok = (content: string, model = 'm') =>
  new Response(JSON.stringify({ model, choices: [{ message: { role: 'assistant', content } }] }), { status: 200, headers: { 'content-type': 'application/json' } });

const messages = [
  { role: 'system' as const, content: 'You are a test.' },
  { role: 'user' as const, content: 'Say hi.' },
];

describe('askModel', () => {
  it('posts the OpenRouter request with the key, the app headers, temperature 0 and the token cap', async () => {
    const fetchImpl = vi.fn(async () => ok('hi'));
    const r = await askModel({ messages, models: ['a/one:free'], apiKey: 'sk-test', fetchImpl });
    expect(r).toEqual({ model: 'a/one:free', content: 'hi' });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(OPENROUTER_URL);
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer sk-test');
    expect(headers['HTTP-Referer']).toBe('https://github.com/hatemadi15/Trinity');
    expect(headers['X-Title']).toBe('Earthrise');
    const body = JSON.parse(String(init.body)) as { model: string; messages: unknown[]; temperature: number; max_tokens: number };
    expect(body).toEqual({ model: 'a/one:free', messages, temperature: 0, max_tokens: 600 });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('moves to the next model on 429 and 5xx and reports the model that answered', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('slow down', { status: 429 }))
      .mockResolvedValueOnce(new Response('boom', { status: 502 }))
      .mockResolvedValueOnce(ok('third time'));
    const r = await askModel({ messages, models: ['a/one:free', 'b/two:free', 'c/three:free'], apiKey: 'k', fetchImpl });
    expect(r).toEqual({ model: 'c/three:free', content: 'third time' });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('returns an error naming every failure when all models fail, and never throws', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('no', { status: 503 }))
      .mockRejectedValueOnce(new Error('getaddrinfo ENOTFOUND openrouter.ai'))
      .mockResolvedValueOnce(ok(''));
    const r = await askModel({ messages, models: ['a/one:free', 'b/two:free', 'c/three:free'], apiKey: 'k', fetchImpl });
    expect('error' in r).toBe(true);
    const error = (r as { error: string }).error;
    expect(error).toMatch(/a\/one:free.*503/);
    expect(error).toMatch(/ENOTFOUND/);
    expect(error).toMatch(/c\/three:free.*empty/);
  });

  it('honours the timeout even when the transport never settles', async () => {
    const fetchImpl = vi.fn(() => new Promise<Response>(() => {}));
    const t0 = Date.now();
    const r = await askModel({ messages, models: ['a/one:free'], apiKey: 'k', timeoutMs: 50, fetchImpl });
    expect(Date.now() - t0).toBeLessThan(2000);
    expect((r as { error: string }).error).toMatch(/timed out/);
  });

  it('reads the model chain from OPENROUTER_MODELS or falls back to the four free models', () => {
    expect(modelsFromEnv({})).toEqual(DEFAULT_MODELS);
    expect(DEFAULT_MODELS).toEqual(['qwen/qwen3.8-27b:free', 'nvidia/nemotron-3-super-120b-a12b:free', 'google/gemma-4-31b-it:free', 'nvidia/nemotron-3.5-lightning:free']);
    expect(modelsFromEnv({ OPENROUTER_MODELS: ' x/y:free, z/w ' })).toEqual(['x/y:free', 'z/w']);
    expect(modelsFromEnv({ OPENROUTER_MODELS: '' })).toEqual(DEFAULT_MODELS);
  });
});

describe('askModel budget', () => {
  it('stays inside a total budget across the chain', async () => {
    const fetchImpl = vi.fn(() => new Promise<Response>(() => {}));
    const t0 = Date.now();
    const r = await askModel({ messages, models: ['a', 'b', 'c', 'd'], apiKey: 'k', timeoutMs: 50, budgetMs: 120, fetchImpl });
    expect(Date.now() - t0).toBeLessThan(1000);
    expect('error' in r).toBe(true);
    expect(fetchImpl.mock.calls.length).toBeLessThanOrEqual(3);
    expect((r as { error: string }).error).toMatch(/timed out|budget/);
  });
});
