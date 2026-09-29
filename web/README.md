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

- `/explore`: one site, one window; 3D terrain and globe, sky dome, timeline, planner settings, survive-the-night verdict, best-window finder.
- `/compare`: up to four sites over the same window and planner settings, one column per site.
- `/validate`: Horizons cross-check (live re-check through `/api/horizons`), LOLA map agreement, CLPS backcasts; `npm run validation:tests` refreshes the test-count badge in `public/validation/tests.json`.
- `/brief`: printable one-page mission brief for the selected site and window.
- `/learn`: Learn mode introduction; the header toggle switches Explore to the guided story.

## Engine additions (Week 4)

- `src/lib/engine/power.ts`: irradiance, panel geometries, battery simulation (`powerBudget`), pinned to `data/fixtures/power/` written by `pipeline/lunar_pipeline/power.py`.
- `src/lib/engine/metrics.ts`: `withCommsThreshold`, `contactWindows`, `windowScore`, and `Series.sunAu`.
