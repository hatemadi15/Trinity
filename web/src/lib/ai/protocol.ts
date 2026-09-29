import { ACTION_TYPES, type Action } from './actions';
import type { StateSummary } from './state-summary';

export type ChatSource = 'model' | 'cache' | 'intent' | 'none';

/** The brief's paragraph: the model's words when every number checked out, else the deterministic template. */
export interface NarrationReply {
  source: 'model' | 'template';
  model?: string;
  reply: string;
}

/** What POST /api/chat returns and the planner strip consumes. */
export interface ChatReply {
  source: ChatSource;
  model?: string;
  actions: Action[];
  reply: string;
  dropped?: string[];
}

/** What the model is told about the app, the actions and the rules. Sites are listed so ids are never invented. */
export function systemPrompt(sites: { id: string; name: string }[]): string {
  const siteLines = sites.map((s) => `- ${s.id}: ${s.name}`).join('\n');
  return `You are the planner assistant inside Earthrise, a lunar landing-site and date planner for the Moon's south pole.
The app computes everything itself from NASA data (LOLA terrain, DE440 ephemeris): sunlit fraction, longest night, Earth visibility, longest Earth gap, a power budget and a "survive the night" verdict for one site and window, and the same for up to four compared sites.
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
{"type": "set_audience", "audience": "planner" | "learn"}
{"type": "open_page", "page": "explore" | "compare" | "validate" | "brief" | "learn"}
{"type": "explain", "topic": "longest night" | "earth gap" | "best window" | "skyline" | "verdict"}

SITE_ID must be one of these (id: name):
${siteLines}

Rules:
- Dates are UTC; the ephemeris covers 2024-01-01 to 2036-12-31; windows are 14, 30 or 90 days.
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

/** Finds the first balanced `{…}` in the text (strings and escapes respected) that parses as a JSON object; null otherwise. */
export function extractJson(text: string): Record<string, unknown> | null {
  const src = stripFences(text ?? '');
  for (let start = src.indexOf('{'); start !== -1; start = src.indexOf('{', start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < src.length; i++) {
      const ch = src[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          try {
            const value: unknown = JSON.parse(src.slice(start, i + 1));
            if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
          } catch {
            // not JSON after all; try the next opening brace
          }
          break;
        }
      }
    }
  }
  return null;
}

/** The model's answer as `{ actions, reply }` with safe defaults, or null when there is no JSON object at all. */
export function parseModelReply(text: string): { actions: unknown[]; reply: string } | null {
  const o = extractJson(text);
  if (!o) return null;
  return {
    actions: Array.isArray(o.actions) ? o.actions : [],
    reply: typeof o.reply === 'string' ? o.reply.trim() : '',
  };
}
