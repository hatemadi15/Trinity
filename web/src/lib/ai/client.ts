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

/** "google/gemma-4-31b-it:free" → "gemma-4-31b", for the source lines. */
export function shortModel(model: string): string {
  return model
    .replace(/^[^/]+\//, '')
    .replace(/:.*$/, '')
    .replace(/-(it|instruct)$/, '');
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
 * offline copy.
 */
export async function askPlanner(prompt: string, state: StateSummary | null, mode: AiMode, fetchImpl: typeof fetch = fetch): Promise<PlannerAnswer> {
  const { res, json: body } = await post({ prompt, state, mode }, fetchImpl);
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

/** Asks for the brief's narrated paragraph; the server returns the template when the model's numbers do not check out. */
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
  return { source: body.source, reason, model: typeof body.model === 'string' ? body.model : undefined, reply: body.reply };
}
