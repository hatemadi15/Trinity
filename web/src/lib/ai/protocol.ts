import { ACTION_TYPES, type Action } from './actions';
import type { StateSummary } from './state-summary';

export type ChatSource = 'model' | 'cache' | 'intent' | 'none';

/** The brief's paragraph: the model's words when every number checked out, else the deterministic template. */
export interface NarrationReply {
  source: 'model' | 'template';
  /** Why the template was used: the numbers failed the check, no key is configured, demo mode, or the model did not answer. */
  reason?: 'numbers' | 'no-key' | 'cached' | 'model-error';
  model?: string;
  reply: string;
}

/** Why nothing answered: a key is set and every model failed, or no model, phrasing or rehearsed answer fitted the words. */
export type ChatReason = 'model-busy' | 'not-understood';
export const CHAT_REASONS: readonly ChatReason[] = ['model-busy', 'not-understood'];

/** What POST /api/chat returns and the planner strip consumes. */
export interface ChatReply {
  source: ChatSource;
  model?: string;
  actions: Action[];
  reply: string;
  dropped?: string[];
  /** Set when source is "none", so the visitor is told whether the model or their words were the problem. */
  reason?: ChatReason;
}

/** What the model is told about the app, the actions and the rules. Sites are listed so ids are never invented. */
export function systemPrompt(sites: { id: string; name: string }[]): string {
  const siteLines = sites.map((s) => `- ${s.id}: ${s.name}`).join('\n');
  return `You are the planner assistant inside Earthrise, a lunar landing-site and date planner for the Moon's south pole.
The app computes everything itself from NASA data (LOLA terrain, DE440 ephemeris): for one site and period, the share of sunlight, the longest night, how much of the time Earth is in view for radio, and how long a solar lander that lands on the first day keeps power (the time with power, then night); the same for up to four compared sites.
You never compute, invent or guess numbers. Quote a number only if it appears in the STATE JSON you are given; otherwise say the app shows it on screen.

You answer with ONE JSON object and nothing else:
{"actions": [Action, ...], "reply": "one to three short sentences for the user"}

Actions drive the app. Use only these shapes (${ACTION_TYPES.join(', ')}):
{"type": "select_site", "id": SITE_ID}
{"type": "set_window", "startUtc": "YYYY-MM-DDT00:00:00", "days": 14 | 30 | 90}   (either field may be omitted)
{"type": "find_best_window", "days": 14 | 30 | 90, "scope": "site" | "compare"}
{"type": "set_power", "patch": {"panel": "horizontal" | "vertical" | "vertical_tracking" | "full_tracking", "panelAzimuthDeg": 0-360, "areaM2": 0.5-50, "efficiency": 0.05-0.45, "loadW": 10-2000, "batteryWh": 100-50000, "initialSocFraction": 0-1}}   (only the fields to change)
{"type": "set_params", "patch": {"minEarthElDeg": 0-10, "mastM": 0-10}}
{"type": "add_to_compare", "id": SITE_ID}
{"type": "remove_from_compare", "id": SITE_ID}
{"type": "open_page", "page": "explore" | "sites" | "compare" | "validate" | "brief" | "learn"}
{"type": "explain", "topic": "longest night" | "earth gap" | "best window" | "skyline" | "verdict"}   (the reply is then one short sentence; the app adds the paragraph)

SITE_ID must be one of these (id: name):
${siteLines}

Rules:
- Dates are UTC; the ephemeris covers 2024-01-01 to 2036-12-31; periods are 14, 30 or 90 days.
- "sites" is the list of landing sites; "validate" is the Accuracy page; "learn" is How it works.
- To compare sites, add each with add_to_compare and then open_page "compare".
- If the user names a site that is not in the list, do not select anything; say it is not in the catalogue and name the closest ones.
- If the question is about the current numbers, answer from STATE and add no actions.
- Keep replies plain and short. No markdown, no lists, no code fences.`;
}

/** The user turn: the compact app state (or a note that nothing is selected) and the question. */
export function userPrompt(prompt: string, state: StateSummary | null): string {
  const stateText = state ? JSON.stringify(state, null, 1) : 'No site is selected yet (the app is still loading or on a page without a site).';
  return `STATE:\n${stateText}\n\nQUESTION:\n${prompt}`;
}

function stripFences(text: string): string {
  const fenced = text.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
  return fenced ? fenced[1] : text;
}

function parseObject(s: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(s);
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Finds the first `{…}` in the text (strings and escapes respected) that parses as a JSON object.
 * When the model stopped before closing it (a missing final brace, an output cut at max_tokens),
 * the open string, arrays and objects are closed and the result is marked `repaired`.
 */
export function extractJsonDetailed(text: string): { value: Record<string, unknown>; repaired: boolean } | null {
  const src = stripFences(text ?? '');
  for (let start = src.indexOf('{'); start !== -1; start = src.indexOf('{', start + 1)) {
    const open: string[] = [];
    let inString = false;
    let escaped = false;
    let closedAt = -1;
    for (let i = start; i < src.length; i++) {
      const ch = src[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === '{' || ch === '[') open.push(ch);
      else if (ch === '}' || ch === ']') {
        open.pop();
        if (open.length === 0) {
          closedAt = i;
          break;
        }
      }
    }
    if (closedAt !== -1) {
      const value = parseObject(src.slice(start, closedAt + 1));
      if (value) return { value, repaired: false };
      continue; // not JSON after all; try the next opening brace
    }
    // A text that stops inside a number would repair to a different, valid number; leave that to the retry.
    if (!inString && /[\d.\-]\s*$/.test(src)) continue;
    const closers = (inString ? '"' : '') + open.reverse().map((c) => (c === '{' ? '}' : ']')).join('');
    const value = parseObject(src.slice(start) + closers);
    if (value) return { value, repaired: true };
  }
  return null;
}

/** The first JSON object in the text, repaired if it was left unclosed; null otherwise. */
export function extractJson(text: string): Record<string, unknown> | null {
  return extractJsonDetailed(text)?.value ?? null;
}

/** The sentences that end properly; a reply cut mid-sentence loses its tail. */
export function completeSentences(s: string): string {
  return s
    .split(/(?<=[.!?])\s+/)
    .filter((part) => /[.!?]["”)]?$/.test(part))
    .join(' ')
    .trim();
}

/**
 * The model's answer as `{ actions, reply }` with safe defaults, or null when the text holds no JSON
 * object in the envelope shape (an `actions` list or a `reply` string). A bare action object or the
 * inner object of an envelope truncated at max_tokens is not an answer.
 */
export function parseModelReply(text: string): { actions: unknown[]; reply: string } | null {
  const found = extractJsonDetailed(text);
  if (!found) return null;
  const o = found.value;
  const hasActions = Array.isArray(o.actions);
  const hasReply = typeof o.reply === 'string';
  if (!hasActions && !hasReply) return null;
  let reply = hasReply ? (o.reply as string).trim() : '';
  if (found.repaired && reply) reply = completeSentences(reply);
  return { actions: hasActions ? (o.actions as unknown[]) : [], reply };
}
