# Redesign part 4: Compare, Accuracy, How it works, the brief, cleanup and documents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The last four pages take the redesign's look and words (Compare as a table, Accuracy as three checks with pass marks, How it works with the home page's drawings and five new steps, the brief with the time chart's rows and the new verdict), the old components, tokens and the Learn audience go, the loose ends parts 2 and 3 left are closed, and the documents describe the product as it now is.

**Architecture:** Pure helpers in `web/src/lib/viz/` carry every new sentence and figure (tested on their own); the pages are thin React views over the existing store (`exploreStore`: `compare`, `sites`, `params`, `findBestWindow`). Compare reuses Explore's period controls and lander dialog; the brief reuses the time chart's `SkyRow` rows and the verdict's `answerFor`; How it works reuses the home page's three drawings. The assistant loses `set_audience` and gains `open_page "sites"`. Removals happen after the pages that used them are rebuilt.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind 4, zustand, vitest 5 + Testing Library; Python 3.12 pipeline untouched except docs.

**Spec:** `docs/superpowers/specs/2026-10-01-ui-redesign-design.md` (sections 6.4 to 6.7, 9, 10, 12, 13, 17).

## Global Constraints

- Plain words on screen; no instrument or programme names in page text (LOLA, DE440, Horizons, CLPS stay in credits and the Accuracy page).
- Moon's three tones: stage `#000`, page `#dedcd6` (light) / `#222220` (dark), surface `#fff` / `#2c2c2a`; colour only for the Sun (gold) and Earth (blue), green and red for the power verdict.
- Radii: stage 6 px, panels and controls 8 px, plates 5 px; no shadows, gradients or blur.
- No text under 14 px; controls at least 40 px tall; standalone links underlined.
- Numbers keep their unit on the same line (no-break space before "%").
- One gold action per screen.
- Durations: "12 days 15 hours" in sentences, "12 d 15 h" in tables (`spanShort`), never bare hours above 48.
- Every behaviour change starts with a failing test; gates from `web/`: `npx vitest run`, `npx tsc --noEmit`, `npm run lint`, `npm run build`; from `pipeline/`: `uv run pytest -q`.
- Never read, print or copy `web/.env.local`; no calls to OpenRouter or other paid APIs in tests.

## Review Focus

1. Compare with one site, with four, with a site that never sees the Sun, and with a mare site: the best-site sentence must not name a site for a measure where all are equal at zero, and ties name every tied site. Tests in Task 1.
2. The Accuracy page with the validation tables missing or the live re-check failing or timing out: the page explains and the stored comparison stays. Tests in Task 3.
3. The brief printed in the dark theme: the time chart's rows keep their stage colours and the words stay black on white. Tests in Task 4.
4. Old addresses and stored state: `localStorage` still holding `earthrise.audience`, an old link to `/learn`, the assistant asked "switch to learn mode": nothing breaks, the page simply has no mode. Tests in Task 5.
5. A rehearsed or cached assistant answer that still contains `set_audience`: it is dropped with a reason, the rest of the answer applies. Tests in Task 5.

## File map

| File | Responsibility |
|---|---|
| `web/src/lib/viz/compare.ts` | one table row per compared site; the best-site sentence; ready pairs |
| `web/src/components/compare/MiniStrip.tsx` | a small Sun and Earth strip for a table row |
| `web/src/components/CompareView.tsx` | the table, period controls, lander, add and remove, empty state, assistant |
| `web/src/lib/learn/story.ts` | five steps for the new screens |
| `web/src/app/learn/page.tsx` | How it works: three drawings, five steps, the way to `/sites` |
| `web/src/lib/viz/checks.ts` | the three checks' pass marks, headline figures and sentences |
| `web/src/components/ValidateView.tsx` | Accuracy: three checks with "Show the numbers", live re-check, error budget, test count |
| `web/src/components/BriefView.tsx` | the brief: new verdict and numbers, the Sun and Earth rows |
| `web/src/lib/ai/*`, `web/src/lib/store/explore.ts` | no audience; `open_page "sites"` |
| `web/src/lib/data/home.ts`, `web/src/components/explore/WhereOnMoon.tsx`, `web/src/app/page.tsx`, `web/src/components/explore/TimeBar.tsx`, `web/src/lib/shadow-client.ts` | loose ends of parts 2 and 3 |
| `README.md`, `web/README.md`, `docs/*.md` | the product as it is now |

---

### Task 1: Compare as a table

**Files:**
- Create: `web/src/lib/viz/compare.ts`, `web/src/lib/viz/compare.test.ts`, `web/src/components/compare/MiniStrip.tsx`
- Modify: `web/src/components/CompareView.tsx`, `web/src/components/CompareView.test.tsx`, `web/src/components/CompareView.rows.test.tsx`

**Interfaces:**
- Consumes: `SiteResult` (`site, series, summary, power, contacts, mastM, best, after`), `timeWithPower(power)`, `spanShort(h)`, `pct0`, `siteLabel`, `exploreHref(id, startUtc, days)`, `PeriodControls`, `LanderDialog`, `PlannerChat variant="panel"`.
- Produces: `compareRow(r: SiteResult, days: number): CompareRow` with `{ id, name, href, sunlight, earth, longestNight, power, verdict, tone }`; `bestSentence(rows: CompareRow[], results: SiteResult[]): string`; `READY_PAIRS: { title: string; ids: [string, string] }[]`.

- [ ] **Step 1: Write the failing tests.** `compare.test.ts`: a row gives "72 %" sunlight, "54 %" Earth, longest night `spanShort`, time with power "all 30 days" when there is no brownout or `spanShort(h)` otherwise, the verdict "Power for all 30 days" / "Power for 3 d 4 h, then night" / "No sunlight" with tones good / bad / bad. `bestSentence`: names the best site for each measure ("Most sunlight: A (72 %). Most contact with Earth: B (54 %). Longest time with power: A (all 30 days).") ; names every tied site ("A and B"); says "None of these sites sees Earth in these 30 days." when all are zero; one site: "One site so far: add another to compare." `CompareView.test.tsx`: a table with column heads Site, Sun and Earth, Sunlight, Earth in view, Longest night, Time with power, Verdict; one row per compared site with a Remove button named after the site and a link to Explore on the same period; the sentence above the table; the empty state shows two ready pairs, and pressing one adds both sites; the add-site control adds a site; Period and Lander controls; one gold button at most.
- [ ] **Step 2: Watch them fail.**
- [ ] **Step 3: Implement** `compare.ts`, `MiniStrip` (two 6 px rows on the stage, gold where the Sun shows, blue where Earth is in view, `role="img"` with a one-line description), and the new `CompareView` (`AppFrame`, `wrap`, h1 "Compare sites", a band with `PeriodControls` and the Lander button and dialog, the sentence, the table, "Add a site" select plus button, "Printable brief" link, the year search link when two or more sites are compared, the assistant panel). Ready pairs: de Gerlache Rim 2 with de Gerlache rim summit ("A ridge and the summit 12 km away"), Shackleton rim summit with Shackleton crater floor ("A rim in sunlight and a floor in shadow").
- [ ] **Step 4: Run** `npx vitest run src/lib/viz/compare.test.ts src/components/CompareView` ; tsc; lint.
- [ ] **Step 5: Commit** `feat(web): Compare is a table, with the best site for each measure in one sentence`.

### Task 2: How it works

**Files:**
- Modify: `web/src/lib/learn/story.ts`, `web/src/app/learn/page.tsx`
- Delete: `web/src/components/LearnStart.tsx`
- Test: `web/src/app/learn/page.test.tsx` (create)

**Interfaces:**
- Consumes: `SunNeverClimbs`, `HillsDecide`, `EarthSetsToo` and `HOME.pair` (home page).
- Produces: `STORY_STEPS` of five `{ title, body }` for the new screens.

- [ ] **Step 1: Write the failing test**: h1 "How it works"; the three drawings with their headings ("The Sun never climbs", "The hills decide", "Earth sets too"); five numbered steps in order: "Choose a landing site", "Read the answer", "See why, hour by hour", "Look at the ground", "Compare and check"; one sentence says times are in UTC and what that is; one gold link "Choose a landing site" to `/sites`; no "Learn mode" anywhere.
- [ ] **Step 2: Watch it fail.**
- [ ] **Step 3: Implement** the steps' words for the new screens and the page (drawings in the home page's cards, then the ordered steps, then the link).
- [ ] **Step 4: Run** the test; tsc; lint.
- [ ] **Step 5: Commit** `feat(web): How it works: the home page's three drawings and five steps for the new screens`.

### Task 3: Accuracy

**Files:**
- Create: `web/src/lib/viz/checks.ts`, `web/src/lib/viz/checks.test.ts`
- Modify: `web/src/components/ValidateView.tsx`, `web/src/components/ValidateView.test.tsx`

**Interfaces:**
- Consumes: `ValidationDocs` (`horizons`, `mazarico`, `backcasts`), the test badge.
- Produces: `checkCards(docs): CheckCard[]` with `{ id, question, pass: boolean, mark, figure, sentence }`.

- [ ] **Step 1: Write the failing tests.** `checks.test.ts`: the directions check passes when the worst difference is under the 0.01° target, its figure is the worst difference ("0.00003°"), its sentence says against what; the sunlight check's figure is the typical gap in points and it passes when most covered sites are within 5 points; the nights check's figure is the gap between Blue Ghost's last signal and the predicted sunset and it passes when every lander that ended at sunset did so within 6 hours. `ValidateView.test.tsx`: h1 "Accuracy"; three checks, each with its question as a heading, a pass mark in words with an icon, the figure, the sentence and a "Show the numbers" button that reveals the existing table (`aria-expanded`); the live re-check is in the first check and still reports its result or its failure; the error budget and the test count stay; the missing-tables message stays.
- [ ] **Step 2: Watch them fail.**
- [ ] **Step 3: Implement** `checks.ts` and the new view (page style, one gold button: "Re-check with JPL now").
- [ ] **Step 4: Run** the tests; tsc; lint.
- [ ] **Step 5: Commit** `feat(web): Accuracy: three checks, each with a pass mark, a figure, a sentence and its numbers on request`.

### Task 4: The brief

**Files:**
- Modify: `web/src/components/BriefView.tsx`, `web/src/components/BriefView.test.tsx`, `web/src/app/globals.css` (print rules for the stage rows)

**Interfaces:**
- Consumes: `answerFor`, `SkyRow`, `hillsToward`, `timeWithPower`, `NumbersCard`'s figures (`pct0`, `spanShort`).
- Produces: a brief whose verdict block is the answer's title and sentences, whose numbers are Sunlight, Contact with Earth, Longest night, Time with power, Battery when full, and whose chart is the Sun's and Earth's rows over the period with day labels.

- [ ] **Step 1: Write the failing test**: the brief shows the verdict title as Explore does ("Landing at de Gerlache Rim 2 on 1 January: power for 3 days 4 hours, then night") and its sentences; the five numbers with their words; two images named "The Sun over the 30 days from 1 January" and "Earth over the 30 days from 1 January"; no sky dial, no "Sun above the skyline"; the narration button and its label stay; the print button stays.
- [ ] **Step 2: Watch it fail.**
- [ ] **Step 3: Implement**; the rows print on black (`print-color-adjust: exact`).
- [ ] **Step 4: Run**; tsc; lint.
- [ ] **Step 5: Commit** `feat(web): the brief speaks like Explore and draws the Sun's and Earth's rows`.

### Task 5: No more audience; the old components and tokens go

**Files:**
- Modify: `web/src/lib/ai/actions.ts`, `intents.ts`, `protocol.ts`, `state-summary.ts`, `transcripts.json` and their tests; `web/src/lib/store/explore.ts` and its tests; `web/src/components/PlannerChat.tsx`; `web/src/app/globals.css`; `web/src/lib/viz/scene-state.ts`, `three-frames.ts`
- Delete: `SkyDome`, `Timeline`, `Sparkline`, `VerdictChip`, `WindowControls`, `PlannerParamsPanel` (with tests) once nothing imports them

**Interfaces:**
- Produces: `Page = 'explore' | 'sites' | 'compare' | 'validate' | 'brief' | 'learn'`; no `Audience`, `audience`, `setAudience`, `AUDIENCE_KEY`; `parseAction({ type: 'set_audience' })` returns a reason; `sunLight` returns `{ intensity }`.

- [ ] **Step 1: Write the failing tests**: `parseAction` rejects `set_audience` with "unknown action"; `open_page` accepts `sites`; the phrase "open the site list" (and "show sites") opens `/sites`; "switch to learn mode" is no longer matched; a transcript with a `set_audience` step applies its other steps; the store has no `audience`; a stored `earthrise.audience` is ignored; the CSS has no `.glass`, `--canvas`, `--panel`, `--sky`, `--night`, `--sun-bright`, `--terrain` (globals test).
- [ ] **Step 2: Watch them fail.**
- [ ] **Step 3: Implement** the removals; delete the unused components and their tests; PlannerChat keeps only the panel variant if the strip is unused.
- [ ] **Step 4: Run** the whole suite; tsc; lint; build.
- [ ] **Step 5: Commit** `refactor(web): the Learn audience, the old components and the old tokens are gone`.

### Task 6: Loose ends from parts 2 and 3

**Files:**
- Modify: `web/src/lib/data/home.ts` (+ `home.test.ts`, `src/app/page.test.tsx`), `web/src/components/explore/WhereOnMoon.tsx` (+ test), `web/src/app/page.tsx` (hero caption), `web/src/components/explore/TimeBar.tsx` (+ test), `web/src/lib/shadow-client.ts` (+ test)

- [ ] **Step 1: Write the failing tests**: the Blue Ghost card opens Explore at its landing hour (`start=2025-03-02T09:00` once the Sun is up there; checked against the series in the test); Where on the Moon lists no "nearby" site farther than 300 km and says so ("No other site in the list is within 300 km."); the home hero caption names the stripes ("Faint stripes are seams in the elevation data, not real ground."); the time bar's "Sun up" key shows on a phone (no `max-sm:hidden`); a shadow client whose worker fails answers from the inline sweep with the levels it was given.
- [ ] **Step 2: Watch them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the suite; tsc; lint.
- [ ] **Step 5: Commit** `fix(web): loose ends of parts 2 and 3`.

### Task 7: Documents

**Files:**
- Modify: `README.md`, `web/README.md`, `docs/submission.md`, `docs/pitch.md`, `docs/demo-checklist.md`, `docs/video-storyboard.md`, `docs/superpowers/specs/2026-10-01-ui-redesign-design.md` (section 18)

- [ ] **Step 1**: grep the documents for the old screens and words (sky dome, Learn mode, Planner/Learn, cockpit, Validate page, six KPIs, survive-the-night) and rewrite those passages for the current pages; the root README gets a short tour of the product instead of week-by-week lists.
- [ ] **Step 2**: badge (`npm run validation:tests`).
- [ ] **Step 3: Commit** `docs: the product as it now is`.

### Task 8: Look at it, measure it, read it blind

- [ ] Screenshots at 1440 by 900 (light and dark) and 390 of Compare (empty and with three sites), Accuracy (closed and with a table open), How it works and the brief (screen and print preview): no text under 14 px, no control under 40 px, no sideways scroll, no overlapping labels.
- [ ] Blind read of the four pages (two fresh readers, screenshots only; gate 4, 4, 4, 3, 3), fix what both name, repeat until it passes.
- [ ] Spec section 18 with the reads; ledger rulings; self-review against `code-reviewer.md`; pull request; merge on green.
