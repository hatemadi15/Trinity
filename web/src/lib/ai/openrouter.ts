import { runChain, type CallResult } from './chain';

/** OpenRouter chat completions: one JSON request per model in the chain, first good answer wins. */
export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * Free-tier chain, in the order the live probes of 2026-09-29 ranked them: qwen answered in 0.6 s
 * with valid JSON, nemotron-super in 1.6 s (without its closing brace, which extractJson repairs),
 * gemma was rate-limited (429) at the time, nemotron-lightning timed out. Override with OPENROUTER_MODELS.
 */
export const DEFAULT_MODELS = [
  'qwen/qwen3.8-27b:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'google/gemma-4-31b-it:free',
  'nvidia/nemotron-3.5-lightning:free',
];

export const DEFAULT_TIMEOUT_MS = 10_000;
export const DEFAULT_MAX_TOKENS = 600;

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export type ModelAnswer = { model: string; content: string } | { error: string };

export function modelsFromEnv(env: Record<string, string | undefined> = process.env): string[] {
  const list = (env.OPENROUTER_MODELS ?? '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
  return list.length > 0 ? list : DEFAULT_MODELS;
}

interface Completion {
  choices?: { message?: { content?: unknown } }[];
  error?: { message?: string };
}

function contentText(content: unknown): string {
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string' ? (part as { text: string }).text : ''))
      .join('')
      .trim();
  }
  return '';
}

/**
 * One OpenRouter model's answer (temperature 0, capped tokens): its text, or why there is none (an HTTP status, an
 * error in the body, an empty answer). A transport failure throws, for the chain to report. Never logs the key.
 */
export async function callOpenRouter(
  model: string,
  messages: ChatMessage[],
  apiKey: string,
  { maxTokens = DEFAULT_MAX_TOKENS, signal, fetchImpl = fetch }: { maxTokens?: number; signal?: AbortSignal; fetchImpl?: typeof fetch } = {},
): Promise<CallResult> {
  const res = await fetchImpl(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/hatemadi15/Trinity',
      'X-Title': 'Earthrise',
    },
    body: JSON.stringify({ model, messages, temperature: 0, max_tokens: maxTokens }),
    signal,
  });
  if (!res.ok) {
    // The provider's own reason, short (a retired model, a daily limit), so the logs say what to fix; never the key.
    const body = (await res.json().catch(() => null)) as Completion | null;
    const why = typeof body?.error?.message === 'string' ? ` ${body.error.message.slice(0, 160)}` : '';
    return { error: `${model}: HTTP ${res.status}${why}` };
  }
  const json = (await res.json().catch(() => ({}))) as Completion;
  const text = contentText(json.choices?.[0]?.message?.content);
  if (!text) return { error: `${model}: ${json.error?.message ? `API error ${json.error.message}` : 'empty answer'}` };
  return { content: text };
}

/**
 * Asks each OpenRouter model in turn (one timeout per model) and returns the first non-empty assistant answer with the
 * model that gave it. HTTP errors, timeouts, transport failures and empty answers move the chain on; when every model
 * fails the result carries every reason. Never throws, never logs the key.
 */
export async function askModel(opts: {
  messages: ChatMessage[];
  models: string[];
  apiKey: string;
  timeoutMs?: number;
  maxTokens?: number;
  /** Total time for the whole chain; each model gets the smaller of timeoutMs and what is left. */
  budgetMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<ModelAnswer> {
  const { messages, models, apiKey, timeoutMs = DEFAULT_TIMEOUT_MS, maxTokens = DEFAULT_MAX_TOKENS, budgetMs, fetchImpl = fetch } = opts;
  const r = await runChain({
    chain: models,
    label: (m) => m,
    call: (model, signal) => callOpenRouter(model, messages, apiKey, { maxTokens, signal, fetchImpl }),
    timeoutMs,
    budgetMs,
  });
  return 'error' in r ? r : { model: r.candidate, content: r.content };
}
