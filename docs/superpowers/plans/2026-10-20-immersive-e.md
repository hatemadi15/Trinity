# Part E: The Answer First and the Way to the Evidence, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spec section 19: the stand view's answer first on every screen, the first step shown once on arrival, the links to How it works and Accuracy, named landers with one Close, the words both readers named, a brighter Brighter picture, and the cheapest of the final review's deferred minors; measured at the eight sizes and read once by both readers.

**Architecture:** The words live in `web/src/lib/viz/stand.ts` (the headline's phone form, the first step's lines), `lib/viz/arrival.ts` and `components/home/Arrival.tsx` (the home page). The plate's order, the hint's state and the links are in `components/stand/StandView.tsx`; the time bar's `onPlay` and the flags' gap in `components/explore/TimeBar.tsx` (`momentRows`); the landers in `lib/lander.ts` and `components/explore/LanderDialog.tsx`; the exposure in `lib/sky/standRenderer.ts` (`toneExposure`). The nav's entries move to `lib/nav.ts` so the stand view can read them without AppFrame.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, vitest 5 with jsdom and Testing Library 16, three.js 0.186; Playwright with headless Chromium for the frames.

**Spec:** `docs/superpowers/specs/2026-10-02-immersive-space-design.md`, section 19 (part E), with 18.8 (the asks), 16.5 and 18.3 (the phone's band), 15.1 (the measurements), 13.2 (the gate).

## Scope

This plan covers part E (spec 19). Of 18.8 it leaves the crater shadows, the lander's look, the flight's black half, a projector mode beyond Brighter picture, the five-step lesson, the survival verdict and exact times on the flags. Deploy readiness (the data base, the plain error words, `?bright=1`, the hosting and demo docs) went first in its own pull request.

## Global Constraints

- Gates from `web/`: `npx vitest run --maxWorkers=2`, `npx tsc --noEmit`, `npm run lint` (one old warning, `SkyRow.tsx:113`), `npm run build`, `npm run validation:tests`.
- Spec 2: one gold action per screen (the better day's); no text under 13 px (the chip's 14 px stays); a pressed toggle's words never change (`StandView.tsx`, `PRESSED`).
- Spec 6 and `src/app/look.test.ts`: no keyframes or animation classes outside the arrival, no gradients, no glow; `words.test.ts` bans "hidden" in the arrival's beats.
- Spec 18.3 and 18.6: captions at most 112 characters; the phone's band at least 55 % at 390 × 844 and 50 % at 360 × 800 by day, measured from the chip's foot; the caption docked on the compass plate with a 0 px gap.
- Spec 11: no change to a computed number.
- Tests first: each rule's test runs red before its code. Subagents work in the worktree on their own files only, run their own test files (`npx vitest run <files> --maxWorkers=1`), and do not commit; the orchestrator commits each cluster.
- The frames and the blind read need the data mirror (`web/public/data`, git-ignored) and a GPU: they run on the laptop, not in the cloud checkout.

## Review Focus

1. **A period with no better day:** the plate's second row is Compare sites in gold, the phone shows no chip, the headline still leads. Tested in Task 5.
2. **The first step and the captions:** a flag's caption replaces the hint and the hint never returns; the 12 s timer clears captions, never the hint; reduced motion shows the drag alone; no hint over "Building the ground…". Tested in Task 5.
3. **The phone's plate:** the short headline fits two lines at 360 px; the state is the card's first line with its dot. Tested in Task 5, measured in Task 8.
4. **The landers' names everywhere:** the Explore field, Compare's button, the brief and the stand view's dialog read "Small lander: …" without a second "Lander:". Tested in Task 1.
5. **Flags 4 px apart:** the five-flag 538 px case still lays out in three rows, or the ledger says why not. Tested in Task 3.

## File map

| File | Task | What changes |
|---|---|---|
| `web/src/lib/lander.ts`, `lander.test.ts`, `components/explore/LanderDialog.tsx`, its test, `PeriodBand.tsx`, its test, `CompareView.tsx`, `lib/engine/power.ts` | 1 | The named presets, "Panel efficiency", the 30 % line, Done removed, the "Lander:" prefixes dropped |
| `web/src/components/home/Arrival.tsx`, `Arrival.test.tsx`, `lib/viz/arrival.ts`, `arrival.test.ts` | 2 | "Skip to the answer", "out of sight", the site's name from the data |
| `web/src/components/explore/TimeBar.tsx`, `TimeBar.test.tsx` | 3 | `onPlay`; `FLAG_GAP = 4` in `momentRows` |
| `web/src/lib/sky/standRenderer.ts`, its test | 4 | `BRIGHT_GAIN = 3` |
| `web/src/lib/viz/stand.ts`, `stand.test.ts` | 5 | `phoneHeadline`; `FIRST_STEP`, `FIRST_STEP_PHONE`, `FIRST_STEP_STILL` |
| `web/src/components/stand/StandView.tsx`, `StandView.test.tsx`, `lib/nav.ts`, `components/AppFrame.tsx` | 5 | The plate's order, the hint, the links, Show paths, the chip's plate and height, the card's chevron, the memoised turn |
| `docs/superpowers/specs/…immersive-space-design.md` (19), this plan's ledger, `web/README.md`, `docs/pitch.md`, `docs/demo-checklist.md`, `web/public/validation/tests.json` | 6, 9 | The spec as built, the ledger, the README's stand-view paragraph, the pitch's line, the badge |

## Tasks

### Task 1: The lander and the dialog (19.4)
- [ ] Tests red: the labels (`lander.test.ts`), the dialog's names and its 30 % line, "Panel efficiency (%)", no Done (`LanderDialog.test.tsx`), the field's aria-label without "Lander:" (`PeriodBand.test.tsx`), the stand view's dialog closed by Close (`StandView.test.tsx`).
- [ ] The labels "Small lander: 4 m² panel, uses 200 W, 2 kWh battery", Medium, Large; `aria-label={`${lander}. Change`}` in PeriodBand and CompareView; the intro's sentence from `DEFAULT_POWER.efficiency`; "Panel efficiency"; the Done button removed.
- [ ] Green; `words.test.ts` and `ExploreView.test.tsx` still green; `tsc`, eslint.

### Task 2: The arrival's words (19.4)
- [ ] Tests red: Skip named "Skip to the answer" with the phone's "Skip" span (`Arrival.test.tsx`); "out of sight" in the intro and the beat (`Arrival.test.tsx`, `arrival.test.ts`); the shortlisted sentence for another hero site (`arrival.test.ts`).
- [ ] `aria-label` and the two spans on Skip (no `data-plate`); the two sentences; `POLE_SENTENCE` and `shortlistedSentence(name)` built inside `arrivalWords`.
- [ ] Green; `words.test.ts` green; `tsc`, eslint.

### Task 3: The time bar (19.2, 19.4)
- [ ] Test red: `onPlay` fires when Play starts and not on Pause, the slider, a key or a flag.
- [ ] The prop, called in the Play button when `!playing`.
- [ ] Tests red: two flags that would touch (0 px, 2 px) go to different rows; at 4 px they share one; the `faults` helper counts gaps under 4 px.
- [ ] `FLAG_GAP = 4` in `over` and `behind`; the five-flag 538 px case checked.
- [ ] Green; `tsc`, eslint.

### Task 4: Brighter picture (19.4)
- [x] Test red: `toneExposure(true, 1)` is 3.15 and three times the plain value.
- [x] `BRIGHT_GAIN = 3` with its reason.
- [x] Green; eslint. (commit 75db0bd)

### Task 5: The stand view (19.1, 19.2, 19.3, 19.4)
- [ ] `stand.test.ts` red: `phoneHeadline` on the January title, the "all 14 days" title, the "too little sunlight" titles and "No sunlight…"; the first step's lines under 112 characters, the still form without "Play".
- [ ] `phoneHeadline`, `FIRST_STEP`, `FIRST_STEP_PHONE`, `FIRST_STEP_STILL` in `stand.ts`; green.
- [ ] `StandView.test.tsx` red: the plate's order from 768 px (the headline, the next step, the state last) and on a phone (the short headline, the state in the card); the first step shown until the first drag, cleared for good by Play, replaced by a flag's caption, the drag alone under reduced motion, absent while the ground builds; the Sections links on the plate from 768 px and in the card; Show paths / Hide paths without `aria-pressed`; the chip's `data-plate` and `min-h-8`; the card's chevron.
- [ ] The plate's rows; `hint` state with `clearHint` passed as `onExplore` and `onPlay` and called in `face`, `faceLander`, `lookUp`, `onMoment` and the caption branch of `onCursor`; `overView`'s precedence; `lib/nav.ts` with AppFrame re-exporting; the nav markup twice; "Show paths"; the chip; the chevron; `useMemo` on `openingYaw`.
- [ ] Green (the whole file); `look.test.ts`, `words.test.ts` green; `tsc`, eslint.

### Task 6: The spec and the ledger
- [x] Spec 19.1 to 19.6 written; the ledger opened with the pre-flight rulings.

### Task 7: Full checks
- [ ] `npx vitest run --maxWorkers=2`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run validation:tests`; the counts in the ledger.

### Task 8: The frames (the laptop)
- [ ] The production build served on a fresh loopback host; the stand view at 1440 × 900, 1279 × 800, 1024 × 768, 960 × 600, 820 × 1180, 768 × 1024, 390 × 844 and 360 × 800, at hours 10 and 219, with More open, on arrival with the first step, after Play, and with `?bright=1`; per frame the band, the smallest text, the plates' overlaps and the caption's dock, the page's width, the console, the plate's height at 1440, the flags' gaps; the brightness numbers for 19.4 (the day frame's clipped share under 3 %, the night ground's mean above D3's 38 levels, else the gain at 2.5).
- [ ] The phone stills of the arrival recaptured.

### Task 9: The read and the close
- [ ] One blind read (judge and teacher) on the D3 frame set plus the first step and the card; one bounded fix pass; 19.6 as built with the measurements, the read and the asks carried on; the README's stand-view paragraph; the pitch's line; the badge; the pull request for the user's merge on green.
