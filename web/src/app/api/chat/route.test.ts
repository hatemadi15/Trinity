import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

// Gemini is asked only where a test sets its key, whatever the shell running the tests holds.
beforeEach(() => {
  vi.stubEnv('GEMINI_API_KEY', '');
});

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
    expect(json.model).toBe('particle-ai/particle-1:free');
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
    expect(json.actions).toEqual([{ type: 'compare_sites', ids: ['de_gerlache_rim_2', 'nobile_rim_2'] }]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('acts on a comparison its phrasings read for certain before asking any model, and leaves the rest to the model', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-test');
    const fetchMock = modelAnswer('{"actions":[{"type":"select_site","id":"nobile_rim_2"}],"reply":"Nobile Rim 2 selected."}');
    vi.stubGlobal('fetch', fetchMock);
    const all = (await (await POST(request({ prompt: 'Compare this to every landing site', state: null }))).json()) as Reply;
    expect(all).toMatchObject({ source: 'intent', actions: [{ type: 'compare_best' }] });
    const one = (await (await POST(request({ prompt: 'how does this compare to Nobile Rim 1?', state: null }))).json()) as Reply;
    expect(one).toMatchObject({ source: 'intent', actions: [{ type: 'compare_sites', ids: ['nobile_rim_1'], shown: true }] });
    const two = (await (await POST(request({ prompt: 'compare de Gerlache Rim 2 versus Nobile Rim 1', state: null }))).json()) as Reply;
    expect(two).toMatchObject({ source: 'intent', actions: [{ type: 'compare_sites', ids: ['de_gerlache_rim_2', 'nobile_rim_1'] }] });
    expect(fetchMock).not.toHaveBeenCalled();
    // A comparison whose site is not found, and any other phrasing, still go to the model first.
    expect(((await (await POST(request({ prompt: 'compare this to the crater with the ice', state: null }))).json()) as Reply).source).toBe('model');
    expect(((await (await POST(request({ prompt: 'show me nobile rim 2', state: null }))).json()) as Reply).source).toBe('model');
  });

  it('tells the model of the comparisons, and keeps the ones it proposes when they fit', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-test');
    const fetchMock = modelAnswer('{"actions":[{"type":"compare_best"}],"reply":"Ranking the sites for you."}');
    vi.stubGlobal('fetch', fetchMock);
    const json = (await (await POST(request({ prompt: 'where else could we put the lander down for these dates', state: null }))).json()) as Reply;
    expect(json).toMatchObject({ source: 'model', actions: [{ type: 'compare_best' }] });
    const body = JSON.parse(String((fetchMock.mock.calls as unknown as [string, RequestInit][])[0][1].body)) as { messages: { content: string }[] };
    expect(body.messages[0].content).toContain('{"type": "compare_sites", "ids": [SITE_ID, ...], "shown": true | false}');
    expect(body.messages[0].content).toContain('{"type": "compare_best"}');
    vi.stubGlobal('fetch', modelAnswer('{"actions":[{"type":"compare_sites","ids":["haworth","atlantis"],"shown":true}],"reply":"Comparing."}'));
    const bad = (await (await POST(request({ prompt: 'put this next to haworth and atlantis', state: null }))).json()) as Reply;
    expect(bad.actions).toEqual([]);
    expect(bad.reply).toMatch(/could not find "atlantis"/);
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
    const text = 'Nobile Rim 2 sees the Sun 100 % of the time over these 14 days; Earth is in view 67 % of the time with a longest gap of 9 d 9 h, and the lander keeps power for all 14 days.';
    const fetchMock = modelAnswer(text);
    vi.stubGlobal('fetch', fetchMock);
    const json = (await (await POST(request({ task: 'narrate', prompt: 'write the brief', state: STATE }))).json()) as Reply;
    expect(json.source).toBe('model');
    expect(json.model).toBe('particle-ai/particle-1:free');
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

  it('falls back to the template when the paragraph says the battery survives: the figures count electrical energy only', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-test');
    const fetchMock = modelAnswer('Nobile Rim 2 sees the Sun 100 % of the time over these 14 days, so the battery survives the night.');
    vi.stubGlobal('fetch', fetchMock);
    const json = (await (await POST(request({ task: 'narrate', prompt: 'x', state: STATE }))).json()) as Reply & { problems?: string[] };
    expect([json.source, json.reason]).toEqual(['template', 'numbers']);
    expect(json.problems?.[0]).toMatch(/"survives", a survival claim: the figures count electrical energy only/);
    // The model is told so, and its copy of the state names the flag for power lasting the whole period.
    const sent = JSON.parse(String((fetchMock.mock.calls as unknown as [string, RequestInit][])[0][1].body)) as { messages: { content: string }[] };
    expect(sent.messages[0].content).toMatch(/electrical energy only/);
    expect(sent.messages[1].content).not.toMatch(/surviv/i);
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
    expect(json.model).toBe('particle-ai/particle-1:free');
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

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent';
type Answer = () => Response | Promise<Response>;
const geminiSays = (text: string): Answer => () =>
  new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
const openrouterSays = (content: string): Answer => () => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
const fails = (status: number): Answer => () => new Response('no', { status });

/** Gemini and OpenRouter answering as a test says, with who was asked, in turn, and what each was sent. */
function network(o: { gemini?: Answer | Answer[]; openrouter?: Answer }) {
  const asked: string[] = [];
  const bodies: { to: string; url: string; headers: Record<string, string>; body: Record<string, unknown> }[] = [];
  let g = 0;
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    const headers = init?.headers as Record<string, string>;
    if (String(url).startsWith('https://generativelanguage.googleapis.com/')) {
      asked.push('gemini');
      bodies.push({ to: 'gemini', url, headers, body });
      const list = Array.isArray(o.gemini) ? o.gemini : [o.gemini ?? fails(500)];
      return list[Math.min(g++, list.length - 1)]();
    }
    if (url === OPENROUTER_URL) {
      asked.push(`openrouter ${String(body.model)}`);
      bodies.push({ to: 'openrouter', url, headers, body });
      return (o.openrouter ?? fails(500))();
    }
    throw new Error(`unexpected request to ${url}`);
  });
  return { asked, bodies, fetchMock };
}
const NOBILE = '{"actions":[{"type":"select_site","id":"nobile_rim_2"}],"reply":"Nobile Rim 2 selected."}';
const CHAIN = ['particle-ai/particle-1:free', 'nvidia/nemotron-3.5-lightning:free', 'cohere/north-mini-code:free', 'nvidia/nemotron-3.5-super-vl:free'].map((m) => `openrouter ${m}`);

describe('POST /api/chat with Gemini as a provider: who asks decides the order', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });
  const bothKeys = () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-test');
    vi.stubEnv('GEMINI_API_KEY', 'AIza-test');
  };

  it('asks OpenRouter first for Luna too, as for every text question, and leaves Gemini to her voice', async () => {
    bothKeys();
    const { asked, fetchMock } = network({ gemini: geminiSays(NOBILE), openrouter: openrouterSays(NOBILE) });
    vi.stubGlobal('fetch', fetchMock);
    const json = (await (await POST(request({ prompt: 'please pick the Nobile site for me', state: null, from: 'luna' }))).json()) as Reply;
    expect(asked).toEqual([CHAIN[0]]);
    expect([json.source, json.model]).toEqual(['model', 'particle-ai/particle-1:free']);
    expect(json.actions).toEqual([{ type: 'select_site', id: 'nobile_rim_2' }]);
    expect(json.reply).toBe('Nobile Rim 2 selected.');
  });

  it('goes on to Gemini for Luna only when every OpenRouter model failed, and names Gemini as the model that answered', async () => {
    bothKeys();
    const { asked, fetchMock } = network({ gemini: geminiSays(NOBILE), openrouter: fails(429) });
    vi.stubGlobal('fetch', fetchMock);
    const json = (await (await POST(request({ prompt: 'please pick the Nobile site for me', state: null, from: 'luna' }))).json()) as Reply;
    expect(asked).toEqual([...CHAIN, 'gemini']);
    expect([json.source, json.model]).toEqual(['model', 'gemini-3.5-flash-lite']);
    expect(json.actions).toEqual([{ type: 'select_site', id: 'nobile_rim_2' }]);
  });

  it('keeps OpenRouter first for "Ask in plain words", and asks Gemini only after every OpenRouter model failed', async () => {
    bothKeys();
    let net = network({ gemini: geminiSays(NOBILE), openrouter: openrouterSays(NOBILE) });
    vi.stubGlobal('fetch', net.fetchMock);
    let json = (await (await POST(request({ prompt: 'please pick the Nobile site for me', state: null }))).json()) as Reply;
    expect(net.asked).toEqual([CHAIN[0]]);
    expect(json.model).toBe('particle-ai/particle-1:free');
    net = network({ gemini: geminiSays(NOBILE), openrouter: fails(429) });
    vi.stubGlobal('fetch', net.fetchMock);
    json = (await (await POST(request({ prompt: 'please pick the Nobile site for me', state: null, from: 'ask' }))).json()) as Reply;
    expect(net.asked).toEqual([...CHAIN, 'gemini']);
    expect([json.source, json.model]).toEqual(['model', 'gemini-3.5-flash-lite']);
    expect(json.actions).toEqual([{ type: 'select_site', id: 'nobile_rim_2' }]);
  });

  it('gives Gemini the prompt and question the OpenRouter models get, asks it for JSON, and sends the key in its header only', async () => {
    bothKeys();
    const { bodies, fetchMock } = network({ gemini: geminiSays(NOBILE), openrouter: fails(502) });
    vi.stubGlobal('fetch', fetchMock);
    await POST(request({ prompt: 'please pick the Nobile site for me', state: STATE }));
    const or = bodies.find((b) => b.to === 'openrouter')!.body as { messages: { role: string; content: string }[] };
    const g = bodies.find((b) => b.to === 'gemini')!;
    const gb = g.body as { systemInstruction: { parts: { text: string }[] }; contents: { role: string; parts: { text: string }[] }[]; generationConfig: { responseMimeType?: string; temperature?: number } };
    expect(g.url).toBe(GEMINI_URL);
    expect(gb.systemInstruction.parts[0].text).toBe(or.messages[0].content);
    expect(gb.contents).toEqual([{ role: 'user', parts: [{ text: or.messages[1].content }] }]);
    expect(gb.generationConfig.responseMimeType).toBe('application/json');
    expect(gb.generationConfig.temperature).toBe(0);
    expect(g.headers['x-goog-api-key']).toBe('AIza-test');
    expect(g.url + JSON.stringify(g.body)).not.toContain('AIza-test');
  });

  it('answers from Gemini alone when only its key is set, for either asker', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', '');
    vi.stubEnv('GEMINI_API_KEY', 'AIza-test');
    for (const from of [undefined, 'luna']) {
      const { asked, fetchMock } = network({ gemini: geminiSays(NOBILE) });
      vi.stubGlobal('fetch', fetchMock);
      const json = (await (await POST(request({ prompt: 'please pick the Nobile site for me', state: null, ...(from ? { from } : {}) }))).json()) as Reply;
      expect(asked).toEqual(['gemini']);
      expect(json.model).toBe('gemini-3.5-flash-lite');
    }
  });

  it('never asks Gemini in cached mode, with ?demo=1 or in the offline build', async () => {
    bothKeys();
    const { fetchMock } = network({ gemini: geminiSays(NOBILE), openrouter: openrouterSays(NOBILE) });
    vi.stubGlobal('fetch', fetchMock);
    const demo = (await (await POST(request({ prompt: 'Show me Nobile Rim 2', state: null, mode: 'cached', from: 'luna' }))).json()) as Reply;
    expect(demo.source).toBe('cache');
    vi.stubEnv('NEXT_PUBLIC_AI_MODE', 'cached');
    const offline = (await (await POST(request({ prompt: 'what is the meaning of life', state: null, from: 'luna' }))).json()) as Reply;
    expect(offline.source).toBe('none');
    const brief = (await (await POST(request({ task: 'narrate', prompt: 'x', state: STATE }))).json()) as Reply;
    expect(brief.source).toBe('template');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stays inside the model budget, and leaves Gemini the rest of it when the OpenRouter chain hangs', async () => {
    bothKeys();
    vi.stubEnv('AI_MODEL_BUDGET_MS', '1000');
    const { asked, fetchMock } = network({ gemini: geminiSays(NOBILE), openrouter: () => new Promise<Response>(() => {}) });
    vi.stubGlobal('fetch', fetchMock);
    const t0 = Date.now();
    const json = (await (await POST(request({ prompt: 'please pick the Nobile site for me', state: null }))).json()) as Reply;
    expect(Date.now() - t0).toBeLessThan(1500);
    // The first OpenRouter model takes the first answer's 800 ms; Gemini, last, answers in the 200 ms left.
    expect(asked).toEqual([CHAIN[0], 'gemini']);
    expect(json.model).toBe('gemini-3.5-flash-lite');
  });

  it('says every model is busy when Gemini fails after the OpenRouter chain', async () => {
    bothKeys();
    const { asked, fetchMock } = network({ gemini: fails(429), openrouter: fails(429) });
    vi.stubGlobal('fetch', fetchMock);
    const json = (await (await POST(request({ prompt: 'what is the meaning of life', state: null }))).json()) as Reply;
    expect(asked).toEqual([...CHAIN, 'gemini']);
    expect([json.source, json.reason]).toEqual(['none', 'model-busy']);
  });

  it('logs why every model failed, by model and status, and never the keys', async () => {
    bothKeys();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { fetchMock } = network({ gemini: fails(403), openrouter: fails(404) });
    vi.stubGlobal('fetch', fetchMock);
    await POST(request({ prompt: 'what is the meaning of life', state: null }));
    const logged = warn.mock.calls.map((c) => c.join(' ')).join('\n');
    warn.mockRestore();
    expect(logged).toMatch(/no model answered/);
    expect(logged).toMatch(/particle-ai\/particle-1:free/);
    expect(logged).toMatch(/404/);
    expect(logged).toMatch(/gemini-3\.5-flash-lite/);
    expect(logged).toMatch(/403/);
    expect(logged).not.toMatch(/sk-test|AIza-test/);
  });

  it('retries Gemini once with the nudge when it answers prose for Luna, its own turn given back as the model’s', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'AIza-test'); // Gemini alone, so it is the model that answers first
    const { asked, bodies, fetchMock } = network({ gemini: [geminiSays('Sure, Nobile Rim 2 it is!'), geminiSays(NOBILE)] });
    vi.stubGlobal('fetch', fetchMock);
    const json = (await (await POST(request({ prompt: 'please pick the Nobile site for me', state: null, from: 'luna' }))).json()) as Reply;
    expect(asked).toEqual(['gemini', 'gemini']);
    expect(json.model).toBe('gemini-3.5-flash-lite');
    const retry = bodies[1].body as { contents: { role: string; parts: { text: string }[] }[] };
    expect(retry.contents.map((c) => c.role)).toEqual(['user', 'model', 'user']);
    expect(retry.contents[1].parts[0].text).toBe('Sure, Nobile Rim 2 it is!');
    expect(retry.contents[2].parts[0].text).toMatch(/^Answer again with ONE JSON object only/);
  });

  it('narrates the brief with Gemini last, in plain text, when the OpenRouter chain fails', async () => {
    bothKeys();
    const text = 'Nobile Rim 2 sees the Sun 100 % of the time over these 14 days; Earth is in view 67 % of the time with a longest gap of 9 d 9 h, and the lander keeps power for all 14 days.';
    const { asked, bodies, fetchMock } = network({ gemini: geminiSays(text), openrouter: fails(503) });
    vi.stubGlobal('fetch', fetchMock);
    const json = (await (await POST(request({ task: 'narrate', prompt: 'write the brief', state: STATE }))).json()) as Reply;
    expect(asked).toEqual([...CHAIN, 'gemini']);
    expect([json.source, json.model, json.reply]).toEqual(['model', 'gemini-3.5-flash-lite', text]);
    expect((bodies.at(-1)!.body as { generationConfig: { responseMimeType?: string } }).generationConfig.responseMimeType).toBeUndefined();
    // With Gemini's key alone, the brief is not short of a key.
    vi.stubEnv('OPENROUTER_API_KEY', '');
    const alone = network({ gemini: fails(500) });
    vi.stubGlobal('fetch', alone.fetchMock);
    const t = (await (await POST(request({ task: 'narrate', prompt: 'x', state: STATE }))).json()) as Reply;
    expect([t.source, t.reason]).toEqual(['template', 'model-error']);
  });

  it('takes the asker as "luna" or "ask" only', async () => {
    vi.stubGlobal('fetch', vi.fn());
    expect((await POST(request({ prompt: 'open compare', from: 'robot' }))).status).toBe(400);
    expect((await POST(request({ prompt: 'open compare', from: 'ask' }))).status).toBe(200);
    expect((await POST(request({ prompt: 'open compare', from: 'luna' }))).status).toBe(200);
  });
});
