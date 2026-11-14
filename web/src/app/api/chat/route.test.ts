import { afterEach, describe, expect, it, vi } from 'vitest';
import { matchIntent } from '@/lib/ai/intents';
import catalogue from '@/lib/data/catalogue.json';
import type { Site } from '@/lib/data/loaders';
import { maxDuration, POST } from './route';

type Reply = { source: string; reason?: string; model?: string; actions: unknown[]; reply: string; dropped?: string[]; error?: string; retryAfterS?: number };

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
    // Without a key only the app's own phrasings answer, so a question outside them is not understood.
    vi.stubEnv('OPENROUTER_API_KEY', '');
    const none = (await (await POST(request({ prompt: 'what is the meaning of life', state: null }))).json()) as Reply;
    expect(none.source).toBe('none');
    expect(none.reason).toBe('not-understood');
    expect(none.actions).toEqual([]);
    expect(none.reply).toMatch(/^I could not understand that\. Try: /);
    // Every suggestion is one the app answers without the model, in the words the pages use.
    const tries = [...none.reply.matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    expect(tries.length).toBe(5);
    for (const t of tries) expect(matchIntent(t, catalogue.sites as Site[]), t).not.toBeNull();
    expect(none.reply).not.toMatch(/window/i);
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
  site: { id: 'nobile_rim_2', name: 'Nobile Rim 2 (Artemis III region)', label: 'Nobile Rim 2', lat: -84.20156, lon: 60.69989 },
  window: { startUtc: '2027-03-01T00:00:00', days: 14 },
  summary: { hours: 336, illumFraction: 1, meanSunFraction: 0.998, longestDarkH: 0, earthVisFraction: 0.67, longestEarthGapH: 225, jointFraction: 0.67 },
  power: { socMin: 1, brownoutHours: 0, survives: true, meanPowerW: 1118.4, poweredHours: 336, contactHours: 225 },
  params: { power: { panel: 'vertical_tracking', panelAzimuthDeg: 0, areaM2: 4, efficiency: 0.3, loadW: 200, batteryWh: 2000, initialSocFraction: 1 }, minEarthElDeg: 0, mastM: 2 },
  compare: [],
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
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-test');
    const fetchMock = modelAnswer('The Sun is up 87 % of the time.');
    vi.stubGlobal('fetch', fetchMock);
    const json = (await (await POST(request({ task: 'narrate', prompt: 'write the brief', state: STATE }))).json()) as Reply;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(json.source).toBe('template');
    expect(json.reply).toMatch(/Nobile Rim 2/);
    expect(json.reply).toMatch(/100\u00a0%/);
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

/** A model that gives these answers in turn, the last one again after that. */
const modelAnswers = (...contents: string[]) => {
  let i = 0;
  return vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: contents[Math.min(i++, contents.length - 1)] } }] }), { status: 200, headers: { 'content-type': 'application/json' } }));
};

describe('POST /api/chat narrate: each claim checked against the state', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('falls back to the template, and says why, when a number in the state sits on the wrong measure', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-test');
    // 67 % is Earth in view in this state; sunlight is 100 %. The old check let this through.
    const fetchMock = modelAnswer('Nobile Rim 2 sees the Sun 67 % of the time over these 14 days.');
    vi.stubGlobal('fetch', fetchMock);
    const json = (await (await POST(request({ task: 'narrate', prompt: 'x', state: STATE }))).json()) as Reply & { problems?: string[] };
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect([json.source, json.reason]).toEqual(['template', 'numbers']);
    expect(json.reply).toMatch(/^Nobile Rim 2 \(84\.202°S, 60\.700°E\)/);
    expect(json.problems?.[0]).toMatch(/"67 %" for sunlight, where the figures say 100 %/);
  });

  it('falls back to the template on a cause the figures do not give', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-test');
    vi.stubGlobal('fetch', modelAnswer('Nobile Rim 2 keeps power for all 14 days because it sits high on the crater rim.'));
    const json = (await (await POST(request({ task: 'narrate', prompt: 'x', state: STATE }))).json()) as Reply & { problems?: string[] };
    expect([json.source, json.reason]).toEqual(['template', 'numbers']);
    expect(json.problems?.join(' ')).toMatch(/"because", a cause the figures do not give/);
  });

  it('names what failed in the retry, and takes a corrected paragraph', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-test');
    const good = 'Nobile Rim 2 sees the Sun 100 % of the time over these 14 days, and Earth is in view 67 % of the time.';
    const fetchMock = modelAnswers('Nobile Rim 2 sees the Sun 67 % of the time, at 84.2°N.', good);
    vi.stubGlobal('fetch', fetchMock);
    const json = (await (await POST(request({ task: 'narrate', prompt: 'x', state: STATE }))).json()) as Reply;
    expect([json.source, json.reply]).toEqual(['model', good]);
    const retry = JSON.parse(String((fetchMock.mock.calls as unknown as [string, RequestInit][])[1][1].body)) as { messages: { role: string; content: string }[] };
    const nudge = retry.messages[retry.messages.length - 1].content;
    expect(nudge).toMatch(/"67 %" for sunlight, where the figures say 100 %/);
    expect(nudge).toMatch(/"84\.2°N" for the latitude, where the figures say 84\.202°S/);
  });

  it('names a site outside the state as a failure, from the catalogue', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-test');
    vi.stubGlobal('fetch', modelAnswer('Nobile Rim 2 sees the Sun 100 % of the time, more than Malapert Massif.'));
    const json = (await (await POST(request({ task: 'narrate', prompt: 'x', state: STATE }))).json()) as Reply & { problems?: string[] };
    expect(json.source).toBe('template');
    expect(json.problems?.join(' ')).toMatch(/"Malapert Massif", a site the figures do not cover/);
  });

  it('drops a planner sentence that puts a figure on the wrong measure or gives figures for a site outside the state', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-test');
    vi.stubGlobal('fetch', modelAnswer('{"actions":[{"type":"select_site","id":"malapert_massif"}],"reply":"Selected Malapert Massif. It is sunlit 67 % of the time. Nobile Rim 2 is sunlit 67 % of the time."}'));
    const json = (await (await POST(request({ prompt: 'show me malapert', state: STATE }))).json()) as Reply;
    expect(json.source).toBe('model');
    expect(json.reply).toBe('Selected Malapert Massif.');
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

  it('every model failing gives the busy text and reason', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-test');
    const busy = vi.fn(async () => new Response(JSON.stringify({ error: { message: 'Rate limit exceeded: free-models-per-min' } }), { status: 429 }));
    vi.stubGlobal('fetch', busy);
    const json = (await (await POST(request({ prompt: 'what is the meaning of life', state: null }))).json()) as Reply;
    expect(busy).toHaveBeenCalledTimes(4); // every model in the chain was asked once
    expect(json.source).toBe('none');
    expect(json.reason).toBe('model-busy');
    expect(json.actions).toEqual([]);
    expect(json.reply).toMatch(/^The language model did not answer just now, so only set phrasings work\. Try: /);
    // The same suggestions as the not-understood reply: each one answered without the model.
    const tries = [...json.reply.matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    expect(tries.length).toBe(5);
    for (const t of tries) expect(matchIntent(t, catalogue.sites as Site[]), t).not.toBeNull();
  });

  it('AI_MODEL_TIMEOUT_MS is read', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-test');
    vi.stubEnv('AI_MODEL_BUDGET_MS', '2000');
    vi.stubEnv('AI_MODEL_TIMEOUT_MS', '50');
    const hang = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal('fetch', hang);
    const json = (await (await POST(request({ prompt: 'what is the meaning of life', state: null }))).json()) as Reply;
    // 50 ms a model leaves room in the first answer's 1.6 s for the whole chain; the default 10 s would spend it on one.
    expect(hang).toHaveBeenCalledTimes(4);
    expect(json.reason).toBe('model-busy');
    const brief = (await (await POST(request({ task: 'narrate', prompt: 'x', state: STATE }))).json()) as Reply;
    expect(brief.reason).toBe('model-error');
    expect(hang).toHaveBeenCalledTimes(8);
  });

  it('caps the function duration', () => {
    expect(maxDuration).toBe(60);
  });

  it('says why a narration is the template', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
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

describe('POST /api/chat number rules', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("keeps the user's own numbers and the window lengths in a planner reply", async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-test');
    vi.stubGlobal('fetch', modelAnswer('{"actions":[{"type":"set_power","patch":{"loadW":350}}],"reply":"Load set to 350 W for the next 90 days. The Sun is up 92 % of the time."}'));
    const json = (await (await POST(request({ prompt: 'set the load to 350 W', state: STATE }))).json()) as Reply;
    expect(json.source).toBe('model');
    expect(json.reply).toBe('Load set to 350 W for the next 90 days.');
  });

  it('logs the numbers a narration was rejected for, and never the key', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-test');
    vi.stubGlobal('fetch', modelAnswer('The Sun is up 87 % of the time.'));
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const json = (await (await POST(request({ task: 'narrate', prompt: 'x', state: STATE }))).json()) as Reply & { reason?: string };
    expect(json.reason).toBe('numbers');
    const logged = info.mock.calls.map((c) => c.map(String).join(' ')).join('\n');
    expect(logged).toMatch(/narration/);
    expect(logged).toMatch(/87/);
    expect(logged).not.toMatch(/sk-test/);
  });
});

describe('POST /api/chat state size', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('ignores a state larger than 16 KB instead of putting it in the model prompt', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-test');
    const fetchMock = modelAnswer('{"actions":[],"reply":"Hello."}');
    vi.stubGlobal('fetch', fetchMock);
    const huge = { ...STATE, compare: [{ id: 'x', name: 'y'.repeat(20_000), illumFraction: 0.5, earthVisFraction: 0.5, survives: true }] };
    const res = await POST(request({ prompt: 'hello there', state: huge }));
    expect(res.status).toBe(200);
    const body = String((fetchMock.mock.calls as unknown as [string, RequestInit][])[0][1].body);
    expect(body).not.toContain('y'.repeat(100));
    expect(body).toMatch(/No site is selected yet/);
  });
});
