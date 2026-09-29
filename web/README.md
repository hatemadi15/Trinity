# Earthrise — web app

Next.js 16 app for the CLPS Lunar Mission Browser (NASA Space Apps 2026, team Astroy/Ed).

## Setup

    npm install
    # copy the pipeline artifacts (run from pipeline/): uv run python -m lunar_pipeline.cli sync-local --tiles
    npm run dev

`.npmrc` sets `legacy-peer-deps=true` because npm 10's peer resolver crashes on vitest 5's peer set.

## Engine

`src/lib/engine/` is a pure-TypeScript port of the Python pipeline science (no DOM, no React):
time (UTC ↔ TDB), geometry (ENU az/el with parallax, south polar stereographic), ephemeris
(Catmull-Rom over the hourly MOON_ME table), tiles (zlib int16 DEM tiles, bilinear sampler),
horizon (nested-grid skyline with fallback bands), metrics (sunlit / Earth-visible series,
prefix-sum window index, best-window search).

Parity gates (all in `npm test`): JPL Horizons az/el < 0.002° (achieved 2.7e-5°), Python masks
< 0.01° (achieved 0.0005°, the JSON rounding quantum), metrics fractions < 1e-6 (exact).
Demo: `npm run engine:demo -- --site shackleton_center_rim_high` (mask in about 2 s cold, under 1.5 s warm in Node; `computeSiteMask` also reports DEM coverage and any tiles that failed to load).

## Routes

- `/`: landing page with three mission cards that open Explore on a site and date (`/explore?site=&start=&days=`).
- `/explore`: one site, one window; 3D terrain and globe, sky dome, timeline, planner settings, survive-the-night verdict, best-window finder.
- `/compare`: up to four sites over the same window and planner settings, one column per site.
- `/validate`: Horizons cross-check (live re-check through `/api/horizons`), LOLA map agreement, CLPS backcasts; `npm run validation:tests` refreshes the test-count badge in `public/validation/tests.json`.
- `/brief`: printable one-page mission brief for the selected site and window.
- `/learn`: Learn mode introduction; the header toggle switches Explore to the guided story.
- `/api/chat`: the planner assistant (task `plan`) and the brief narrator (task `narrate`) on OpenRouter; see `.env.example`. Without a key, or with `?demo=1`, answers come from `src/lib/ai/transcripts.json` and the phrase matcher.

## AI layer (Week 6)

`src/lib/ai/`: `actions.ts` (closed action schema, validator, site matcher, `applyActions`), `intents.ts` (twelve rehearsed phrasings), `state-summary.ts` (the compact state sent with each question), `openrouter.ts` (model chain with timeouts), `protocol.ts` (system prompt, lenient JSON extraction, reply types), `cache.ts` + `transcripts.json` (rehearsed answers), `rate-limit.ts`, `narrate.ts` (number check and template brief), `client.ts` (browser calls). The catalogue the server validates against is `src/lib/data/catalogue.json`, written by the pipeline's `sync-local`.

## Engine additions (Week 4)

- `src/lib/engine/power.ts`: irradiance, panel geometries, battery simulation (`powerBudget`), pinned to `data/fixtures/power/` written by `pipeline/lunar_pipeline/power.py`.
- `src/lib/engine/metrics.ts`: `withCommsThreshold`, `contactWindows`, `windowScore`, and `Series.sunAu`.
