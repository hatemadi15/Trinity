# Week 7 — Polish Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix what the first live run with the OpenRouter key and the first visual pass exposed (a reply collapsing to "Done.", a model that omits the closing brace, the strip collapsed after navigating to Compare, a narration rejected for unit conversions), and clear the cheap deferred minors from Weeks 3–6 before the event.

**Architecture:** No new subsystems. Small, tested changes in the AI layer (`web/src/lib/ai/`), the planner strip, the store, the Horizons proxy, the R2 publisher and two copy lines; docs updated for the verified model chain.

**Tech Stack:** unchanged.

**Spec:** `docs/superpowers/specs/2026-09-28-clps-lunar-mission-browser-design.md` (5.5 AI layer, 7 presentation); findings from PR #7's review and the live run of 2026-09-29.

## Global Constraints

- Verified free model chain (2026-09-29, live probes): `qwen/qwen3.8-27b:free` (0.6 s, valid JSON), `nvidia/nemotron-3-super-120b-a12b:free` (1.6 s, valid JSON but no closing brace), `google/gemma-4-31b-it:free` (429 at probe time), `nvidia/nemotron-3.5-lightning:free` (timed out at 20 s). No GLM model is free on OpenRouter today. The chain order becomes qwen, nemotron-super, gemma, lightning everywhere (`DEFAULT_MODELS`, `.env.example`, docs).
- The number rules stay: a planner reply may use numbers from the state, from the user's own prompt and the window lengths 14/30/90; a narration may use numbers from the state in any reader's form, now including kW/kWh and the window's end date.
- Every change test-first; `npm test`, `uv run pytest -q`, `npx tsc --noEmit`, `npm run lint`, `npm run build` green; a Playwright re-run of the live planner question and the narrated brief at the end.
- The key stays in `web/.env.local`; nothing in this plan logs or commits it.

## Review Focus

1. **A model answer with a missing final brace** (seen live from nemotron-super): the repair closes it and the actions apply; a truncated string reply is trimmed to complete sentences. Pinned by Task 1.
2. **The user's own number in the reply** ("for 14 days" when the window was 30): the reply keeps it. Pinned by Task 2.
3. **Compare after "compare A and B"**: the strip is open with the reply and source line visible. Pinned by Task 3.
4. **"go to compare"**: opens Compare instead of "no site called compare". Pinned by Task 4.
5. **A 5 MB `state` body**: the route ignores it (treats the state as absent) rather than stringifying it into a prompt. Pinned by Task 5.

---

### Task 1: Model output repair and the verified chain

**Files:** Modify `web/src/lib/ai/protocol.ts`, `protocol.test.ts`, `openrouter.ts`, `openrouter.test.ts`, `web/src/app/api/chat/route.test.ts`, `web/.env.example`, `docs/hosting.md`, `docs/submission.md`, `README.md`.

- [ ] Tests: `extractJson` closes a missing final `}` (and `]`, and an open string) and reports `repaired`; `parseModelReply` trims a repaired reply to complete sentences; `DEFAULT_MODELS` order is qwen, nemotron-super, gemma, lightning; route: a truncated envelope now answers from the model with the action applied and the reply "Done." (one fetch).
- [ ] Implement; run; commit `fix(web): repair unclosed model JSON; verified free-model chain`.

### Task 2: Number checks that accept the reader's forms

**Files:** Modify `web/src/lib/ai/narrate.ts`, `narrate.test.ts`, `web/src/app/api/chat/route.ts`, `route.test.ts`.

- [ ] Tests: `allowedNumbers` includes kW/kWh forms (1686 W → "1.7", "1.69"; 2000 Wh → "2"; 200 W → "0.2"), the window end date (2027-01-31 for 30 days from 2027-01-01 → "31"), and `stripForeignNumbers(reply, state, extra)` keeps the user's numbers; route: reply "Comparing them for 14 days." survives with a 30-day state when the prompt says 14; narration rejections log the foreign numbers with `console.info` (spy) and never the key.
- [ ] Implement; run; commit `fix(web): number checks accept unit conversions, the window end and the user's own figures`.

### Task 3: Strip visible after navigation; Explore height

**Files:** Modify `web/src/components/PlannerChat.tsx`, `PlannerChat.test.tsx`, `web/src/components/ExploreView.tsx`.

- [ ] Tests: a strip mounted with a non-empty transcript starts open even without `defaultOpen`; the collapsed header still shows the latest reply.
- [ ] Implement (initial `open` = `defaultOpen || plannerLog has entries`; 3D canvas `min-h-[400px]`); run; commit `fix(web): planner strip opens when it has something to show`.

### Task 4: Intents, matcher and cache minors

**Files:** Modify `web/src/lib/ai/intents.ts`, `intents.test.ts`, `actions.ts`, `actions.test.ts`, `cache.ts`, `cache.test.ts`.

- [ ] Tests: "go to compare", "take me to the brief", "show me the validate page" open pages; "set the load to 5000 W" replies with the clamped 2000 W; "compare A and B for 20 days" replies that only 14, 30 or 90 days are available and still compares; `cachedAnswer("do not show me nobile rim 2")` is null; `siteByName(sites, "show me 2")` is null and "nobile 2" still matches.
- [ ] Implement; run; commit `fix(web): page phrasings, clamped replies, negation guard, digit weighting`.

### Task 5: Store, routes and pipeline minors

**Files:** Modify `web/src/lib/store/explore.ts`, `query.test.ts`, `web/src/app/api/chat/route.ts`, `route.test.ts`, `web/src/app/api/horizons/route.ts`, `route.test.ts`, `pipeline/lunar_pipeline/horizons.py`, `pipeline/tests/test_horizons.py`, `pipeline/lunar_pipeline/publish_r2.py`, `pipeline/tests/test_publish_r2.py`.

- [ ] Tests: selecting a polar site after a mare site restores the terrain view when the globe was switched automatically (and leaves a user-chosen globe alone); a `state` over 16 KB is treated as absent (200, no model prompt with it); `body=toString` on `/api/horizons` is 400; `write_summary` writes LF (no CRLF in the file); `publish` passes a `TransferConfig` with a 64 MB multipart threshold (fake client records `Config`).
- [ ] Implement; run; commit `fix: globe restore, state size bound, hasOwn on the proxy, LF summary, single-part R2 uploads`.

### Task 6: Learn mode on Compare; Mazarico copy

**Files:** Modify `web/src/components/CompareView.tsx`, `CompareView.rows.test.tsx`, `web/src/components/ValidateView.tsx`, `ValidateView.test.tsx`.

- [ ] Tests: in Learn mode a Compare column shows only the four Learn rows; the Mazarico verdict line says the misses are probably the map's 60 m sampling of 20 m peaks ("likely").
- [ ] Implement; run; commit `fix(web): Learn mode filters Compare rows; Mazarico verdict phrased as a hypothesis`.

### Task 7: Gates, live re-check, closeout

- [ ] `npm run validation:tests`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, `uv run pytest -q`; Playwright: live planner question shows a real reply and "answered by …"; narrated brief live; update `docs/submission.md` counts; review package, fresh reviewer, fix pass, PR #8 against `main`, merge on green.
