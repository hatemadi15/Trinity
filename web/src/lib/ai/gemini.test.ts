import { describe, expect, it, vi } from 'vitest';
import { GEMINI_API, GEMINI_DEFAULTS, geminiFromEnv, geminiSpeech, geminiText, geminiUnavailable, SPEECH_STYLE } from './gemini';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const answer = (...texts: string[]) => json({ candidates: [{ content: { role: 'model', parts: texts.map((text) => ({ text })) }, finishReason: 'STOP' }] });

const messages = [
  { role: 'system' as const, content: 'You are the planner.' },
  { role: 'user' as const, content: 'STATE: none. QUESTION: show me Nobile Rim 2' },
];

type Sent = {
  systemInstruction?: { parts: { text: string }[] };
  contents: { role: string; parts: { text: string }[] }[];
  generationConfig: { temperature?: number; maxOutputTokens?: number; responseMimeType?: string; thinkingConfig?: { thinkingBudget?: number } };
};
const sent = (fetchImpl: ReturnType<typeof vi.fn>, call = 0) => {
  const [url, init] = fetchImpl.mock.calls[call] as [string, RequestInit];
  return { url, init, body: JSON.parse(String(init.body)) as Sent, headers: init.headers as Record<string, string> };
};

describe('Gemini for the assistant (generateContent, by REST)', () => {
  it('posts the system prompt as the system instruction and the turns as contents, the key in its header only', async () => {
    const fetchImpl = vi.fn(async () => answer('{"actions":[],"reply":"Hello."}'));
    const r = await geminiText({ model: 'gemini-2.5-flash', apiKey: 'AIza-test', messages, maxTokens: 600, json: true, fetchImpl });
    expect(r).toEqual({ content: '{"actions":[],"reply":"Hello."}' });
    const { url, init, body, headers } = sent(fetchImpl);
    expect(url).toBe(`${GEMINI_API}/models/gemini-2.5-flash:generateContent`);
    expect(GEMINI_API).toBe('https://generativelanguage.googleapis.com/v1beta');
    expect(init.method).toBe('POST');
    expect(headers['x-goog-api-key']).toBe('AIza-test');
    expect(headers['Content-Type']).toBe('application/json');
    expect(url).not.toContain('AIza-test');
    expect(String(init.body)).not.toContain('AIza-test');
    expect(body.systemInstruction).toEqual({ parts: [{ text: 'You are the planner.' }] });
    expect(body.contents).toEqual([{ role: 'user', parts: [{ text: 'STATE: none. QUESTION: show me Nobile Rim 2' }] }]);
    // The answer the route expects is JSON, so Gemini is asked for JSON; 2.5 Flash answers without thinking first.
    expect(body.generationConfig).toEqual({ temperature: 0, maxOutputTokens: 600, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 } });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('gives the model’s own turns the role "model", asks for plain text when no JSON is wanted, and leaves thinking alone on other models', async () => {
    const fetchImpl = vi.fn(async () => answer('A paragraph.'));
    await geminiText({
      model: 'gemini-3.8-flash',
      apiKey: 'k',
      messages: [...messages, { role: 'assistant', content: 'prose' }, { role: 'user', content: 'Answer again with JSON.' }],
      maxTokens: 600,
      fetchImpl,
    });
    const { body } = sent(fetchImpl);
    expect(body.contents.map((c) => c.role)).toEqual(['user', 'model', 'user']);
    expect(body.generationConfig.responseMimeType).toBeUndefined();
    expect(body.generationConfig.thinkingConfig).toBeUndefined();
    // Room for the thinking a model may do before it answers, which counts against the cap.
    expect(body.generationConfig.maxOutputTokens).toBeGreaterThan(600);
  });

  it('joins the answer’s text parts and leaves out its thoughts', async () => {
    const fetchImpl = vi.fn(async () => json({ candidates: [{ content: { parts: [{ text: 'thinking aloud', thought: true }, { text: '{"actions":' }, { text: '[],"reply":"Hi."}' }] } }] }));
    expect(await geminiText({ model: 'gemini-2.5-flash', apiKey: 'k', messages, maxTokens: 600, fetchImpl })).toEqual({ content: '{"actions":[],"reply":"Hi."}' });
  });

  it('reports an HTTP error, a blocked question and an empty answer as errors, without the key, and never throws', async () => {
    const quota = vi.fn(async () => json({ error: { code: 429, message: 'Resource has been exhausted', status: 'RESOURCE_EXHAUSTED' } }, 429));
    const a = await geminiText({ model: 'gemini-2.5-flash', apiKey: 'AIza-secret', messages, maxTokens: 600, fetchImpl: quota });
    expect(a).toEqual({ error: 'gemini-2.5-flash: HTTP 429 RESOURCE_EXHAUSTED' });
    const blocked = vi.fn(async () => json({ promptFeedback: { blockReason: 'SAFETY' } }));
    expect(await geminiText({ model: 'gemini-2.5-flash', apiKey: 'k', messages, maxTokens: 600, fetchImpl: blocked })).toEqual({ error: 'gemini-2.5-flash: blocked (SAFETY)' });
    const empty = vi.fn(async () => json({ candidates: [{ content: { parts: [] }, finishReason: 'MAX_TOKENS' }] }));
    expect(await geminiText({ model: 'gemini-2.5-flash', apiKey: 'k', messages, maxTokens: 600, fetchImpl: empty })).toEqual({ error: 'gemini-2.5-flash: empty answer (MAX_TOKENS)' });
    const down = vi.fn(async () => {
      throw new Error('getaddrinfo ENOTFOUND generativelanguage.googleapis.com');
    });
    expect(await geminiText({ model: 'gemini-2.5-flash', apiKey: 'k', messages, maxTokens: 600, fetchImpl: down })).toEqual({ error: 'gemini-2.5-flash: getaddrinfo ENOTFOUND generativelanguage.googleapis.com' });
    expect(JSON.stringify(a)).not.toContain('AIza-secret');
  });

  it('gives up when its signal is aborted, even if the transport never settles', async () => {
    const hang = vi.fn(() => new Promise<Response>(() => {}));
    const t0 = Date.now();
    const r = await geminiText({ model: 'gemini-2.5-flash', apiKey: 'k', messages, maxTokens: 600, fetchImpl: hang, signal: AbortSignal.timeout(50) });
    expect(Date.now() - t0).toBeLessThan(2000);
    expect((r as { error: string }).error).toMatch(/^gemini-2\.5-flash: /);
  });
});

describe('Gemini’s settings, from the server’s environment only', () => {
  it('needs GEMINI_API_KEY, and takes each model and the voice from its own variable, with defaults', () => {
    expect(geminiFromEnv({})).toBeNull();
    expect(geminiFromEnv({ GEMINI_API_KEY: '  ' })).toBeNull();
    expect(geminiFromEnv({ GEMINI_API_KEY: ' AIza-test ' })).toEqual({
      apiKey: 'AIza-test',
      textModel: 'gemini-2.5-flash',
      transcribeModel: 'gemini-2.5-flash',
      speechModel: GEMINI_DEFAULTS.speechModel,
      voice: 'Leda',
    });
    expect(
      geminiFromEnv({ GEMINI_API_KEY: 'k', GEMINI_TEXT_MODEL: 'models/gemini-3.8-flash', GEMINI_TRANSCRIBE_MODEL: 'gemini-3.5-transcribe', GEMINI_TTS_MODEL: 'gemini-2.5-flash-preview-tts', GEMINI_VOICE: 'Aoede' }),
    ).toEqual({ apiKey: 'k', textModel: 'gemini-3.8-flash', transcribeModel: 'gemini-3.5-transcribe', speechModel: 'gemini-2.5-flash-preview-tts', voice: 'Aoede' });
  });

  it('keeps a name that could reach another address out of the URL, using the default instead', () => {
    const s = geminiFromEnv({ GEMINI_API_KEY: 'k', GEMINI_TEXT_MODEL: '../files?x=1', GEMINI_TTS_MODEL: 'a/b', GEMINI_VOICE: 'Leda; drop' });
    expect([s?.textModel, s?.speechModel, s?.voice]).toEqual(['gemini-2.5-flash', GEMINI_DEFAULTS.speechModel, 'Leda']);
  });

  it('never reads a public variable for the key', () => {
    expect(geminiFromEnv({ NEXT_PUBLIC_GEMINI_API_KEY: 'AIza-public' })).toBeNull();
  });

  it('says why Gemini may not be asked: the offline build, then a missing key', () => {
    expect(geminiUnavailable({ GEMINI_API_KEY: 'k', NEXT_PUBLIC_AI_MODE: 'cached' })).toBe('offline');
    expect(geminiUnavailable({ NEXT_PUBLIC_AI_MODE: 'live' })).toBe('no-key');
    expect(geminiUnavailable({ GEMINI_API_KEY: 'k', NEXT_PUBLIC_AI_MODE: 'live' })).toBeNull();
    expect(geminiUnavailable({ GEMINI_API_KEY: 'k' })).toBeNull();
  });
});

describe('Gemini’s speech (generateContent with audio out)', () => {
  const pcm = new Uint8Array([0, 0, 1, 0, 255, 255, 255, 127]);
  const audio = (mimeType = 'audio/L16;codec=pcm;rate=24000') =>
    json({ candidates: [{ content: { role: 'model', parts: [{ inlineData: { mimeType, data: Buffer.from(pcm).toString('base64') } }] }, finishReason: 'STOP' }] });

  it('asks the speech model for audio in the named prebuilt voice, the reply after a short direction', async () => {
    const fetchImpl = vi.fn(async () => audio());
    const r = await geminiSpeech({ model: 'gemini-3.8-flash-tts', apiKey: 'AIza-test', voice: 'Leda', text: 'Opening the forecast.', fetchImpl });
    expect(r).toEqual({ audio: pcm, mimeType: 'audio/L16;codec=pcm;rate=24000' });
    const { url, headers, body } = sent(fetchImpl);
    expect(url).toBe(`${GEMINI_API}/models/gemini-3.8-flash-tts:generateContent`);
    expect(headers['x-goog-api-key']).toBe('AIza-test');
    expect(body).toEqual({
      contents: [{ role: 'user', parts: [{ text: `${SPEECH_STYLE}Opening the forecast.` }] }],
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Leda' } } } },
    });
    expect(SPEECH_STYLE).toMatch(/^Say .*: $/);
  });

  it('reports an answer without audio, an HTTP error and a transport failure as errors, with the status when there is one', async () => {
    const text = vi.fn(async () => answer('I would rather chat.'));
    expect(await geminiSpeech({ model: 'm', apiKey: 'k', voice: 'Leda', text: 'Hi.', fetchImpl: text })).toEqual({ error: 'm: no audio in the answer (STOP)' });
    const missing = vi.fn(async () => json({ error: { code: 404, message: 'models/m is not found', status: 'NOT_FOUND' } }, 404));
    expect(await geminiSpeech({ model: 'm', apiKey: 'k', voice: 'Leda', text: 'Hi.', fetchImpl: missing })).toEqual({ error: 'm: HTTP 404 NOT_FOUND', status: 404 });
    const down = vi.fn(async () => {
      throw new Error('socket hang up');
    });
    expect(await geminiSpeech({ model: 'm', apiKey: 'k', voice: 'Leda', text: 'Hi.', fetchImpl: down })).toEqual({ error: 'm: socket hang up' });
  });
});
