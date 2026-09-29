# Week 6 — AI Planner, Landing and Polish, Hosting Prep, Submission Drafts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the AI planner (typed questions that drive the UI through deterministic actions, plus a narrated mission brief) on OpenRouter's free models with deterministic fallbacks, ship the landing page and the polish items deferred from earlier weeks, prepare hosting (Vercel + R2) without deploying, and draft the submission package (project page, pitch script, video storyboard, demo checklist).

**Architecture:** The AI layer never computes physics. A request carries the user's prompt and a compact JSON summary of the store; the server (`/api/chat`) asks OpenRouter (chain of free models, temperature 0, 10 s per model) for a JSON object `{ "actions": [...], "reply": "..." }`, validates the actions against a closed schema, and the client applies them to the same Zustand store the pages use. When no key is configured, the model fails, or `?demo=1` is set, the server answers from cached transcripts (keyed by the normalised prompt) or a regex intent matcher; the UI never blocks on the model. Brief narration is checked number by number against the state summary and falls back to a template. Hosting prep is documentation plus a pipeline `publish-r2` command and Vercel config; the actual deployment waits for the user's go.

**Tech Stack:** unchanged for the web (plain `fetch` to OpenRouter; no AI SDK). Pipeline adds `boto3` (S3 API for R2). No large downloads.

**Spec:** `docs/superpowers/specs/2026-09-28-clps-lunar-mission-browser-design.md` (sections 2 UX flow "Land", 3 differentiators "AI planner" and "Export brief", 5.5 AI layer, 5.6 hosting and offline, 7 presentation, 8 Week 6).

## Design plan (frontend-design)

The planner is a quiet strip, not a chat app: one input ("Ask the planner: compare de Gerlache Rim 2 and Nobile Rim 2 for 14 days"), one reply paragraph, and a small source line under it ("answered by gemma-4-31b" / "rehearsed answer" / "matched your words") so a judge can see when the model was used. Four example chips sit under the input when the transcript is empty. The landing page opens on the pitch line "When is the Sun up, and can Earth hear you?" with three mission cards that each open Explore on a real story: de Gerlache Rim 2 (Artemis III), IM-2 (died in a day on its side), Blue Ghost M1 (lived the whole day); one accent, no gradients. The brief gains a narrated paragraph above the numbers, set in the same type, with a "narrated by" line.

## Global Constraints

- All model calls go through OpenRouter with the server-side `OPENROUTER_API_KEY`; never a local model; the key is never logged or sent to the browser.
- Model chain (free tier, in order, each with a 10 s timeout, `temperature: 0`, `max_tokens: 600`): `google/gemma-4-31b-it:free`, `nvidia/nemotron-3-super-120b-a12b:free`, `qwen/qwen3.8-27b:free`, `nvidia/nemotron-3.5-lightning:free`; overridable with `OPENROUTER_MODELS` (comma-separated). Verified on 2026-09-29 that all four are listed by `GET https://openrouter.ai/api/v1/models` with tool support.
- At most two model calls per request (one retry when the JSON does not parse); after that, deterministic fallbacks only.
- Output contract: the model answers with one JSON object `{ "actions": Action[], "reply": string }`; anything else is parsed leniently (first balanced `{…}` block, code fences stripped) and otherwise treated as a failure.
- Actions are a closed set validated on the server and again on the client: `select_site`, `set_window`, `find_best_window`, `set_power`, `set_params`, `add_to_compare`, `remove_from_compare`, `set_audience`, `open_page`, `explain`. Unknown actions or fields are dropped; site ids must exist in the catalogue.
- Numbers rule for narration: every number in a model reply must appear in the state summary (after normalising `%`, `h`, `d`, decimals); otherwise retry once, then use the template brief.
- Rate limit `/api/chat`: 30 requests per minute per IP (in-memory sliding window; documented as per-instance on Vercel).
- `?demo=1` (or `NEXT_PUBLIC_AI_MODE=cached`) forces cached transcripts; the twelve rehearsed prompts in `web/src/lib/ai/transcripts.json` cover the pitch.
- No deployment, DNS, bucket creation or key handling in this plan: `docs/hosting.md` and `pipeline publish-r2 --dry-run` prepare them; the user runs the live steps.
- Tests: `npm test` and `uv run pytest -q` stay green; Playwright checks at 1360×900 for the landing page, the planner strip on Explore (cached mode) and the narrated brief.

## Review Focus

1. **Model returns prose without JSON** (common on free models): the route falls back to intents/cache and the UI shows a reply, never a blank or an unhandled rejection. Pinned by Task 2 `falls back to the intent matcher when the model returns no JSON`.
2. **Model invents a site id** ("select_site: shackleton_east_rim"): the validator drops the action and the reply says the site was not found. Pinned by Task 1 `validateActions drops unknown sites and fields`.
3. **31st request within a minute**: 429 with `Retry-After`, and the planner strip says so instead of failing silently. Pinned by Task 2 `rate limits per IP` and Task 3 `shows the rate-limit copy`.
4. **`?demo=1` with a key configured**: cached transcripts are used and the source line says "rehearsed answer". Pinned by Task 2 `demo mode ignores the key`.
5. **Narration with a number that is not in the state**: the brief shows the template paragraph. Pinned by Task 4 `checkNumbers rejects invented figures`.

---

### Task 1: Actions, site matching, intents and state summary (offline core)

**Files:**
- Create: `web/src/lib/ai/actions.ts`, `web/src/lib/ai/actions.test.ts`, `web/src/lib/ai/intents.ts`, `web/src/lib/ai/intents.test.ts`, `web/src/lib/ai/state-summary.ts`, `web/src/lib/ai/state-summary.test.ts`

**Interfaces:**
```ts
export type Action =
  | { type: 'select_site'; id: string }
  | { type: 'set_window'; startUtc?: string; days?: 14 | 30 | 90 }
  | { type: 'find_best_window'; days: 14 | 30 | 90; scope?: 'site' | 'compare' }
  | { type: 'set_power'; patch: Partial<PowerConfig> }
  | { type: 'set_params'; patch: { minEarthElDeg?: number; mastM?: number } }
  | { type: 'add_to_compare'; id: string }
  | { type: 'remove_from_compare'; id: string }
  | { type: 'set_audience'; audience: 'planner' | 'learn' }
  | { type: 'open_page'; page: 'explore' | 'compare' | 'validate' | 'brief' | 'learn' }
  | { type: 'explain'; topic: string };
export function validateActions(input: unknown, siteIds: ReadonlySet<string>): { actions: Action[]; dropped: string[] }
export function siteByName(sites: Site[], text: string): Site | null      // token overlap, accents and punctuation stripped, ≥ 2 shared tokens or an exact id
export async function applyActions(store: StoreApi<ExploreState>, actions: Action[], navigate: (page: string) => void): Promise<string[]>  // returns notes ("Selected Nobile Rim 2", "Found the best 14-day window: 2027-03-04")
export interface Intent { pattern: RegExp; build: (m: RegExpMatchArray, sites: Site[]) => { actions: Action[]; reply: string } | null }
export const INTENTS: Intent[]  // the twelve rehearsed phrasings
export function matchIntent(prompt: string, sites: Site[]): { actions: Action[]; reply: string } | null
export interface StateSummary { site: { id, name, lat, lon }; window: { startUtc, days }; summary: Summary; power: { socMin, brownoutHours, survives, meanPowerW }; params: PlannerParams; compare: { id, name, illumFraction, earthVisFraction, survives }[]; audience }
export function summarizeState(s: ExploreState): StateSummary | null
```
The twelve intents (regex, case-insensitive, with the site matcher for names): show/select/go to `<site>`; compare `<a>` and `<b>` (adds both, opens compare); add `<site>` to compare; best `<14|30|90>`-day window; start on `<date>` (for `<n>` days); set (the) load to `<n>` W; set (the) battery to `<n>` Wh; use a `<horizontal|vertical|tracking|two-axis>` panel; (set the) mast (height) to `<n>` m; switch to `<learn|planner>` (mode); open `<compare|validate|brief|explore|learn>`; explain `<topic>` (longest night, Earth gap, best window, skyline, verdict) with fixed one-paragraph answers from `EXPLANATIONS`.

- [ ] **Step 1: Failing tests** — `validateActions` keeps a valid list, drops `{type:'launch_rocket'}`, drops `select_site` with an unknown id (returned in `dropped`), coerces `days: "30"` to 30 and rejects 45, ignores extra fields in `set_power` and clamps to the planner ranges; `siteByName` matches "nobile 2" → `nobile_rim_2`, "shackleton rim" → `shackleton_center_rim_high`, "de gerlache rim 2" → `de_gerlache_rim_2`, "blue ghost" → `blue_ghost_m1`, "mars base" → null; `matchIntent` covers each of the twelve phrasings with expected actions and returns null for "what is the meaning of life"; `applyActions` against a fake store records `selectSite('nobile_rim_2')`, `setWindow('2027-03-01T00:00:00', 14)`, `setPower({ loadW: 300 })`, `addToCompare`, `findBestWindow(14, 'site')`, `setAudience('learn')` and calls `navigate('/compare')` for `open_page`; `summarizeState` on a file-backed store (as in `explore.test.ts`) returns the site, window, rounded fractions and compare rows.
- [ ] **Step 2: Run** `cd web && npx vitest run src/lib/ai` → FAIL (modules missing).
- [ ] **Step 3: Implement** the four modules. Validation is hand-written (no schema library): a table of action types to field checkers; `set_power` fields clamped with the same ranges as `PlannerParamsPanel` (export those ranges from a shared `web/src/lib/planner-ranges.ts` and use them in the panel too).
- [ ] **Step 4: Run** → PASS; `npx tsc --noEmit`; lint.
- [ ] **Step 5: Commit** `feat(web): planner actions, site matching, rehearsed intents and state summary`.

---

### Task 2: `/api/chat` with OpenRouter, cached transcripts, rate limit

**Files:**
- Create: `web/src/lib/ai/openrouter.ts`, `web/src/lib/ai/openrouter.test.ts`, `web/src/lib/ai/protocol.ts`, `web/src/lib/ai/protocol.test.ts`, `web/src/lib/ai/transcripts.json`, `web/src/lib/ai/cache.ts`, `web/src/lib/ai/cache.test.ts`, `web/src/lib/ai/rate-limit.ts`, `web/src/lib/ai/rate-limit.test.ts`, `web/src/app/api/chat/route.ts`, `web/src/app/api/chat/route.test.ts`, `web/.env.example`

**Interfaces:**
```ts
export async function askModel(opts: { messages: { role: 'system' | 'user' | 'assistant'; content: string }[]; models: string[]; apiKey: string; timeoutMs?: number; fetchImpl?: typeof fetch }): Promise<{ model: string; content: string } | { error: string }>
export function systemPrompt(sites: { id: string; name: string }[]): string
export function extractJson(text: string): unknown | null
export function normalizePrompt(p: string): string           // lower-case, collapse spaces, strip punctuation
export function cachedAnswer(prompt: string): { actions: Action[]; reply: string } | null
export class SlidingWindowLimiter { constructor(limit: number, windowMs: number); hit(key: string, now?: number): { ok: boolean; retryAfterS: number } }
// POST /api/chat  body { prompt: string; state: StateSummary | null; mode?: 'live' | 'cached' }
//   → 200 { source: 'model' | 'cache' | 'intent'; model?: string; actions: Action[]; reply: string; dropped?: string[] }
//   → 429 { error, retryAfterS } · 400 { error }
```
`askModel` posts to `https://openrouter.ai/api/v1/chat/completions` with `Authorization: Bearer`, `HTTP-Referer: https://github.com/hatemadi15/Trinity`, `X-Title: Earthrise`, `{ model, messages, temperature: 0, max_tokens: 600 }`, `AbortSignal.timeout(timeoutMs)`; on 429/5xx/timeout/network error it moves to the next model; returns the first assistant content.

- [ ] **Step 1: Failing tests** — `extractJson` reads a fenced block, a bare object with trailing prose, returns null for prose; `askModel` with a stub fetch: model 1 answers 429 → model 2 used; all fail → `{ error }`; timeout honoured (stub that never resolves with a 50 ms timeout); `cachedAnswer('Show me Nobile Rim 2')` returns the transcript entry; `SlidingWindowLimiter(30, 60000)`: 30 hits ok, 31st `ok:false` with `retryAfterS ≥ 1`, a new key independent; route: with `OPENROUTER_API_KEY` set (via `vi.stubEnv`) and a stub fetch returning `{"actions":[{"type":"select_site","id":"nobile_rim_2"}],"reply":"Nobile Rim 2 selected."}` in a code fence → `source: 'model'`; model returns prose → `source: 'intent'` when the prompt matches, else `source: 'cache'` or a polite "I could not understand" reply with `actions: []` (never 500); `mode: 'cached'` with the key set → `source: 'cache'` and fetch never called (Review Focus 4); no key → intent/cache path; 31 requests from one IP → 429 (Review Focus 3); invalid body → 400.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**. `transcripts.json`: the twelve rehearsed prompts with actions and replies (write real replies using the numbers from the fixtures where they quote numbers, or number-free wording). `.env.example`: `OPENROUTER_API_KEY=`, `OPENROUTER_MODELS=google/gemma-4-31b-it:free,nvidia/nemotron-3-super-120b-a12b:free,qwen/qwen3.8-27b:free,nvidia/nemotron-3.5-lightning:free`, `NEXT_PUBLIC_AI_MODE=live`, `AI_RATE_LIMIT_PER_MIN=30`, `NEXT_PUBLIC_DATA_BASE=/data`.
- [ ] **Step 4: Run** → PASS; tsc; lint.
- [ ] **Step 5: Commit** `feat(web): /api/chat on OpenRouter free models with cached transcripts, intent fallback and a rate limit`.

---

### Task 3: Planner strip on Explore and Compare

**Files:**
- Create: `web/src/components/PlannerChat.tsx`, `web/src/components/PlannerChat.test.tsx`, `web/src/lib/ai/client.ts` (`askPlanner(prompt, state, mode, fetchImpl)`), `web/src/lib/ai/client.test.ts`
- Modify: `web/src/components/ExploreView.tsx`, `web/src/components/CompareView.tsx` (mount the strip under the controls), `web/src/lib/store/explore.ts` (`aiMode: 'live' | 'cached'` from `?demo=1` or `NEXT_PUBLIC_AI_MODE`, set by a small `useDemoMode` hook in the views)

- [ ] **Step 1: Failing tests** — `PlannerChat` with an injected `ask`: submitting "show me nobile rim 2" applies `select_site` on the injected store and shows the reply and the source line "answered by gemma-4-31b"; `ask` rejecting → "The planner is offline" copy with four chips; clicking a chip fills the input; a 429 result → "Too many questions; try again in N s"; Enter submits; the transcript keeps the last five exchanges.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** (collapsible like the params panel, default open on Explore; `useDemoMode` reads `useSearchParams` inside a Suspense boundary; actions applied through `applyActions` with `router.push`).
- [ ] **Step 4: Run** → PASS; tsc; lint. Playwright (dev server with no key): the strip answers "compare de gerlache rim 2 and nobile rim 2" from the intent matcher and navigates to Compare with two columns; `?demo=1` shows "rehearsed answer".
- [ ] **Step 5: Commit** `feat(web): planner strip that drives Explore and Compare through validated actions`.

---

### Task 4: Narrated mission brief

**Files:**
- Create: `web/src/lib/ai/narrate.ts` (`checkNumbers(reply, summary)`, `templateBrief(summary)`, `narrationPrompt(summary)`), `web/src/lib/ai/narrate.test.ts`
- Modify: `web/src/app/api/chat/route.ts` (task `narrate` returns `{ reply, source }`), `web/src/components/BriefView.tsx` (narration paragraph + "Write the brief" button, template shown by default), `web/src/components/BriefView.test.tsx`

- [ ] **Step 1: Failing tests** — `checkNumbers("Sun above the skyline 100 % of the time; longest Earth gap 9 d 9 h", summary)` true; with "87 %" false; `templateBrief` deterministic and mentions the verdict; route task `narrate` with a model reply containing an invented number → `source: 'template'`; BriefView shows the template by default and the model paragraph after the button when `ask` resolves.
- [ ] **Step 2–5:** implement, run, lint, commit `feat(web): narrated mission brief with number checks and a template fallback`.

---

### Task 5: Landing page, URL state and polish items

**Files:**
- Modify: `web/src/app/page.tsx` (hero + three mission cards), `web/src/components/ExploreView.tsx` (apply `?site=&start=&days=` once on load; compact layout: dome max 260 px, KPI grid three columns at ≥ 1280 px), `web/src/components/CompareView.tsx` ("Both at once" row instead of the duplicated brownout row), `web/src/lib/store/explore.ts` (`applyQuery(params)`; `maskBusy` reset in `selectSite`'s catch; subtitle hint while a mast recompute is in flight via `maskBusy`), `web/src/components/three/Terrain.tsx` (dispose geometries on swap), `web/src/lib/store/explore.test.ts`, `web/src/components/CompareView.test.tsx`, `web/src/app/page.test.tsx` (new)
- Deferred minors addressed here: Week 4 #8, #9, #11; Week 3 M2. Everything else stays deferred.

- [ ] **Step 1: Failing tests** — landing renders three cards linking to `/explore?site=de_gerlache_rim_2`, `/explore?site=im2_athena&start=2025-03-06`, `/explore?site=blue_ghost_m1&start=2025-03-02` (the Blue Ghost card explains it is a mare site with a flat skyline); `applyQuery` selects the site and window, ignores unknown ids and bad dates; Compare shows "Both at once"; `selectSite` failure resets `maskBusy`.
- [ ] **Step 2–5:** implement, run, lint, Playwright at 1360×900 and 1024×900 (landing, Explore with the timeline above the fold at 900 px), commit `feat(web): landing page with mission cards, URL state, compact Explore layout and deferred fixes`.

Note: `blue_ghost_m1` is not polar and has no mask; `applyQuery` must route it through a flat-skyline mask (720 zeros) with `maskMeta.source = 'computed'` and a subtitle note "flat horizon (no LOLA polar coverage)", or skip it if that lands outside the store's assumptions (decide and ledger).

---

### Task 6: Hosting prep (no deploy)

**Files:**
- Create: `docs/hosting.md`, `web/vercel.json`, `web/.vercelignore`, `pipeline/lunar_pipeline/publish_r2.py`, `pipeline/tests/test_publish_r2.py`
- Modify: `pipeline/pyproject.toml` (boto3), `pipeline/lunar_pipeline/cli.py` (`publish-r2 [--dry-run] [--prefix data]`), `web/next.config.ts` (headers: `/data/:path*` → `Cache-Control: public, max-age=31536000, immutable` for local serving), `README.md`

- [ ] **Step 1: Failing tests** — `plan_uploads(root)` lists every file under `web/public/data` with a content type (`.json` → application/json, `.f32`/`.u16`/`.bin` → application/octet-stream, `.jpg` → image/jpeg) and the immutable cache header; `--dry-run` prints the plan without a client; `vercel.json` parses and has the `/data` headers.
- [ ] **Step 2–5:** implement (`boto3` client from `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, endpoint `https://<account>.r2.cloudflarestorage.com`; skip unchanged files by size+etag; CORS config JSON in the doc), run, commit `chore: hosting preparation (Vercel config, R2 publisher, docs)`.

`docs/hosting.md` contents: Vercel Hobby import steps (root `web/`, env vars, region), R2 bucket + Worker or custom domain for `NEXT_PUBLIC_DATA_BASE`, CORS JSON, GitHub Release mirror, offline venue mode (`npm run build && npm start`, `sync-local --tiles`), the Plan B (Cloudflare Pages via `@opennextjs/cloudflare`), and a "go-live checklist" the user runs.

---

### Task 7: Submission drafts and closeout

**Files:**
- Create: `docs/submission.md` (project page draft in the spec's order, NASA data list, AI use and pre-existing code disclosure, team), `docs/pitch.md` (5:00 script with timings), `docs/video-storyboard.md` (30 s, captions only), `docs/demo-checklist.md`
- Modify: `README.md`, `web/README.md`

- [ ] Write the drafts from the spec's sections 7 and 9 with the real numbers from `/validate`; gates (`uv run pytest -q`, `cd web && npm test && npx tsc --noEmit && npm run lint && npm run build`); commit `docs: submission package drafts (project page, pitch, storyboard, demo checklist)`. Then review-package, fresh reviewer, fix pass, PR against `feat/week5-validation-brief-learn`.
