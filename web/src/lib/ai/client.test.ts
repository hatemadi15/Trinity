import { describe, expect, it, vi } from 'vitest';
import { askNarration, askPlanner } from './client';

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

describe('askPlanner', () => {
  it('posts the prompt, the state and the mode to /api/chat and returns the reply', async () => {
    const reply = { source: 'model', model: 'google/gemma-4-31b-it:free', actions: [{ type: 'open_page', page: 'compare' }], reply: 'Opening Compare.' };
    const fetchImpl = vi.fn(async () => json(reply));
    const state = { site: { id: 'haworth', name: 'Haworth', lat: -86.84, lon: -22.59 } };
    const r = await askPlanner('open compare', state as never, 'cached', fetchImpl);
    expect(r).toEqual(reply);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/chat');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ prompt: 'open compare', state, mode: 'cached' });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('turns a 429 into a reply that says when to try again', async () => {
    const r = await askPlanner('hi', null, 'live', async () => json({ error: 'Too many questions from this address; try again in 12 s', retryAfterS: 12 }, 429, { 'Retry-After': '12' }));
    expect(r.source).toBe('none');
    expect(r.actions).toEqual([]);
    expect(r.reply).toMatch(/Too many questions; try again in 12 s/);
    expect(r.retryAfterS).toBe(12);
  });

  it('rejects on other failures with the server message, and on a malformed body', async () => {
    await expect(askPlanner('hi', null, 'live', async () => json({ error: 'prompt is required' }, 400))).rejects.toThrow(/prompt is required/);
    await expect(askPlanner('hi', null, 'live', async () => new Response('gateway', { status: 502 }))).rejects.toThrow(/502/);
    await expect(askPlanner('hi', null, 'live', async () => json({ hello: 'world' }))).rejects.toThrow(/unexpected/i);
    await expect(
      askPlanner('hi', null, 'live', async () => {
        throw new Error('Failed to fetch');
      }),
    ).rejects.toThrow(/Failed to fetch/);
  });
});

describe('askNarration', () => {
  it('posts the narrate task with the state and returns the paragraph and its source', async () => {
    const fetchImpl = vi.fn(async () => json({ source: 'model', model: 'google/gemma-4-31b-it:free', reply: 'A paragraph.' }));
    const state = { site: { id: 'haworth', name: 'Haworth', lat: -86.84, lon: -22.59 } };
    const r = await askNarration(state as never, 'live', fetchImpl);
    expect(r).toEqual({ source: 'model', model: 'google/gemma-4-31b-it:free', reply: 'A paragraph.' });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({ task: 'narrate', state, mode: 'live' });
  });

  it('rejects on failures', async () => {
    await expect(askNarration({} as never, 'live', async () => new Response('busy', { status: 429 }))).rejects.toThrow(/429/);
    await expect(askNarration({} as never, 'live', async () => json({ nope: true }))).rejects.toThrow(/unexpected/i);
  });
});
