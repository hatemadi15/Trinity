import type { Action } from './actions';
import { CHAT_REASONS, type ChatReason, type ChatReply, type ChatSource, type NarrationReply } from './protocol';
import type { StateSummary } from './state-summary';
import type { AiMode } from '../store/explore';

/** The server keeps its model time inside a 24 s budget (AI_MODEL_BUDGET_MS); the browser waits this long before giving up. */
export const CLIENT_TIMEOUT_MS = 30_000;

export interface PlannerAnswer extends ChatReply {
  /** Present when the server refused the question for now (429). */
  retryAfterS?: number;
}

/**
 * The name the source lines give a model: "google/gemma-4-31b-it:free" → "gemma-4-31b"; Gemini by name, in plain words,
 * so an answer says when Gemini gave it: "gemini-2.5-flash" → "Gemini 2.5 Flash".
 */
export function shortModel(model: string): string {
  const short = model
    .replace(/^[^/]+\//, '')
    .replace(/:.*$/, '')
    .replace(/-(it|instruct)$/, '');
  if (!/^gemini-/i.test(short)) return short;
  return short
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

async function post(body: unknown, fetchImpl: typeof fetch): Promise<{ res: Response; json: Record<string, unknown> | null }> {
  const res = await fetchImpl('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
  });
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  return { res, json };
}

/**
 * Posts one question to /api/chat. A 429 comes back as a normal answer that says when to try
 * again; any other failure (network, 4xx, 5xx, malformed body) throws so the strip can show its
 * offline copy. `from: "luna"` says Luna asks; for every asker the server asks OpenRouter's models first and
 * Gemini last, keeping Gemini for Luna's voice.
 */
export async function askPlanner(prompt: string, state: StateSummary | null, mode: AiMode, fetchImpl: typeof fetch = fetch, from?: 'luna'): Promise<PlannerAnswer> {
  const { res, json: body } = await post({ prompt, state, mode, ...(from ? { from } : {}) }, fetchImpl);
  if (res.status === 429) {
    const retryAfterS = Number(body?.retryAfterS) || Number(res.headers.get('Retry-After')) || 60;
    return { source: 'none', actions: [], reply: `Too many questions; try again in ${retryAfterS} s.`, retryAfterS };
  }
  if (!res.ok) throw new Error(typeof body?.error === 'string' ? body.error : `The planner answered HTTP ${res.status}`);
  if (!body || typeof body.source !== 'string' || typeof body.reply !== 'string' || !Array.isArray(body.actions)) {
    throw new Error('The planner gave an unexpected answer');
  }
  return {
    source: body.source as ChatSource,
    model: typeof body.model === 'string' ? body.model : undefined,
    actions: body.actions as Action[],
    reply: body.reply,
    dropped: Array.isArray(body.dropped) ? (body.dropped as string[]) : undefined,
    reason: CHAT_REASONS.includes(body.reason as ChatReason) ? (body.reason as ChatReason) : undefined,
  };
}

/** Luna's questions (spec 22): as askPlanner, marked as hers. */
export function askLuna(prompt: string, state: StateSummary | null, mode: AiMode, fetchImpl: typeof fetch = fetch): Promise<PlannerAnswer> {
  return askPlanner(prompt, state, mode, fetchImpl, 'luna');
}

/** Asks for the brief's narrated paragraph; the server returns the template, and what failed, when the model's claims do not check out. */
export async function askNarration(state: StateSummary, mode: AiMode, fetchImpl: typeof fetch = fetch): Promise<NarrationReply> {
  const { res, json: body } = await post({ task: 'narrate', prompt: 'Write the mission brief', state, mode }, fetchImpl);
  if (res.status === 429) {
    const retryAfterS = Number(body?.retryAfterS) || Number(res.headers.get('Retry-After')) || 60;
    throw new Error(`Too many questions; try again in ${retryAfterS} s.`);
  }
  if (!res.ok) throw new Error(typeof body?.error === 'string' ? body.error : `The planner answered HTTP ${res.status}`);
  if (!body || (body.source !== 'model' && body.source !== 'template') || typeof body.reply !== 'string') {
    throw new Error('The planner gave an unexpected answer');
  }
  const reason = body.reason === 'numbers' || body.reason === 'no-key' || body.reason === 'cached' || body.reason === 'model-error' ? body.reason : undefined;
  const problems = Array.isArray(body.problems) ? body.problems.filter((p): p is string => typeof p === 'string').slice(0, 3) : undefined;
  return { source: body.source, reason, model: typeof body.model === 'string' ? body.model : undefined, reply: body.reply, ...(problems?.length ? { problems } : {}) };
}
