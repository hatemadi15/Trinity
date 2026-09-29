import type { Action } from './actions';
import type { ChatReply, ChatSource } from './protocol';
import type { StateSummary } from './state-summary';
import type { AiMode } from '../store/explore';

/** The server may spend two model timeouts plus overhead; the browser waits this long before giving up. */
export const CLIENT_TIMEOUT_MS = 30_000;

export interface PlannerAnswer extends ChatReply {
  /** Present when the server refused the question for now (429). */
  retryAfterS?: number;
}

/**
 * Posts one question to /api/chat. A 429 comes back as a normal answer that says when to try
 * again; any other failure (network, 4xx, 5xx, malformed body) throws so the strip can show its
 * offline copy.
 */
export async function askPlanner(prompt: string, state: StateSummary | null, mode: AiMode, fetchImpl: typeof fetch = fetch): Promise<PlannerAnswer> {
  const res = await fetchImpl('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, state, mode }),
    signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
  });
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
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
  };
}
