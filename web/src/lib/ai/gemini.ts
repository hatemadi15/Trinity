import { TRANSCRIPT_MAX_CHARS } from '../luna/limits';
import type { CallResult } from './chain';
import type { ChatMessage } from './openrouter';
import { extractJson } from './protocol';

/**
 * Google's Gemini API for the server routes, by REST with fetch rather than Google's SDK: @google/genai 3.3.0 brings 41
 * packages and 32 MB (google-auth-library, protobufjs, ws) to make the same few POSTs, a weight every function would
 * load. The request and response shapes below are the SDK's own, checked against its TypeScript types (genai.d.ts:
 * GenerateContentParameters, GenerateContentConfig, Content, Part, Blob, SpeechConfig, ThinkingConfig,
 * GenerateContentResponse, Candidate) and against the converter it uses for the Gemini Developer API
 * (generateContentParametersToMldev: `systemInstruction` beside `contents`, every other setting in
 * `generationConfig`). The key is read on the server only, from GEMINI_API_KEY, and sent in the `x-goog-api-key`
 * header, never in a URL or a body.
 */

/** The Gemini Developer API's beta version, which documents every field used here (the SDK can choose it too). */
export const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * The models and the voice when no variable names others. Model names change: the defaults may need updating to the
 * current names (Google's model list; @google/genai's `Model` type of November 2026 lists gemini-2.5-flash, the
 * gemini-3.x families and gemini-3.8-flash-tts, and no longer gemini-2.5-flash-preview-tts).
 */
export const GEMINI_DEFAULTS = {
  textModel: 'gemini-2.5-flash',
  transcribeModel: 'gemini-2.5-flash',
  speechModel: 'gemini-3.8-flash-tts',
  /** One of Gemini's prebuilt voices, which Google describes as youthful: friendly for a small robot rabbit. */
  voice: 'Leda',
} as const;

export interface GeminiSettings {
  apiKey: string;
  textModel: string;
  transcribeModel: string;
  speechModel: string;
  voice: string;
}

/** A model's name as the URL takes it ("models/" let go), or null when it could reach another address. */
function modelName(raw: string | undefined): string | null {
  const name = (raw ?? '').trim().replace(/^models\//, '');
  return /^[A-Za-z0-9][\w.-]*$/.test(name) ? name : null;
}

/**
 * Gemini's settings from the server's environment, or null without a key. GEMINI_API_KEY only, never a NEXT_PUBLIC_
 * variable, so the key cannot reach the browser; GEMINI_TEXT_MODEL, GEMINI_TRANSCRIBE_MODEL, GEMINI_TTS_MODEL and
 * GEMINI_VOICE choose the rest, and an unset or unusable value takes the default.
 */
export function geminiFromEnv(env: Record<string, string | undefined> = process.env): GeminiSettings | null {
  const apiKey = env.GEMINI_API_KEY?.trim() ?? '';
  if (!apiKey) return null;
  const voice = (env.GEMINI_VOICE ?? '').trim();
  return {
    apiKey,
    textModel: modelName(env.GEMINI_TEXT_MODEL) ?? GEMINI_DEFAULTS.textModel,
    transcribeModel: modelName(env.GEMINI_TRANSCRIBE_MODEL) ?? GEMINI_DEFAULTS.transcribeModel,
    speechModel: modelName(env.GEMINI_TTS_MODEL) ?? GEMINI_DEFAULTS.speechModel,
    voice: /^[A-Za-z][\w-]*$/.test(voice) ? voice : GEMINI_DEFAULTS.voice,
  };
}

/** Why Gemini may not be asked here, or null when it may: the offline venue build (cached mode), then a missing key. */
export function geminiUnavailable(env: Record<string, string | undefined> = process.env): 'offline' | 'no-key' | null {
  if (env.NEXT_PUBLIC_AI_MODE === 'cached') return 'offline';
  return geminiFromEnv(env) ? null : 'no-key';
}

// The parts of the SDK's types that these requests and answers use, under the SDK's names.
export interface GeminiPart {
  text?: string;
  /** Base64 bytes with their type (the SDK's Blob). */
  inlineData?: { mimeType?: string; data?: string };
  thought?: boolean;
}
export interface GeminiContent {
  role?: 'user' | 'model';
  parts: GeminiPart[];
}
export interface GeminiRequest {
  contents: GeminiContent[];
  systemInstruction?: GeminiContent;
  generationConfig?: {
    temperature?: number;
    maxOutputTokens?: number;
    responseMimeType?: string;
    responseSchema?: unknown;
    responseModalities?: string[];
    speechConfig?: { voiceConfig: { prebuiltVoiceConfig: { voiceName: string } } };
    thinkingConfig?: { thinkingBudget: number };
  };
}
export interface GeminiResponse {
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
}

/** The longest any call waits when its caller gives no signal of its own: never forever. */
const DEFAULT_WAIT_MS = 30_000;

/** What a model may think before it answers, which counts against its output cap, where thinking cannot be turned off. */
const THINKING_ROOM = 2048;

/**
 * The output cap, and thinking off where the model documents it (the 2.5 Flash family: thinkingBudget 0 is off, so it
 * answers at once and the cap holds the answer). Other models keep their own thinking, with room for it.
 */
export function thinkingFor(model: string, maxTokens: number): Pick<NonNullable<GeminiRequest['generationConfig']>, 'maxOutputTokens' | 'thinkingConfig'> {
  return /^gemini-2\.5-flash/.test(model) ? { maxOutputTokens: maxTokens, thinkingConfig: { thinkingBudget: 0 } } : { maxOutputTokens: maxTokens + THINKING_ROOM };
}

/** Settles as the promise does, or fails when the signal is aborted, even if the promise never settles. */
function untilAborted<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new Error('aborted'));
  return new Promise<T>((resolve, reject) => {
    const stop = () => reject(new Error(signal.reason instanceof Error && signal.reason.name === 'TimeoutError' ? 'timed out' : 'aborted'));
    signal.addEventListener('abort', stop, { once: true });
    p.then(
      (v) => {
        signal.removeEventListener('abort', stop);
        resolve(v);
      },
      (e) => {
        signal.removeEventListener('abort', stop);
        reject(e);
      },
    );
  });
}

/**
 * One generateContent call: the answer's JSON, or why there is none, the model named ("gemini-2.5-flash: HTTP 429
 * RESOURCE_EXHAUSTED"). Never throws; the key goes in its header only.
 */
export async function generateContent(
  model: string,
  request: GeminiRequest,
  apiKey: string,
  { signal = AbortSignal.timeout(DEFAULT_WAIT_MS), fetchImpl = fetch }: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {},
): Promise<{ json: GeminiResponse } | { error: string; status?: number }> {
  try {
    const res = await untilAborted(
      fetchImpl(`${GEMINI_API}/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal,
      }),
      signal,
    );
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { status?: unknown } } | null;
      const status = typeof body?.error?.status === 'string' ? ` ${body.error.status}` : '';
      return { error: `${model}: HTTP ${res.status}${status}`, status: res.status };
    }
    const json = (await untilAborted(res.json(), signal).catch(() => null)) as GeminiResponse | null;
    if (!json || typeof json !== 'object') return { error: `${model}: the answer was not JSON` };
    return { json };
  } catch (err) {
    return { error: `${model}: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** The first candidate's parts, thoughts left out. */
function answerParts(json: GeminiResponse): GeminiPart[] {
  return (json.candidates?.[0]?.content?.parts ?? []).filter((p) => p && !p.thought);
}

/** Why an answer holds nothing usable: the question blocked, or the reason the model stopped. */
function emptyReason(model: string, json: GeminiResponse): string {
  const blocked = json.promptFeedback?.blockReason;
  if (blocked) return `${model}: blocked (${blocked})`;
  const finish = json.candidates?.[0]?.finishReason;
  return `${model}: empty answer${finish ? ` (${finish})` : ''}`;
}

/**
 * The assistant's question for Gemini: the system prompt as its system instruction, the turns as its contents (the
 * model's own as role "model"), temperature 0 and the token cap the OpenRouter models get, and JSON output when the
 * route expects JSON. Returns the answer's text, or why there is none; never throws.
 */
export async function geminiText(opts: {
  model: string;
  apiKey: string;
  messages: ChatMessage[];
  maxTokens: number;
  json?: boolean;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<CallResult> {
  const { model, apiKey, messages, maxTokens, json = false, signal, fetchImpl } = opts;
  const system = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n');
  const request: GeminiRequest = {
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    contents: messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
    generationConfig: { temperature: 0, ...thinkingFor(model, maxTokens), ...(json ? { responseMimeType: 'application/json' } : {}) },
  };
  const r = await generateContent(model, request, apiKey, { signal, fetchImpl });
  if ('error' in r) return { error: r.error };
  const text = answerParts(r.json)
    .map((p) => (typeof p.text === 'string' ? p.text : ''))
    .join('')
    .trim();
  return text ? { content: text } : { error: emptyReason(model, r.json) };
}

/**
 * The direction in front of a reply for Gemini's speech models, which take a short spoken direction before the words
 * to say, as Google's own example ("Say cheerfully: Have a wonderful day!") shows; it also keeps a reply that reads
 * like a question from being answered instead of said.
 */
export const SPEECH_STYLE = 'Say in a friendly, clear voice: ';

/** Bytes from base64, as Gemini sends inline data. */
const fromBase64 = (data: string) => new Uint8Array(Buffer.from(data, 'base64'));

/**
 * A reply in Gemini's voice: the speech model asked for audio only (responseModalities ["AUDIO"]) in one prebuilt
 * voice (speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName). Returns the audio's bytes and type (raw 16-bit PCM,
 * "audio/L16;codec=pcm;rate=24000", from today's models), or why there is none; never throws.
 */
export async function geminiSpeech(opts: {
  model: string;
  apiKey: string;
  voice: string;
  text: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<{ audio: Uint8Array; mimeType: string } | { error: string; status?: number }> {
  const { model, apiKey, voice, text, signal, fetchImpl } = opts;
  const r = await generateContent(
    model,
    {
      contents: [{ role: 'user', parts: [{ text: `${SPEECH_STYLE}${text}` }] }],
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
    },
    apiKey,
    { signal, fetchImpl },
  );
  if ('error' in r) return r;
  const part = answerParts(r.json).find((p) => typeof p.inlineData?.data === 'string' && p.inlineData.data.length > 0);
  if (!part?.inlineData?.data) {
    const finish = r.json.candidates?.[0]?.finishReason;
    return { error: r.json.promptFeedback?.blockReason ? `${model}: blocked (${r.json.promptFeedback.blockReason})` : `${model}: no audio in the answer${finish ? ` (${finish})` : ''}` };
  }
  return { audio: fromBase64(part.inlineData.data), mimeType: part.inlineData.mimeType ?? 'audio/L16;codec=pcm;rate=24000' };
}

/** Bytes as base64, for inline data. */
const toBase64 = (bytes: Uint8Array) => Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');

/** What the transcription model is told, with the names the app knows, so it writes them as the app does. */
export function transcribePrompt(names: readonly string[]): string {
  return [
    'Transcribe this recording. Someone is speaking English to Luna, the voice assistant of Earthrise, an app for planning Moon landings: write the words they say, as they say them.',
    names.length ? `Names they may say include: ${names.join(', ')}.` : '',
    'Answer with one JSON object only, {"text": "their words"}, and {"text": ""} if nobody speaks.',
  ]
    .filter(Boolean)
    .join(' ');
}

/** Spaces collapsed, quotes round the whole let go, cut to TRANSCRIPT_MAX_CHARS. */
function tidy(words: string): string {
  return words
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["“'](.*)["”']$/, '$1')
    .trim()
    .slice(0, TRANSCRIPT_MAX_CHARS);
}

/**
 * Words from a recording, for Luna where the browser cannot listen (spec 22.5): the prompt and the audio inline (the
 * SDK's Blob: base64 data with its MIME type), temperature 0, and JSON output holding only the words (a responseSchema
 * of one string). Plain words in place of JSON are taken as the words. Returns the words ("" when nobody spoke), or
 * why there are none; never throws.
 */
export async function geminiTranscribe(opts: {
  model: string;
  apiKey: string;
  audio: Uint8Array;
  mimeType: string;
  names?: readonly string[];
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<{ text: string } | { error: string; status?: number }> {
  const { model, apiKey, audio, mimeType, names = [], signal, fetchImpl } = opts;
  const r = await generateContent(
    model,
    {
      contents: [{ role: 'user', parts: [{ text: transcribePrompt(names) }, { inlineData: { mimeType, data: toBase64(audio) } }] }],
      generationConfig: {
        temperature: 0,
        ...thinkingFor(model, 256),
        responseMimeType: 'application/json',
        responseSchema: { type: 'OBJECT', properties: { text: { type: 'STRING' } }, required: ['text'] },
      },
    },
    apiKey,
    { signal, fetchImpl },
  );
  if ('error' in r) return r;
  const answer = answerParts(r.json)
    .map((p) => (typeof p.text === 'string' ? p.text : ''))
    .join('')
    .trim();
  if (!answer) return { error: emptyReason(model, r.json) };
  const o = extractJson(answer);
  if (o) return typeof o.text === 'string' ? { text: tidy(o.text) } : { error: `${model}: no words in the answer` };
  return { text: tidy(answer) };
}
