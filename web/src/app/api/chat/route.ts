import { describeDropped, validateActions } from '@/lib/ai/actions';
import { cachedAnswer } from '@/lib/ai/cache';
import { matchIntent } from '@/lib/ai/intents';
import { cleanNarration, isStateSummary, narrationProblems, narrationPrompt, numbersIn, stripForeignNumbers, templateBrief } from '@/lib/ai/narrate';
import { runChain } from '@/lib/ai/chain';
import { geminiFromEnv, geminiText, type GeminiSettings } from '@/lib/ai/gemini';
import { callOpenRouter, DEFAULT_MAX_TOKENS, modelsFromEnv, type ChatMessage } from '@/lib/ai/openrouter';
import { parseModelReply, systemPrompt, userPrompt, type ChatReason, type ChatReply, type NarrationReply } from '@/lib/ai/protocol';
import { clientIp, SlidingWindowLimiter } from '@/lib/ai/rate-limit';
import type { StateSummary } from '@/lib/ai/state-summary';
import catalogue from '@/lib/data/catalogue.json';
import type { Site } from '@/lib/data/loaders';

export const dynamic = 'force-dynamic';
/** Vercel function cap (seconds); the model budget below keeps a normal request far under it. */
export const maxDuration = 60;

/** Each model in the chain gets at most this long. Override with AI_MODEL_TIMEOUT_MS. */
const DEFAULT_MODEL_TIMEOUT_MS = 10_000;
/** Total model time per request, first answer plus one retry, kept under the browser's 30 s wait. Override with AI_MODEL_BUDGET_MS. */
const DEFAULT_MODEL_BUDGET_MS = 24_000;
/** Share of the budget for the first answer; the rest is for the retry. */
const FIRST_SHARE = 0.8;
/** Below this much remaining budget a retry is not worth starting. */
const MIN_RETRY_MS = 500;
const MAX_PROMPT_CHARS = 2000;
const MAX_STATE_CHARS = 16_000;
const SITES = catalogue.sites as Site[];
const SITE_IDS: ReadonlySet<string> = new Set(SITES.map((s) => s.id));
/** Every name and label in the catalogue: the claim check fails figures given for a site outside the state. */
const SITE_NAMES: readonly string[] = SITES.flatMap((s) => [s.name, s.label ?? '']).filter(Boolean);
/** How many of the check's findings the retry nudge, the log and the reply carry. */
const MAX_PROBLEMS = 3;
const RETRY_NUDGE = 'Answer again with ONE JSON object only, in the form {"actions": [...], "reply": "..."} and no other text.';
/** Phrasings the app answers without the model, in the words the pages use. */
const TRY = 'Try: "show me Nobile Rim 2", "compare de Gerlache Rim 2 and Nobile Rim 2 for 14 days", "find the best landing date for 14 days", "set the load to 300 W" or "explain the longest night".';
const NO_ANSWER = `I could not understand that. ${TRY}`;
// Free models time out and hit rate limits often; then the visitor's words were not the problem, so say so.
const MODEL_BUSY = `The language model did not answer just now, so only set phrasings work. ${TRY}`;

const limiter = new SlidingWindowLimiter(Number(process.env.AI_RATE_LIMIT_PER_MIN) || 30, 60_000);
const modelBudgetMs = () => Number(process.env.AI_MODEL_BUDGET_MS) || DEFAULT_MODEL_BUDGET_MS;
const modelTimeoutMs = () => Number(process.env.AI_MODEL_TIMEOUT_MS) || DEFAULT_MODEL_TIMEOUT_MS;

function noAnswer(reason: ChatReason): ChatReply {
  return { source: 'none', actions: [], reply: reason === 'model-busy' ? MODEL_BUSY : NO_ANSWER, reason };
}

/** Who asks: Luna (spec 22) gets Gemini first; "Ask in plain words", the brief and the planner keep OpenRouter first. */
type Asker = 'luna' | 'ask';

interface Body {
  task: 'plan' | 'narrate';
  prompt: string;
  state: StateSummary | null;
  mode: 'live' | 'cached';
  from: Asker;
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
  if (o.from !== undefined && o.from !== 'luna' && o.from !== 'ask') return 'from must be "luna" or "ask"';
  let state = o.state && typeof o.state === 'object' && !Array.isArray(o.state) ? (o.state as StateSummary) : null;
  // A real summary is about 1 KB; anything much larger is not ours and must not reach a prompt.
  if (state && JSON.stringify(state).length > MAX_STATE_CHARS) state = null;
  if (o.task === 'narrate' && !isStateSummary(state)) return 'narrate needs the state summary of a loaded site';
  return { task: o.task === 'narrate' ? 'narrate' : 'plan', prompt, state, mode: o.mode === 'cached' ? 'cached' : 'live', from: o.from === 'luna' ? 'luna' : 'ask' };
}

/** A model to ask: one of OpenRouter's, or Gemini. */
interface Candidate {
  provider: 'openrouter' | 'gemini';
  model: string;
}

/** What this request may use: OpenRouter's key, Gemini's settings; neither in cached mode, where no model is asked. */
interface Keys {
  openrouter: string;
  gemini: GeminiSettings | null;
}

/** Whether any model can be asked. */
const anyModel = (keys: Keys) => Boolean(keys.openrouter || keys.gemini);

/** One model's answer, through its own provider: Gemini with JSON output when the task expects JSON. */
function caller(keys: Keys, messages: ChatMessage[], json: boolean) {
  return (c: Candidate, signal: AbortSignal) =>
    c.provider === 'gemini'
      ? geminiText({ model: c.model, apiKey: keys.gemini?.apiKey ?? '', messages, maxTokens: DEFAULT_MAX_TOKENS, json, signal })
      : callOpenRouter(c.model, messages, keys.openrouter, { signal });
}

/** Asks the candidates in turn inside `budgetMs`, each at most AI_MODEL_TIMEOUT_MS. */
function ask(keys: Keys, chain: Candidate[], messages: ChatMessage[], json: boolean, budgetMs: number) {
  return runChain({ chain, label: (c) => c.model, call: caller(keys, messages, json), timeoutMs: modelTimeoutMs(), budgetMs });
}

/**
 * The first answer, in the asker's order, inside the first answer's share of the budget (the rest is for one retry).
 * Luna: Gemini first, then the OpenRouter chain. Everyone else ("Ask in plain words", the brief): the OpenRouter chain
 * first, as the owner wants, and Gemini last, which may then use what is left of the whole budget, so a chain that
 * hangs still leaves it time.
 */
async function firstAnswer(keys: Keys, from: Asker, messages: ChatMessage[], json: boolean, deadline: number) {
  const openrouter: Candidate[] = keys.openrouter ? modelsFromEnv().map((model) => ({ provider: 'openrouter', model })) : [];
  const gemini: Candidate[] = keys.gemini ? [{ provider: 'gemini', model: keys.gemini.textModel }] : [];
  const share = Math.round((deadline - Date.now()) * FIRST_SHARE);
  if (from === 'luna') return ask(keys, [...gemini, ...openrouter], messages, json, share);
  const first = await ask(keys, openrouter, messages, json, share);
  if (!('error' in first) || gemini.length === 0) return first;
  const last = await ask(keys, gemini, messages, json, deadline - Date.now());
  return 'error' in last ? { error: [openrouter.length ? first.error : '', last.error].filter(Boolean).join('; ') } : last;
}

/**
 * The model's answer for a plan question; null when an answer came back but nothing in it was usable, and
 * "busy" when no model answered at all (timeouts, rate limits, empty answers). Either way the fallbacks try next.
 */
async function fromModel(prompt: string, state: StateSummary | null, keys: Keys, from: Asker): Promise<ChatReply | 'busy' | null> {
  const deadline = Date.now() + modelBudgetMs();
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt(SITES) },
    { role: 'user', content: userPrompt(prompt, state) },
  ];
  const first = await firstAnswer(keys, from, messages, true, deadline);
  if ('error' in first) return 'busy';
  let parsed = parseModelReply(first.content);
  if (!parsed && deadline - Date.now() > MIN_RETRY_MS) {
    // One retry on the model that answered, with a nudge back to the contract.
    const second = await ask(keys, [first.candidate], [...messages, { role: 'assistant', content: first.content }, { role: 'user', content: RETRY_NUDGE }], true, deadline - Date.now());
    if (!('error' in second)) parsed = parseModelReply(second.content);
  }
  if (!parsed) return null;
  const { actions, dropped } = validateActions(parsed.actions, SITE_IDS);
  // Every number the user reads must be one the app can vouch for: the state, the user's own figures
  // in the question, or a window length. Sentences with any other number go.
  const reply = state && isStateSummary(state) ? stripForeignNumbers(parsed.reply, state, [...numbersIn(prompt), '14', '30', '90'], SITE_NAMES) : parsed.reply;
  if (actions.length === 0 && !reply) return null;
  const text = [reply || 'Done.', describeDropped(dropped)].filter(Boolean).join(' ');
  return { source: 'model', model: first.candidate.model, actions, reply: text, dropped };
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
 * The brief's paragraph: the model's words when every claim in them holds against the state (one retry, told what
 * failed), else the template with the reason and, when the check failed it, the first things it found.
 */
async function narrate(state: StateSummary, keys: Keys, cachedMode: boolean, from: Asker): Promise<NarrationReply> {
  const template = (reason: NonNullable<NarrationReply['reason']>, problems?: string[]): NarrationReply => ({
    source: 'template',
    reason,
    reply: templateBrief(state),
    ...(problems?.length ? { problems: problems.slice(0, MAX_PROBLEMS) } : {}),
  });
  if (cachedMode) return template('cached');
  if (!anyModel(keys)) return template('no-key');
  const deadline = Date.now() + modelBudgetMs();
  const messages = narrationPrompt(state);
  const first = await firstAnswer(keys, from, messages, false, deadline);
  if ('error' in first) return template('model-error');
  const by = first.candidate.model;
  let text = cleanNarration(first.content);
  let problems = narrationProblems(text, state, SITE_NAMES);
  if (problems.length) {
    const found = problems.slice(0, MAX_PROBLEMS).join('; ');
    console.info(`narration by ${by} rejected: ${found} — "${text.slice(0, 240)}"`);
    if (deadline - Date.now() <= MIN_RETRY_MS) return template('numbers', problems);
    const second = await ask(
      keys,
      [first.candidate],
      [
        ...messages,
        { role: 'assistant', content: first.content },
        {
          role: 'user',
          content: `These claims do not match STATE: ${found}. Rewrite the paragraph: put each number next to what it measures, with its unit, copied from STATE; give no causes or comparisons STATE does not give; leave out anything you cannot copy. Paragraph only.`,
        },
      ],
      false,
      deadline - Date.now(),
    );
    if ('error' in second) return template('numbers', problems);
    text = cleanNarration(second.content);
    problems = narrationProblems(text, state, SITE_NAMES);
    if (problems.length) {
      console.info(`narration retry by ${by} rejected: ${problems.slice(0, MAX_PROBLEMS).join('; ')}`);
      return template('numbers', problems);
    }
  }
  return text ? { source: 'model', model: by, reply: text } : template('model-error');
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
  // Cached mode (the offline build, ?demo=1) never asks a model, Gemini included.
  const keys: Keys = cachedMode ? { openrouter: '', gemini: null } : { openrouter: process.env.OPENROUTER_API_KEY?.trim() ?? '', gemini: geminiFromEnv() };
  if (body.task === 'narrate') return Response.json(await narrate(body.state as StateSummary, keys, cachedMode, body.from));
  let reply: ChatReply | null = null;
  let busy = false;
  if (cachedMode) {
    reply = fromCache(body.prompt) ?? fromIntent(body.prompt);
  } else {
    if (anyModel(keys)) {
      const model = await fromModel(body.prompt, body.state, keys, body.from);
      busy = model === 'busy';
      reply = model === 'busy' ? null : model;
    }
    reply = reply ?? fromIntent(body.prompt) ?? fromCache(body.prompt);
  }
  return Response.json(reply ?? noAnswer(busy ? 'model-busy' : 'not-understood'));
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
  return noAnswer('not-understood');
}

/**
 * POST { prompt, state?, mode?, task?, from? }.
 * task "plan" (default) → { source, model?, actions, reply, dropped?, reason? }: with a key and live mode a
 * model answers (at most two model answers, inside a 24 s budget), then the intent matcher, then the
 * cached transcripts. The models: Gemini (GEMINI_API_KEY) and OpenRouter's chain (OPENROUTER_API_KEY), in the
 * asker's order: `from: "luna"` asks Gemini first, anyone else OpenRouter first and Gemini last; `model` names the
 * one that answered. Cached mode (`mode: "cached"`, `?demo=1` on the client, or
 * NEXT_PUBLIC_AI_MODE=cached) serves transcripts first and never calls the model. When nothing answers,
 * the reply has no actions, says why in `reason` ("model-busy" when a key is set and every model failed,
 * else "not-understood") and offers five phrasings that work without the model.
 * task "narrate" → { source: "model" | "template", reason?, problems?, model?, reply }: the brief's paragraph,
 * checked claim by claim against the state (each number on its measure, unit, site and sign; states, comparisons
 * and causes); the template wins any doubt and says why, with the first problems the check found.
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
