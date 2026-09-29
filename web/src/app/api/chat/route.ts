import { describeDropped, validateActions } from '@/lib/ai/actions';
import { cachedAnswer } from '@/lib/ai/cache';
import { matchIntent } from '@/lib/ai/intents';
import { checkNumbers, foreignNumbers, isStateSummary, narrationPrompt, numbersIn, stripForeignNumbers, templateBrief } from '@/lib/ai/narrate';
import { askModel, modelsFromEnv, type ChatMessage } from '@/lib/ai/openrouter';
import { parseModelReply, systemPrompt, userPrompt, type ChatReply, type NarrationReply } from '@/lib/ai/protocol';
import { SlidingWindowLimiter } from '@/lib/ai/rate-limit';
import type { StateSummary } from '@/lib/ai/state-summary';
import catalogue from '@/lib/data/catalogue.json';
import type { Site } from '@/lib/data/loaders';

export const dynamic = 'force-dynamic';
/** Vercel function cap (seconds); the model budget below keeps a normal request far under it. */
export const maxDuration = 60;

/** Each model in the chain gets at most this long. */
const MODEL_TIMEOUT_MS = 10_000;
/** Total model time per request, first answer plus one retry, kept under the browser's 30 s wait. Override with AI_MODEL_BUDGET_MS. */
const DEFAULT_MODEL_BUDGET_MS = 24_000;
/** Share of the budget for the first answer; the rest is for the retry. */
const FIRST_SHARE = 0.8;
/** Below this much remaining budget a retry is not worth starting. */
const MIN_RETRY_MS = 500;
const MAX_PROMPT_CHARS = 2000;
const SITES = catalogue.sites as Site[];
const SITE_IDS: ReadonlySet<string> = new Set(SITES.map((s) => s.id));
const RETRY_NUDGE = 'Answer again with ONE JSON object only, in the form {"actions": [...], "reply": "..."} and no other text.';
const NO_ANSWER =
  'I could not understand that. Try: "show me Nobile Rim 2", "compare de Gerlache Rim 2 and Nobile Rim 2 for 14 days", "best 14-day window", "set the load to 300 W" or "explain the longest night".';

const limiter = new SlidingWindowLimiter(Number(process.env.AI_RATE_LIMIT_PER_MIN) || 30, 60_000);
const modelBudgetMs = () => Number(process.env.AI_MODEL_BUDGET_MS) || DEFAULT_MODEL_BUDGET_MS;

function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip')?.trim() || 'local';
}

interface Body {
  task: 'plan' | 'narrate';
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
  if (o.task !== undefined && o.task !== 'plan' && o.task !== 'narrate') return 'task must be "plan" or "narrate"';
  const state = o.state && typeof o.state === 'object' && !Array.isArray(o.state) ? (o.state as StateSummary) : null;
  if (o.task === 'narrate' && !isStateSummary(state)) return 'narrate needs the state summary of a loaded site';
  return { task: o.task === 'narrate' ? 'narrate' : 'plan', prompt, state, mode: o.mode === 'cached' ? 'cached' : 'live' };
}

/** The model's answer for a plan question, or null when nothing usable came back and the fallbacks should try. */
async function fromModel(prompt: string, state: StateSummary | null, apiKey: string): Promise<ChatReply | null> {
  const deadline = Date.now() + modelBudgetMs();
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt(SITES) },
    { role: 'user', content: userPrompt(prompt, state) },
  ];
  const first = await askModel({ messages, models: modelsFromEnv(), apiKey, timeoutMs: MODEL_TIMEOUT_MS, budgetMs: Math.round((deadline - Date.now()) * FIRST_SHARE) });
  if ('error' in first) return null;
  let parsed = parseModelReply(first.content);
  if (!parsed && deadline - Date.now() > MIN_RETRY_MS) {
    // One retry on the model that answered, with a nudge back to the contract.
    const second = await askModel({
      messages: [...messages, { role: 'assistant', content: first.content }, { role: 'user', content: RETRY_NUDGE }],
      models: [first.model],
      apiKey,
      timeoutMs: MODEL_TIMEOUT_MS,
      budgetMs: deadline - Date.now(),
    });
    if (!('error' in second)) parsed = parseModelReply(second.content);
  }
  if (!parsed) return null;
  const { actions, dropped } = validateActions(parsed.actions, SITE_IDS);
  // Every number the user reads must be one the app can vouch for: the state, the user's own figures
  // in the question, or a window length. Sentences with any other number go.
  const reply = state && isStateSummary(state) ? stripForeignNumbers(parsed.reply, state, [...numbersIn(prompt), '14', '30', '90']) : parsed.reply;
  if (actions.length === 0 && !reply) return null;
  const text = [reply || 'Done.', describeDropped(dropped)].filter(Boolean).join(' ');
  return { source: 'model', model: first.model, actions, reply: text, dropped };
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

/** A narration answer is plain text, but a model that wraps it in {"reply": …} or a fence is read too. */
function narrationText(content: string): string {
  const parsed = parseModelReply(content);
  if (parsed?.reply) return parsed.reply;
  return content
    .replace(/```[a-z]*\s*([\s\S]*?)```/g, '$1')
    .replace(/^["“]|["”]$/g, '')
    .trim();
}

/** The brief's paragraph: the model's words when every number checks out (one retry), else the template with the reason. */
async function narrate(state: StateSummary, apiKey: string, cachedMode: boolean): Promise<NarrationReply> {
  const template = (reason: NonNullable<NarrationReply['reason']>): NarrationReply => ({ source: 'template', reason, reply: templateBrief(state) });
  if (cachedMode) return template('cached');
  if (!apiKey) return template('no-key');
  const deadline = Date.now() + modelBudgetMs();
  const messages = narrationPrompt(state);
  const first = await askModel({ messages, models: modelsFromEnv(), apiKey, timeoutMs: MODEL_TIMEOUT_MS, budgetMs: Math.round((deadline - Date.now()) * FIRST_SHARE) });
  if ('error' in first) return template('model-error');
  let text = narrationText(first.content);
  if (!checkNumbers(text, state)) {
    const bad = foreignNumbers(text, state).join(', ');
    console.info(`narration by ${first.model} rejected: numbers not in the state: ${bad}`);
    if (deadline - Date.now() <= MIN_RETRY_MS) return template('numbers');
    const second = await askModel({
      messages: [
        ...messages,
        { role: 'assistant', content: first.content },
        { role: 'user', content: `These numbers are not in STATE: ${bad}. Rewrite the paragraph using only numbers copied from STATE, or leave them out. Paragraph only.` },
      ],
      models: [first.model],
      apiKey,
      timeoutMs: MODEL_TIMEOUT_MS,
      budgetMs: deadline - Date.now(),
    });
    if ('error' in second) return template('numbers');
    text = narrationText(second.content);
    if (!checkNumbers(text, state)) {
      console.info(`narration retry by ${first.model} rejected: numbers not in the state: ${foreignNumbers(text, state).join(', ')}`);
      return template('numbers');
    }
  }
  return text ? { source: 'model', model: first.model, reply: text } : template('model-error');
}

async function answer(body: Body, request: Request): Promise<Response> {
  const gate = limiter.hit(clientIp(request));
  if (!gate.ok) {
    return Response.json(
      { error: `Too many questions from this address; try again in ${gate.retryAfterS} s`, retryAfterS: gate.retryAfterS },
      { status: 429, headers: { 'Retry-After': String(gate.retryAfterS) } },
    );
  }
  const cachedMode = body.mode === 'cached' || process.env.NEXT_PUBLIC_AI_MODE === 'cached';
  const apiKey = process.env.OPENROUTER_API_KEY?.trim() ?? '';
  if (body.task === 'narrate') return Response.json(await narrate(body.state as StateSummary, apiKey, cachedMode));
  let reply: ChatReply | null = null;
  if (cachedMode) {
    reply = fromCache(body.prompt) ?? fromIntent(body.prompt);
  } else {
    if (apiKey) reply = await fromModel(body.prompt, body.state, apiKey);
    reply = reply ?? fromIntent(body.prompt) ?? fromCache(body.prompt);
  }
  return Response.json(reply ?? { source: 'none', actions: [], reply: NO_ANSWER });
}

/** The last-resort answer when something throws: still 200, still useful, never a stack trace. */
function safeAnswer(body: Body): ChatReply | NarrationReply {
  if (body.task === 'narrate') {
    let reply = 'The brief could not be written; the numbers above stand.';
    try {
      reply = templateBrief(body.state as StateSummary);
    } catch {
      // keep the fixed sentence
    }
    return { source: 'template', reason: 'model-error', reply };
  }
  return { source: 'none', actions: [], reply: NO_ANSWER };
}

/**
 * POST { prompt, state?, mode?, task? }.
 * task "plan" (default) → { source, model?, actions, reply, dropped? }: with a key and live mode the
 * model answers (at most two model answers, inside a 24 s budget), then the intent matcher, then the
 * cached transcripts. Cached mode (`mode: "cached"`, `?demo=1` on the client, or
 * NEXT_PUBLIC_AI_MODE=cached) serves transcripts first and never calls the model. The worst answer is a
 * polite "I could not understand" with no actions.
 * task "narrate" → { source: "model" | "template", reason?, model?, reply }: the brief's paragraph,
 * checked number by number against the state; the template wins any doubt and says why.
 * Never a 500; bad bodies get 400; the 31st request per minute per address gets 429 with Retry-After.
 */
export async function POST(request: Request): Promise<Response> {
  const body = await parseBody(request);
  if (typeof body === 'string') return Response.json({ error: body }, { status: 400 });
  try {
    return await answer(body, request);
  } catch (err) {
    console.error('chat route failed:', err instanceof Error ? err.message : String(err));
    return Response.json(safeAnswer(body));
  }
}
