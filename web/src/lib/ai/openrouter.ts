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
/** The least of the budget worth starting a request with; under it the chain stops as if the budget were spent. */
const MIN_CALL_MS = 10;

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
 * Asks each model in turn (temperature 0, capped tokens, one timeout per model) and returns the
 * first non-empty assistant answer with the model that gave it. HTTP errors, timeouts, transport
 * failures and empty answers move the chain on; when every model fails the result carries every
 * reason. Never throws, never logs the key.
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
  const deadline = budgetMs === undefined ? Infinity : Date.now() + budgetMs;
  const errors: string[] = [];
  for (const model of models) {
    const remaining = deadline - Date.now();
    // No model answers in a few milliseconds, so a sliver of budget is as good as none: starting a request only
    // to abort it costs a call (and Date.now()'s whole milliseconds can read a hair short of a timer that has fired).
    if (remaining < MIN_CALL_MS) {
      errors.push(`budget of ${budgetMs} ms exhausted before ${model}`);
      break;
    }
    const perModelMs = Math.min(timeoutMs, remaining);
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error(`timed out after ${perModelMs} ms`));
      }, perModelMs);
    });
    try {
      const res = await Promise.race([
        fetchImpl(OPENROUTER_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://github.com/hatemadi15/Trinity',
            'X-Title': 'Earthrise',
          },
          body: JSON.stringify({ model, messages, temperature: 0, max_tokens: maxTokens }),
          signal: controller.signal,
        }),
        timeout,
      ]);
      if (!res.ok) {
        errors.push(`${model}: HTTP ${res.status}`);
        continue;
      }
      const json = (await res.json().catch(() => ({}))) as Completion;
      const text = contentText(json.choices?.[0]?.message?.content);
      if (!text) {
        errors.push(`${model}: ${json.error?.message ? `API error ${json.error.message}` : 'empty answer'}`);
        continue;
      }
      return { model, content: text };
    } catch (err) {
      errors.push(`${model}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  return { error: errors.join('; ') || 'no model configured' };
}
