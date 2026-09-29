import { describeDropped, validateActions } from '@/lib/ai/actions';
import { cachedAnswer } from '@/lib/ai/cache';
import { matchIntent } from '@/lib/ai/intents';
import { askModel, modelsFromEnv, type ChatMessage } from '@/lib/ai/openrouter';
import { parseModelReply, systemPrompt, userPrompt, type ChatReply } from '@/lib/ai/protocol';
import { SlidingWindowLimiter } from '@/lib/ai/rate-limit';
import type { StateSummary } from '@/lib/ai/state-summary';
import catalogue from '@/lib/data/catalogue.json';
import type { Site } from '@/lib/data/loaders';

export const dynamic = 'force-dynamic';

/** Each model in the chain gets this long; two calls at most per request. */
const MODEL_TIMEOUT_MS = 10_000;
const MAX_PROMPT_CHARS = 2000;
const SITES = catalogue.sites as Site[];
const SITE_IDS: ReadonlySet<string> = new Set(SITES.map((s) => s.id));
const RETRY_NUDGE = 'Answer again with ONE JSON object only, in the form {"actions": [...], "reply": "..."} and no other text.';
const NO_ANSWER =
  'I could not understand that. Try: "show me Nobile Rim 2", "compare de Gerlache Rim 2 and Nobile Rim 2 for 14 days", "best 14-day window", "set the load to 300 W" or "explain the longest night".';

const limiter = new SlidingWindowLimiter(Number(process.env.AI_RATE_LIMIT_PER_MIN) || 30, 60_000);

function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip')?.trim() || 'local';
}

interface Body {
  prompt: string;
  state: StateSummary | null;
  mode: 'live' | 'cached';
}

async function parseBody(request: Request): Promise<Body | string> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return 'the body must be JSON';
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return 'the body must be an object';
  const o = raw as Record<string, unknown>;
  const prompt = typeof o.prompt === 'string' ? o.prompt.trim() : '';
  if (!prompt) return 'prompt is required';
  if (prompt.length > MAX_PROMPT_CHARS) return `prompt is longer than ${MAX_PROMPT_CHARS} characters`;
  if (o.mode !== undefined && o.mode !== 'live' && o.mode !== 'cached') return 'mode must be "live" or "cached"';
  const state = o.state && typeof o.state === 'object' && !Array.isArray(o.state) ? (o.state as StateSummary) : null;
  return { prompt, state, mode: o.mode === 'cached' ? 'cached' : 'live' };
}

async function fromModel(prompt: string, state: StateSummary | null, apiKey: string): Promise<ChatReply | null> {
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt(SITES) },
    { role: 'user', content: userPrompt(prompt, state) },
  ];
  const first = await askModel({ messages, models: modelsFromEnv(), apiKey, timeoutMs: MODEL_TIMEOUT_MS });
  if ('error' in first) return null;
  let parsed = parseModelReply(first.content);
  if (!parsed) {
    // One retry on the model that answered, with a nudge back to the contract.
    const second = await askModel({
      messages: [...messages, { role: 'assistant', content: first.content }, { role: 'user', content: RETRY_NUDGE }],
      models: [first.model],
      apiKey,
      timeoutMs: MODEL_TIMEOUT_MS,
    });
    if (!('error' in second)) parsed = parseModelReply(second.content);
  }
  if (!parsed) return null;
  const { actions, dropped } = validateActions(parsed.actions, SITE_IDS);
  const reply = [parsed.reply || (actions.length > 0 ? 'Done.' : NO_ANSWER), describeDropped(dropped)].filter(Boolean).join(' ');
  return { source: 'model', model: first.model, actions, reply, dropped };
}

function fromIntent(prompt: string): ChatReply | null {
  const r = matchIntent(prompt, SITES);
  if (!r) return null;
  const { actions, dropped } = validateActions(r.actions, SITE_IDS);
  return { source: 'intent', actions, reply: r.reply, dropped };
}

function fromCache(prompt: string): ChatReply | null {
  const t = cachedAnswer(prompt);
  if (!t) return null;
  const { actions, dropped } = validateActions(t.actions, SITE_IDS);
  return { source: 'cache', actions, reply: t.reply, dropped };
}

/**
 * POST { prompt, state?, mode? } → { source, model?, actions, reply, dropped? }.
 * Live mode with a key: the model (at most two calls), then the intent matcher, then the cached
 * transcripts. Cached mode (`mode: "cached"`, `?demo=1` on the client, or NEXT_PUBLIC_AI_MODE=cached):
 * transcripts first, then intents, and the model is never called. Never a 500: the worst answer is a
 * polite "I could not understand" with no actions.
 */
export async function POST(request: Request): Promise<Response> {
  const body = await parseBody(request);
  if (typeof body === 'string') return Response.json({ error: body }, { status: 400 });
  const gate = limiter.hit(clientIp(request));
  if (!gate.ok) {
    return Response.json(
      { error: `Too many questions from this address; try again in ${gate.retryAfterS} s`, retryAfterS: gate.retryAfterS },
      { status: 429, headers: { 'Retry-After': String(gate.retryAfterS) } },
    );
  }
  const cachedMode = body.mode === 'cached' || process.env.NEXT_PUBLIC_AI_MODE === 'cached';
  const apiKey = process.env.OPENROUTER_API_KEY?.trim() ?? '';
  let reply: ChatReply | null = null;
  if (cachedMode) {
    reply = fromCache(body.prompt) ?? fromIntent(body.prompt);
  } else {
    if (apiKey) reply = await fromModel(body.prompt, body.state, apiKey);
    reply = reply ?? fromIntent(body.prompt) ?? fromCache(body.prompt);
  }
  return Response.json(reply ?? { source: 'none', actions: [], reply: NO_ANSWER });
}
